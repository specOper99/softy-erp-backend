import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../common/common.module';
import { Tenant } from '../tenants/domain/entities/tenant.entity';
import { UsersController } from './api/users.controller';
import { User } from './domain/entities/user.entity';
import { UserRepository } from './infrastructure/user.repository';
import { UsersService } from './application/users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Tenant]), CommonModule],
  controllers: [UsersController],
  providers: [UsersService, UserRepository],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
