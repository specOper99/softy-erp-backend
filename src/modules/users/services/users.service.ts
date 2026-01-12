import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from '../dto';
import { User } from '../entities/user.entity';
import { UserDeletedEvent } from '../events/user-deleted.event';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 12);
    const user = this.userRepository.create({
      email: createUserDto.email,
      passwordHash,
      role: createUserDto.role,
      tenantId,
    });
    let savedUser: User;
    try {
      savedUser = await this.userRepository.save(user);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === '23505'
      ) {
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

  async createWithManager(
    manager: EntityManager,
    createUserDto: CreateUserDto & { tenantId: string },
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(createUserDto.password, 12);
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
    const tenantId = TenantContextService.getTenantId();
    return this.userRepository.find({
      where: { tenantId },
      relations: ['wallet'],
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findAllCursor(
    query: CursorPaginationDto,
  ): Promise<{ data: User[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantId();
    const limit = query.limit || 20;

    const qb = this.userRepository.createQueryBuilder('user');

    qb.leftJoinAndSelect('user.wallet', 'wallet')
      .where('user.tenantId = :tenantId', { tenantId })
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, 'base64').toString('utf-8');
      const [dateStr, id] = decoded.split('|');
      const date = new Date(dateStr);

      qb.andWhere(
        '(user.createdAt < :date OR (user.createdAt = :date AND user.id < :id))',
        { date, id },
      );
    }

    const users = await qb.getMany();
    let nextCursor: string | null = null;

    if (users.length > limit) {
      users.pop();
      const lastItem = users[users.length - 1];
      const cursorData = `${lastItem.createdAt.toISOString()}|${lastItem.id}`;
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    return { data: users, nextCursor };
  }

  async findOne(id: string): Promise<User> {
    const tenantId = TenantContextService.getTenantId();
    const user = await this.userRepository.findOne({
      where: { id, tenantId },
      relations: ['wallet'],
    });
    if (!user) {
      throw new NotFoundException('common.user_not_found');
    }
    return user;
  }

  async findByEmail(email: string, tenantId?: string): Promise<User | null> {
    const where: FindOptionsWhere<User> = { email };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    return this.userRepository.findOne({ where });
  }

  async findMany(ids: string[]): Promise<User[]> {
    if (!ids.length) return [];

    const tenantId = TenantContextService.getTenantId();
    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.id IN (:...ids)', { ids });

    if (tenantId) {
      qb.andWhere('user.tenantId = :tenantId', { tenantId });
    }

    return qb.getMany();
  }

  async findByEmailWithMfaSecret(
    email: string,
    tenantId?: string,
  ): Promise<User | null> {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email });

    if (tenantId) {
      qb.andWhere('user.tenantId = :tenantId', { tenantId });
    }

    return qb.addSelect('user.mfaSecret').getOne();
  }

  async findByIdWithRecoveryCodes(userId: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .addSelect('user.mfaRecoveryCodes')
      .getOne();
  }

  async updateMfaSecret(
    userId: string,
    secret: string | null,
    enabled: boolean,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      mfaSecret: secret ?? undefined,
      isMfaEnabled: enabled,
    });
  }

  async updateMfaRecoveryCodes(userId: string, codes: string[]): Promise<void> {
    await this.userRepository.update(userId, {
      mfaRecoveryCodes: codes,
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const oldValues = { role: user.role, isActive: user.isActive };

    // SECURITY: Explicit field assignment to prevent mass assignment attacks
    // Only allow safe fields to be updated - never assign isAdmin or sensitive role fields directly
    const allowedFields = [
      'email',
      'role',
      'isActive',
      'emailVerified',
    ] as const;
    for (const field of allowedFields) {
      if (updateUserDto[field] !== undefined) {
        (user as unknown as Record<string, unknown>)[field] =
          updateUserDto[field];
      }
    }
    const savedUser = await this.userRepository.save(user);

    // Log role or status changes
    if (
      updateUserDto.role !== undefined ||
      updateUserDto.isActive !== undefined
    ) {
      // Determine audit note based on what changed
      let auditNote: string | undefined;
      if (
        updateUserDto.role !== undefined &&
        updateUserDto.role !== oldValues.role
      ) {
        auditNote = `Role changed from ${oldValues.role} to ${savedUser.role}`;
      } else if (
        updateUserDto.isActive !== undefined &&
        updateUserDto.isActive !== oldValues.isActive
      ) {
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

    this.eventBus.publish(
      new UserDeletedEvent(user.id, user.tenantId, user.email),
    );
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }
}
