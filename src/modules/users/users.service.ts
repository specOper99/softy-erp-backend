import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { EntityManager, Repository } from 'typeorm';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context missing');
    }

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
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
        throw new ConflictException('Email already registered');
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
    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
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
      relations: ['profile', 'wallet'],
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findOne(id: string): Promise<User> {
    const tenantId = TenantContextService.getTenantId();
    const user = await this.userRepository.findOne({
      where: { id, tenantId },
      relations: ['profile', 'wallet'],
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string, tenantId?: string): Promise<User | null> {
    void tenantId;
    return this.userRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const oldValues = { role: user.role, isActive: user.isActive };

    Object.assign(user, updateUserDto);
    const savedUser = await this.userRepository.save(user);

    // Log role or status changes
    if (
      updateUserDto.role !== undefined ||
      updateUserDto.isActive !== undefined
    ) {
      await this.auditService.log({
        action: 'UPDATE',
        entityName: 'User',
        entityId: id,
        oldValues,
        newValues: { role: savedUser.role, isActive: savedUser.isActive },
        notes:
          updateUserDto.role !== undefined &&
          updateUserDto.role !== oldValues.role
            ? `Role changed from ${oldValues.role} to ${savedUser.role}`
            : updateUserDto.isActive !== undefined &&
                updateUserDto.isActive !== oldValues.isActive
              ? `Account ${savedUser.isActive ? 'activated' : 'deactivated'}`
              : undefined,
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
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }
}
