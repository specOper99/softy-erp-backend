import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, UpdateResult } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { User } from '../domain/entities/user.entity';

/**
 * UserRepository — tenant-scoped by default via TenantAwareRepository.
 *
 * Auth bootstrap (login / MFA / password reset) must resolve users before
 * request tenant context exists. Those paths use the explicit *Global helpers
 * below, which intentionally call the underlying TypeORM repository without
 * applying tenant scope. Do not expose those helpers to controllers.
 */
@Injectable()
export class UserRepository extends TenantAwareRepository<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository);
  }

  /** Cross-tenant email lookup for auth bootstrap (pre-tenant-context). */
  async findByEmailGlobal(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  /** Cross-tenant email lookup including MFA secret column. */
  async findByEmailWithMfaSecretGlobal(email: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.mfaSecret')
      .andWhere('user.email = :email', { email })
      .getOne();
  }

  /** Cross-tenant id lookup including MFA recovery codes. */
  async findByIdWithRecoveryCodesGlobal(userId: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.mfaRecoveryCodes')
      .andWhere('user.id = :userId', { userId })
      .getOne();
  }

  /**
   * Password-hash upgrade during login may run before tenant context is set.
   * Prefer wrapping callers in TenantContextService.run(user.tenantId, ...) and
   * using scoped `update` when context is available; this helper is the fallback
   * for pre-context auth flows.
   */
  async updatePasswordHashGlobal(userId: string, passwordHash: string): Promise<UpdateResult> {
    return this.repository.update({ id: userId }, { passwordHash });
  }
}
