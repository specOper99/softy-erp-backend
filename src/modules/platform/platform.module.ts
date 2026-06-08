import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformUser } from './entities/platform-user.entity';

/**
 * Platform (superadmin) module.
 *
 * Currently exposes only the PlatformUser entity so that the platform auth
 * layer and CLI tools (e.g. `npm run platform:create-admin`) can resolve its
 * repository. Auth, MFA, and session services will be added here as the
 * platform layer is built out.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PlatformUser])],
  exports: [TypeOrmModule],
})
export class PlatformModule {}
