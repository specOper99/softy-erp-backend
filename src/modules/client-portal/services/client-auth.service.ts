import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Counter } from 'prom-client';
import { Repository } from 'typeorm';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Client } from '../../bookings/entities/client.entity';
import { MailService } from '../../mail/mail.service';

export interface ClientTokenPayload {
  sub: string; // client ID
  email: string;
  tenantId: string;
  type: 'client';
}

@Injectable()
export class ClientAuthService {
  private readonly TOKEN_EXPIRY_HOURS = 24;
  private readonly SESSION_EXPIRY_SECONDS: number;
  private readonly clientRepository: TenantAwareRepository<Client>;

  // Metrics
  private readonly magicLinkRequestedCounter = new Counter({
    name: 'auth_client_magic_link_requested_total',
    help: 'Total number of client magic link requests',
    labelNames: ['tenant_id', 'status'],
  });

  private readonly magicLinkVerifiedCounter = new Counter({
    name: 'auth_client_magic_link_verified_total',
    help: 'Total number of client magic link verifications',
    labelNames: ['tenant_id', 'status'],
  });

  constructor(
    @InjectRepository(Client)
    baseRepository: Repository<Client>,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.clientRepository = new TenantAwareRepository(baseRepository);
    this.SESSION_EXPIRY_SECONDS = this.configService.get<number>(
      'auth.clientSessionExpires',
      3600, // 1 hour default
    );
  }

  /**
   * Hash a token using SHA-256 for secure storage
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Timing-safe comparison of token hashes to prevent timing attacks
   */
  private compareHashes(hash1: string, hash2: string): boolean {
    const buf1 = Buffer.from(hash1, 'hex');
    const buf2 = Buffer.from(hash2, 'hex');
    if (buf1.length !== buf2.length) return false;
    return timingSafeEqual(buf1, buf2);
  }

  async requestMagicLink(email: string): Promise<{ message: string }> {
    // SECURITY: Tenant context is enforced by TenantAwareRepository
    const tenantId = TenantContextService.getTenantId();

    try {
      const client = await this.clientRepository.findOne({
        where: { email },
      });

      if (!client) {
        this.magicLinkRequestedCounter.inc({
          tenant_id: tenantId,
          status: 'not_found',
        });
        return { message: 'If an account exists, a magic link has been sent.' };
      }

      // Generate secure token
      const token = randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(token);
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + this.TOKEN_EXPIRY_HOURS);

      client.accessTokenHash = tokenHash;
      client.accessTokenExpiry = expiry;
      await this.clientRepository.save(client);

      await this.mailService.sendMagicLink({
        clientEmail: client.email,
        clientName: client.name,
        token,
        expiresInHours: this.TOKEN_EXPIRY_HOURS,
      });

      this.magicLinkRequestedCounter.inc({
        tenant_id: tenantId,
        status: 'success',
      });
      return { message: 'If an account exists, a magic link has been sent.' };
    } catch (error) {
      this.magicLinkRequestedCounter.inc({
        tenant_id: tenantId,
        status: 'error',
      });
      throw error;
    }
  }

  async verifyMagicLink(
    token: string,
  ): Promise<{ accessToken: string; expiresIn: number; client: Client }> {
    const tenantId = TenantContextService.getTenantId();
    const tokenHash = this.hashToken(token);

    try {
      const client = await this.clientRepository.findOne({
        where: { accessTokenHash: tokenHash },
      });

      if (!client) {
        this.magicLinkVerifiedCounter.inc({
          tenant_id: tenantId,
          status: 'invalid_token',
        });
        throw new NotFoundException('Invalid or expired token');
      }

      if (!client.isAccessTokenValid()) {
        this.magicLinkVerifiedCounter.inc({
          tenant_id: tenantId,
          status: 'expired',
        });
        throw new UnauthorizedException('Token has expired');
      }

      if (!this.compareHashes(tokenHash, client.accessTokenHash!)) {
        this.magicLinkVerifiedCounter.inc({
          tenant_id: tenantId,
          status: 'hash_mismatch',
        });
        throw new UnauthorizedException('Invalid token');
      }

      client.accessTokenHash = null;
      client.accessTokenExpiry = null;
      await this.clientRepository.save(client);

      const payload: ClientTokenPayload = {
        sub: client.id,
        email: client.email,
        tenantId: client.tenantId,
        type: 'client',
      };

      const accessToken = this.jwtService.sign(payload, {
        expiresIn: this.SESSION_EXPIRY_SECONDS,
      });

      this.magicLinkVerifiedCounter.inc({
        tenant_id: tenantId,
        status: 'success',
      });

      return {
        accessToken,
        expiresIn: this.SESSION_EXPIRY_SECONDS,
        client,
      };
    } catch (error) {
      if (
        !(error instanceof NotFoundException) &&
        !(error instanceof UnauthorizedException)
      ) {
        this.magicLinkVerifiedCounter.inc({
          tenant_id: tenantId,
          status: 'error',
        });
      }
      throw error;
    }
  }

  async validateClientToken(token: string): Promise<Client | null> {
    try {
      // Check blacklist first
      const tokenHash = this.hashToken(token);
      const isBlacklisted = await this.cacheManager.get(
        `blacklist:${tokenHash}`,
      );
      if (isBlacklisted) {
        return null; // Revoked
      }

      const payload = this.jwtService.verify<ClientTokenPayload>(token);

      if (payload.type !== 'client') {
        return null;
      }

      const tenantId = TenantContextService.getTenantId();
      if (tenantId && payload.tenantId !== tenantId) {
        return null;
      }

      let client: Client | null = null;

      await TenantContextService.run(payload.tenantId, async () => {
        client = await this.clientRepository.findOne({
          where: { id: payload.sub },
        });
      });

      return client;
    } catch {
      return null;
    }
  }

  async logout(token: string): Promise<void> {
    try {
      const decodedUnknown: unknown = this.jwtService.decode(token);
      // Defensive checks to avoid unsafe `any` usage
      if (
        !decodedUnknown ||
        typeof decodedUnknown !== 'object' ||
        decodedUnknown === null
      )
        return;

      const exp = (decodedUnknown as { exp?: number }).exp;
      if (!exp || typeof exp !== 'number') return;

      const now = Math.floor(Date.now() / 1000);
      const ttl = exp - now;

      if (ttl > 0) {
        const tokenHash = this.hashToken(token);
        // TTL in milliseconds for cache-manager
        await this.cacheManager.set(
          `blacklist:${tokenHash}`,
          'revoked',
          ttl * 1000,
        );
      }
    } catch {
      // Ignore decode errors on logout
    }
  }
}
