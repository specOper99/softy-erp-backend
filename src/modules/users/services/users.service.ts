import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CursorAuthService } from '../../../common/services/cursor-auth.service';
import { PasswordHashService } from '../../../common/services/password-hash.service';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditPublisher } from '../../audit/audit.publisher';
import { CreateUserDto, UpdateUserDto } from '../dto';
import { User } from '../entities/user.entity';
import { UserDeletedEvent } from '../events/user-deleted.event';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  private static readonly MAX_FIND_MANY_IDS = 1000;

  constructor(
    private readonly userRepository: UserRepository,
    @InjectRepository(User) private readonly rawUserRepository: Repository<User>,
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

  async findAll(query: PaginationDto = new PaginationDto()): Promise<User[]> {
    return this.userRepository.find({
      where: {},
      relations: ['wallet'],
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findAllCursor(query: CursorPaginationDto): Promise<{ data: User[]; nextCursor: string | null }> {
    const limit = query.limit || 20;

    const qb = this.userRepository.createQueryBuilder('user');

    qb.leftJoinAndSelect('user.wallet', 'wallet')
      .where('user.tenantId = :tenantId', { tenantId: TenantContextService.getTenantIdOrThrow() })
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .take(limit + 1);

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
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['wallet'],
    });
    if (!user) {
      throw new NotFoundException('common.user_not_found');
    }
    return user;
  }

  async findByEmail(email: string, tenantId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email, tenantId } });
  }

  async findByEmailGlobal(email: string): Promise<User | null> {
    return this.rawUserRepository.findOne({ where: { email } });
  }

  async findMany(ids: string[]): Promise<User[]> {
    if (!ids.length) return [];

    if (ids.length > UsersService.MAX_FIND_MANY_IDS) {
      throw new BadRequestException('common.too_many_ids');
    }

    const qb = this.userRepository.createQueryBuilder('user').andWhere('user.id IN (:...ids)', { ids });

    return qb.getMany();
  }

  async findByEmailWithMfaSecret(email: string, tenantId?: string): Promise<User | null> {
    const qb = this.userRepository.createQueryBuilder('user').andWhere('user.email = :email', { email });

    if (tenantId) {
      qb.andWhere('user.tenantId = :tenantId', { tenantId });
    }

    return qb.addSelect('user.mfaSecret').getOne();
  }

  async findByIdWithMfaSecret(userId: string): Promise<User | null> {
    const qb = this.userRepository.createQueryBuilder('user').andWhere('user.id = :userId', { userId });

    return qb.addSelect('user.mfaSecret').getOne();
  }

  async findByIdWithRecoveryCodes(userId: string): Promise<User | null> {
    const qb = this.userRepository.createQueryBuilder('user');
    const tenantId = TenantContextService.getTenantId();

    qb.where('user.id = :userId', { userId });
    if (tenantId) {
      qb.andWhere('user.tenantId = :tenantId', { tenantId });
    }

    return qb.addSelect('user.mfaRecoveryCodes').getOne();
  }

  async findByIdWithRecoveryCodesGlobal(userId: string): Promise<User | null> {
    return this.rawUserRepository
      .createQueryBuilder('user')
      .addSelect('user.mfaRecoveryCodes')
      .where('user.id = :userId', { userId })
      .getOne();
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

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);

    await this.auditService.log({
      action: 'DELETE',
      entityName: 'User',
      entityId: id,
      oldValues: { email: user.email, role: user.role },
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
        await this.rawUserRepository.update({ id: user.id }, { passwordHash: result.newHash });
        this.logger.log(`Password hash upgraded to Argon2id for user ${user.id}`);
      } catch (error) {
        // Log but don't fail - hash upgrade is non-critical
        this.logger.warn(`Failed to upgrade password hash for user ${user.id}`, error);
      }
    }

    return result.valid;
  }
}
