import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Counter } from 'prom-client';
import { TENANT_REPO_CLIENT } from '../../../common/constants/tenant-repo.tokens';
import { TenantAwareRepository } from '../../../common/repositories/tenant-aware.repository';
import { MetricsFactory } from '../../../common/services/metrics.factory';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Client } from '../../bookings/entities/client.entity';
import { MailService } from '../../mail/mail.service';
import { TenantsService } from '../../tenants/tenants.service';

export interface ClientTokenPayload {
  sub: string; // client ID
  email: string;
  tenantId: string;
  type: 'client';
}

interface ClientMagicLinkPayload {
  sub: string;
  email: string;
  tenantId: string;
  type: 'client_magic';
  jti: string;
}

export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);
  private readonly TOKEN_EXPIRY_HOURS = 24;
  private readonly SESSION_EXPIRY_SECONDS: number;

  // Metrics
  private readonly magicLinkRequestedCounter: Counter<string>;
  private readonly magicLinkVerifiedCounter: Counter<string>;

  constructor(
    @Inject(TENANT_REPO_CLIENT)
    private readonly clientRepository: TenantAwareRepository<Client>,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly metricsFactory: MetricsFactory,
    private readonly tenantsService: TenantsService,
  ) {
    this.SESSION_EXPIRY_SECONDS = this.configService.get<number>(
      'auth.clientSessionExpires',
      3600, // 1 hour default
    );

    // Initialize Metrics via injectable factory (idempotent)
    this.magicLinkRequestedCounter = this.metricsFactory.getOrCreateCounter({
      name: 'auth_client_magic_link_requested_total',
      help: 'Total number of client magic link requests',
      labelNames: ['tenant_id', 'status'],
    });

    this.magicLinkVerifiedCounter = this.metricsFactory.getOrCreateCounter({
      name: 'auth_client_magic_link_verified_total',
      help: 'Total number of client magic link verifications',
      labelNames: ['tenant_id', 'status'],
    });
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

  private getAllowedJwtAlgorithm(): 'HS256' | 'RS256' {
    const raw = this.configService.get<string>('JWT_ALLOWED_ALGORITHMS') ?? 'HS256';
    const parsed = raw
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter((a): a is 'HS256' | 'RS256' => a === 'HS256' || a === 'RS256');

    const unique = Array.from(new Set(parsed));
    if (unique.length !== 1) {
      throw new Error('JWT_ALLOWED_ALGORITHMS must be exactly one of: HS256, RS256');
    }
    return unique[0] ?? 'HS256';
  }

  async requestMagicLink(slug: string, email: string): Promise<{ message: string }> {
    const tenant = await this.tenantsService.findBySlug(slug);
    const tenantId = tenant.id;

    return TenantContextService.run(tenantId, async () => {
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

        const jti = randomBytes(16).toString('hex');
        const token = this.jwtService.sign(
          { sub: client.id, email: client.email, tenantId, type: 'client_magic', jti },
          { expiresIn: `${this.TOKEN_EXPIRY_HOURS}h` },
        );

        client.accessTokenHash = this.hashToken(jti);
        client.accessTokenExpiry = new Date(Date.now() + this.TOKEN_EXPIRY_HOURS * 3600 * 1000);
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
    });
  }

  async verifyMagicLink(token: string): Promise<{ accessToken: string; expiresIn: number; client: Client }> {
    const algorithm = this.getAllowedJwtAlgorithm();
    let payload: ClientMagicLinkPayload;
    try {
      payload = this.jwtService.verify<ClientMagicLinkPayload>(token, {
        algorithms: [algorithm],
        secret:
          algorithm === 'RS256'
            ? this.configService.getOrThrow<string>('JWT_PUBLIC_KEY')
            : this.configService.getOrThrow<string>('auth.jwtSecret'),
      });
    } catch {
      this.magicLinkVerifiedCounter.inc({
        tenant_id: 'unknown',
        status: 'invalid_token',
      });
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type !== 'client_magic' || !payload.jti) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return TenantContextService.run(payload.tenantId, async () => {
      const tenantId = payload.tenantId;
      const tokenHash = this.hashToken(payload.jti);

      try {
        const client = await this.clientRepository.findOne({
          where: { id: payload.sub },
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

        if (!client.accessTokenHash || !this.compareHashes(tokenHash, client.accessTokenHash)) {
          this.magicLinkVerifiedCounter.inc({
            tenant_id: tenantId,
            status: 'hash_mismatch',
          });
          throw new UnauthorizedException('Invalid token');
        }

        client.accessTokenHash = null;
        client.accessTokenExpiry = null;
        await this.clientRepository.save(client);

        const accessToken = this.jwtService.sign(
          { sub: client.id, email: client.email, tenantId: client.tenantId, type: 'client' },
          { expiresIn: this.SESSION_EXPIRY_SECONDS },
        );

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
        if (!(error instanceof NotFoundException) && !(error instanceof UnauthorizedException)) {
          this.magicLinkVerifiedCounter.inc({
            tenant_id: tenantId,
            status: 'error',
          });
        }
        throw error;
      }
    });
  }

  async validateClientToken(token: string): Promise<Client | null> {
    try {
      // Check blacklist first
      const tokenHash = this.hashToken(token);
      const isBlacklisted = await this.cacheManager.get(`blacklist:${tokenHash}`);
      if (isBlacklisted) {
        return null; // Revoked
      }

      const algorithm = this.getAllowedJwtAlgorithm();
      const payload = this.jwtService.verify<ClientTokenPayload>(token, {
        algorithms: [algorithm],
        secret:
          algorithm === 'RS256'
            ? this.configService.getOrThrow<string>('JWT_PUBLIC_KEY')
            : this.configService.getOrThrow<string>('auth.jwtSecret'),
      });

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
    } catch (error) {
      // Fail closed: if JWT parsing/verification throws, deny access.
      // Do not log token contents.
      this.logger.warn(
        `Client token validation failed: ${error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'}`,
      );
      return null;
    }
  }

  async logout(token: string): Promise<void> {
    try {
      const decodedUnknown: unknown = this.jwtService.decode(token);
      // Defensive checks to avoid unsafe `any` usage
      if (!decodedUnknown || typeof decodedUnknown !== 'object' || decodedUnknown === null) return;

      const exp = (decodedUnknown as { exp?: number }).exp;
      if (!exp || typeof exp !== 'number') return;

      const now = Math.floor(Date.now() / 1000);
      const ttl = exp - now;

      if (ttl > 0) {
        const tokenHash = this.hashToken(token);
        // TTL in milliseconds for cache-manager
        try {
          await this.cacheManager.set(`blacklist:${tokenHash}`, 'revoked', ttl * 1000);
        } catch (cacheError) {
          // L-06: Log warning when Redis is unavailable during logout
          this.logger.warn(
            `Failed to blacklist token in cache during logout: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`,
          );
        }
      }
    } catch (error) {
      this.logger.debug(`Logout failed (decode error): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
