import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { CursorAuthService } from '../../../common/services/cursor-auth.service';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { applyIlikeSearch } from '../../../common/utils/ilike-escape.util';
import { AuditPublisher } from '../../audit/application/audit.publisher';
import { EmployeeWallet } from '../../finance/domain/entities/employee-wallet.entity';
import { CreateUserDto, UpdateUserDto, UserFilterDto } from '../api/dto';
import { User } from '../domain/entities/user.entity';
import { Role } from '../domain/enums/role.enum';
import { UserCreatedEvent } from '../domain/events/user-created.event';
import { UserDeactivatedEvent } from '../domain/events/user-deactivated.event';
import { UserDeletedEvent } from '../domain/events/user-deleted.event';
import { UserRepository } from '../infrastructure/user.repository';

/**
 * UsersService manages user entities via UserRepository (TenantAwareRepository).
 *
 * Tenant-scoped CRUD uses the repository's default tenant filtering.
 * Auth bootstrap methods (`findByEmailGlobal`, `findByEmailWithMfaSecretGlobal`,
 * `findByIdWithRecoveryCodesGlobal`) delegate to explicit UserRepository global
 * helpers — required before request tenant context exists. Do not call those
 * from controllers.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  private static readonly MAX_FIND_MANY_IDS = 1000;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly auditService: AuditPublisher,
    private readonly eventBus: EventBus,
    private readonly passwordHashService: PasswordHashService,
    private readonly cursorAuthService: CursorAuthService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Use Argon2id instead of deprecated bcrypt
    const passwordHash = await this.passwordHashService.hash(createUserDto.password);
    const user = this.userRepository.create({
      email: createUserDto.email,
      passwordHash,
      role: createUserDto.role,
    });
    let savedUser: User;
    try {
      savedUser = await this.userRepository.save(user);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === '23505') {
        throw new ConflictException('auth.email_already_registered');
      }
      throw error;
    }

    await this.auditService.log({
      action: 'CREATE',
      entityName: 'User',
      entityId: savedUser.id,
      newValues: { email: savedUser.email, role: savedUser.role },
    });

    // Publish UserCreatedEvent for onboarding workflows
    this.eventBus.publish(
      new UserCreatedEvent(
        savedUser.id,
        savedUser.tenantId,
        savedUser.email,
        savedUser.role,
        undefined,
        savedUser.createdAt,
      ),
    );

    return savedUser;
  }

  async createWithManager(manager: EntityManager, createUserDto: CreateUserDto & { tenantId: string }): Promise<User> {
    // Use Argon2id instead of deprecated bcrypt
    const passwordHash = await this.passwordHashService.hash(createUserDto.password);
    const user = manager.create(User, {
      email: createUserDto.email,
      passwordHash,
      role: createUserDto.role,
      tenantId: createUserDto.tenantId,
    });
    const savedUser = await manager.save(user);

    // Note: Audit logging is done outside transaction to avoid
    // complications if the transaction rolls back
    return savedUser;
  }

  async findAll(query: UserFilterDto = new UserFilterDto()): Promise<User[]> {
    this.normalizeUserFilters(query);
    const qb = this.userRepository.createQueryBuilder('user');

    qb.leftJoinAndMapOne(
      'user.wallet',
      EmployeeWallet,
      'wallet',
      'wallet.userId = user.id AND wallet.tenantId = user.tenantId',
    )
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC');

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive: query.isActive });
    }

    if (query.search?.trim()) {
      applyIlikeSearch(qb, ['user.email'], query.search.trim());
    }

    qb.skip(query.getSkip()).take(query.getTake());

    return qb.getMany();
  }

  async findAllCursor(query: UserFilterDto): Promise<{ data: User[]; nextCursor: string | null }> {
    this.normalizeUserFilters(query);
    const limit = query.limit || 20;

    const qb = this.userRepository.createQueryBuilder('user');

    qb.leftJoinAndMapOne(
      'user.wallet',
      EmployeeWallet,
      'wallet',
      'wallet.userId = user.id AND wallet.tenantId = user.tenantId',
    )
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .take(limit + 1);

    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive: query.isActive });
    }

    if (query.search?.trim()) {
      applyIlikeSearch(qb, ['user.email'], query.search.trim());
    }

    if (query.cursor) {
      // Use authenticated cursor decoding to prevent cursor manipulation attacks
      const parsed = this.cursorAuthService.parseUserCursor(query.cursor);
      if (!parsed) {
        // Invalid or tampered cursor - return empty result
        return { data: [], nextCursor: null };
      }
      const { date, id } = parsed;

      qb.andWhere('(user.createdAt < :date OR (user.createdAt = :date AND user.id < :id))', { date, id });
    }

    const users = await qb.getMany();
    let nextCursor: string | null = null;

    if (users.length > limit) {
      users.pop();
      const lastItem = users.at(-1);
      if (!lastItem) {
        return { data: users, nextCursor: null };
      }
      // Use authenticated cursor encoding
      nextCursor = this.cursorAuthService.createUserCursor(lastItem.createdAt, lastItem.id);
    }

    return { data: users, nextCursor };
  }

  async findOne(id: string): Promise<User> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndMapOne(
        'user.wallet',
        EmployeeWallet,
        'wallet',
        'wallet.userId = user.id AND wallet.tenantId = user.tenantId',
      )
      .andWhere('user.id = :id', { id });

    const user = await qb.getOne();
    if (!user) {
      throw new NotFoundException('common.user_not_found');
    }

    return user;
  }

  async findByEmail(email: string, tenantId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email, tenantId } });
  }

  async findByEmailGlobal(email: string): Promise<User | null> {
    return this.userRepository.findByEmailGlobal(email);
  }

  async findMany(ids: string[]): Promise<User[]> {
    if (!ids.length) return [];

    if (ids.length > UsersService.MAX_FIND_MANY_IDS) {
      throw new BadRequestException('common.too_many_ids');
    }

    const qb = this.userRepository.createQueryBuilder('user').andWhere('user.id IN (:...ids)', { ids });

    return qb.getMany();
  }

  /** Return all active users whose role is in `roles` within the current tenant context. */
  async findByRoles(roles: Role[]): Promise<User[]> {
    if (!roles.length) return [];
    return this.userRepository.find({
      where: roles.map((role) => ({ role, isActive: true })),
    });
  }

  async findByEmailWithMfaSecret(email: string, tenantId?: string): Promise<User | null> {
    const resolvedTenantId = tenantId || TenantContextService.getTenantIdOrThrow();
    const qb = this.userRepository
      .createQueryBuilder('user')
      .andWhere('user.email = :email', { email })
      .andWhere('user.tenantId = :tenantId', { tenantId: resolvedTenantId });

    return qb.addSelect('user.mfaSecret').getOne();
  }

  async findByEmailWithMfaSecretGlobal(email: string): Promise<User | null> {
    return this.userRepository.findByEmailWithMfaSecretGlobal(email);
  }

  async findByIdWithMfaSecret(userId: string): Promise<User | null> {
    const qb = this.userRepository.createQueryBuilder('user').andWhere('user.id = :userId', { userId });

    return qb.addSelect('user.mfaSecret').getOne();
  }

  async findByIdWithRecoveryCodes(userId: string): Promise<User | null> {
    const qb = this.userRepository.createQueryBuilder('user').andWhere('user.id = :userId', { userId });

    return qb.addSelect('user.mfaRecoveryCodes').getOne();
  }

  async findByIdWithRecoveryCodesGlobal(userId: string): Promise<User | null> {
    return this.userRepository.findByIdWithRecoveryCodesGlobal(userId);
  }

  async updateMfaSecret(userId: string, secret: string | null, enabled: boolean): Promise<void> {
    await this.userRepository.update(
      { id: userId },
      {
        mfaSecret: secret ?? undefined,
        isMfaEnabled: enabled,
      },
    );
  }

  async updateMfaRecoveryCodes(userId: string, codes: string[]): Promise<void> {
    await this.userRepository.update(
      { id: userId },
      {
        mfaRecoveryCodes: codes,
      },
    );
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const oldValues = { role: user.role, isActive: user.isActive };

    // SECURITY: Explicit field assignment to prevent mass assignment attacks
    // Only allow safe fields to be updated - never assign isAdmin or sensitive role fields directly
    const allowedFields = ['email', 'role', 'isActive', 'emailVerified'] as const;
    for (const field of allowedFields) {
      if (updateUserDto[field] !== undefined) {
        (user as unknown as Record<string, unknown>)[field] = updateUserDto[field];
      }
    }
    const savedUser = await this.userRepository.save(user);

    if (oldValues.isActive && savedUser.isActive === false) {
      this.eventBus.publish(new UserDeactivatedEvent(savedUser.id, savedUser.tenantId));
    }

    // Log role or status changes
    if (updateUserDto.role !== undefined || updateUserDto.isActive !== undefined) {
      // Determine audit note based on what changed
      let auditNote: string | undefined;
      if (updateUserDto.role !== undefined && updateUserDto.role !== oldValues.role) {
        auditNote = `Role changed from ${oldValues.role} to ${savedUser.role}`;
      } else if (updateUserDto.isActive !== undefined && updateUserDto.isActive !== oldValues.isActive) {
        auditNote = `Account ${savedUser.isActive ? 'activated' : 'deactivated'}`;
      }

      await this.auditService.log({
        action: 'UPDATE',
        entityName: 'User',
        entityId: id,
        oldValues,
        newValues: { role: savedUser.role, isActive: savedUser.isActive },
        notes: auditNote,
      });
    }

    return savedUser;
  }

  async remove(id: string, reason?: string): Promise<void> {
    const user = await this.findOne(id);

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'User',
      entityId: id,
      oldValues: { email: user.email, role: user.role },
      ...(reason ? { newValues: { reason } } : {}),
    });

    await this.userRepository.softRemove(user);

    this.eventBus.publish(new UserDeletedEvent(user.id, user.tenantId, user.email));
  }

  /**
   * Validate user password with automatic hash upgrade.
   *
   * If the user has a legacy bcrypt hash, it will be automatically
   * upgraded to Argon2id upon successful verification.
   */
  async validatePassword(user: User, password: string): Promise<boolean> {
    const result = await this.passwordHashService.verifyAndUpgrade(user.passwordHash, password);

    // If hash was upgraded from bcrypt to Argon2id, update database
    if (result.valid && result.newHash && result.upgraded) {
      try {
        const contextTenantId = TenantContextService.getTenantId();
        if (contextTenantId && contextTenantId === user.tenantId) {
          await this.userRepository.update({ id: user.id }, { passwordHash: result.newHash });
        } else if (user.tenantId) {
          // Login / pre-auth: establish the user's tenant then use scoped update
          await TenantContextService.run(user.tenantId, async () => {
            await this.userRepository.update({ id: user.id }, { passwordHash: result.newHash! });
          });
        } else {
          await this.userRepository.updatePasswordHashGlobal(user.id, result.newHash);
        }
        this.logger.log(`Password hash upgraded to Argon2id for user ${user.id}`);
      } catch (error) {
        // Log but don't fail - hash upgrade is non-critical
        this.logger.warn(`Failed to upgrade password hash for user ${user.id}`, error);
      }
    }

    return result.valid;
  }

  private normalizeUserFilters(query: UserFilterDto): void {
    if (query.isActive !== undefined || query.status === undefined) {
      return;
    }

    query.isActive = query.status === 'active';
  }
}
