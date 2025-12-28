import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
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
    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      email: createUserDto.email,
      passwordHash,
      role: createUserDto.role,
      tenantId: createUserDto['tenantId'], // Passed optionally or securely
    });
    const savedUser = await this.userRepository.save(user);

    await this.auditService.log({
      action: 'CREATE',
      entityName: 'User',
      entityId: savedUser.id,
      newValues: { email: savedUser.email, role: savedUser.role },
    });

    return savedUser;
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      relations: ['profile', 'wallet'],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['profile', 'wallet'],
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string, tenantId?: string): Promise<User | null> {
    const where: { email: string; tenantId?: string } = { email };
    if (tenantId) where.tenantId = tenantId;
    return this.userRepository.findOne({ where });
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
