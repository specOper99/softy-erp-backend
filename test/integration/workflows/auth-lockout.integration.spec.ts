import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EventBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CacheUtilsService } from '../../../src/common/cache/cache-utils.service';
import { TenantContextService } from '../../../src/common/services/tenant-context.service';

void globalThis.fetch;
import { GeoIpService } from '../../../src/common/services/geoip.service';
import { AuditService } from '../../../src/modules/audit/audit.service';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { RegisterDto } from '../../../src/modules/auth/dto/auth.dto';
import { EmailVerificationToken } from '../../../src/modules/auth/entities/email-verification-token.entity';
import { PasswordResetToken } from '../../../src/modules/auth/entities/password-reset-token.entity';
import { RefreshToken } from '../../../src/modules/auth/entities/refresh-token.entity';
import { AccountLockoutService } from '../../../src/modules/auth/services/account-lockout.service';
import { TokenService } from '../../../src/modules/auth/services/token.service';
import { MfaService } from '../../../src/modules/auth/services/mfa.service';
import { MfaTokenService } from '../../../src/modules/auth/services/mfa-token.service';
import { SessionService } from '../../../src/modules/auth/services/session.service';
import { PasswordService } from '../../../src/modules/auth/services/password.service';
import { TokenBlacklistService } from '../../../src/modules/auth/services/token-blacklist.service';
import { EmployeeWallet } from '../../../src/modules/finance/entities/employee-wallet.entity';
import { Profile } from '../../../src/modules/hr/entities/profile.entity';
import { MailService } from '../../../src/modules/mail/mail.service';
import { Tenant } from '../../../src/modules/tenants/entities/tenant.entity';
import { TenantsService } from '../../../src/modules/tenants/tenants.service';
import { User } from '../../../src/modules/users/entities/user.entity';
import { UsersService } from '../../../src/modules/users/services/users.service';
import { UserRepository } from '../../../src/modules/users/repositories/user.repository';

void globalThis.fetch;
import { AuditPublisher } from '../../../src/modules/audit/audit.publisher';

// Mock CacheUtilsService with in-memory map
class MockCacheUtilsService {
  private store = new Map<string, unknown>();
  get(key: string) {
    return this.store.get(key);
  }
  set(key: string, value: unknown, _ttl?: number) {
    this.store.set(key, value);
  }
  del(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

// Mock MailService
const mockMailService = {
  queueEmailVerification: jest.fn(),
  queuePasswordReset: jest.fn(),
};

describe('Auth Lockout Integration', () => {
  let module: TestingModule;
  let authService: AuthService;
  let dataSource: DataSource;
  let cacheService: MockCacheUtilsService;
  let _usersService: UsersService;
  let userRepository: Repository<User>;

  beforeAll(async () => {
    const dbConfig = globalThis.__DB_CONFIG__!;
    dataSource = new DataSource({
      type: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      username: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      entities: [__dirname + '/../../../src/**/*.entity.ts'],
      synchronize: false,
    });
    await dataSource.initialize();

    userRepository = dataSource.getRepository(User);

    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          entities: [__dirname + '/../../../src/**/*.entity.ts'],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([
          User,
          RefreshToken,
          PasswordResetToken,
          EmailVerificationToken,
          Profile,
          EmployeeWallet,
          Tenant,
        ]),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        AuthService,
        AccountLockoutService,
        UsersService,
        {
          provide: UserRepository,
          useValue: new UserRepository(userRepository),
        },
        {
          provide: AuditPublisher,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EventBus,
          useValue: { publish: jest.fn() },
        },
        TenantsService,
        TokenService,
        {
          provide: MfaService,
          useValue: {
            verifyRecoveryCode: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: SessionService,
          useValue: {
            checkSuspiciousActivity: jest.fn(),
            checkNewDevice: jest.fn(),
          },
        },
        {
          provide: MfaTokenService,
          useValue: {
            createTempToken: jest.fn().mockResolvedValue('test-mfa-temp-token'),
            getTempToken: jest.fn().mockResolvedValue(undefined),
            consumeTempToken: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
          },
        },
        {
          provide: TokenBlacklistService,
          useValue: {
            blacklist: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: CacheUtilsService, useClass: MockCacheUtilsService },
        { provide: MailService, useValue: mockMailService },
        { provide: DataSource, useValue: dataSource },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultVal: any) => {
              if (key === 'LOCKOUT_MAX_ATTEMPTS') return 3; // Lockout after 3 attempts
              if (key === 'LOCKOUT_DURATION_SECONDS') return 2; // Short lockout for test
              if (key === 'LOCKOUT_WINDOW_SECONDS') return 60;
              if (key === 'auth.jwtAccessExpires') return 900;
              if (key === 'auth.jwtRefreshExpires') return 7;
              if (key === 'JWT_SECRET') return 'test-secret';
              return defaultVal;
            },
          },
        },
        // Repositories
        { provide: getRepositoryToken(User), useValue: userRepository },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: dataSource.getRepository(RefreshToken),
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: dataSource.getRepository(PasswordResetToken),
        },
        {
          provide: getRepositoryToken(EmailVerificationToken),
          useValue: dataSource.getRepository(EmailVerificationToken),
        },
        {
          provide: getRepositoryToken(Tenant),
          useValue: dataSource.getRepository(Tenant),
        },
        {
          provide: GeoIpService,
          useValue: {
            getLocation: jest.fn().mockResolvedValue({
              country: 'Test Country',
              city: 'Test City',
            }),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    cacheService = module.get(CacheUtilsService);
    _usersService = module.get<UsersService>(UsersService);
  });

  afterAll(async () => {
    await module?.close();
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await userRepository.createQueryBuilder().delete().execute();
    await dataSource.query('DELETE FROM tenants');
    cacheService.clear();
  });

  it('should lock out user after max failed attempts and expire lock', async () => {
    const registerDto: RegisterDto = {
      email: `test-${uuidv4()}@example.com`,
      password: 'Password123!',
      companyName: `Test Co ${uuidv4()}`,
    };

    const registerResult = await authService.register(registerDto);
    const tenantId = registerResult.user?.tenantId;
    if (!tenantId) {
      throw new Error('Missing tenantId from register result');
    }

    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(tenantId);
    jest.spyOn(TenantContextService, 'getTenantIdOrThrow').mockReturnValue(tenantId);

    // 2. Fail 3 times
    const loginDto = { email: registerDto.email, password: 'WrongPassword!' };

    try {
      await authService.login(loginDto);
    } catch {
      /* expected login failure - attempt 1 */
    }
    try {
      await authService.login(loginDto);
    } catch {
      /* expected login failure - attempt 2 */
    }
    try {
      await authService.login(loginDto);
    } catch {
      /* expected login failure - attempt 3 -> triggers lockout */
    }

    // 3. Verify Lockout on 4th attempt
    await expect(authService.login(loginDto)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Account temporarily locked'),
      }),
    );

    // 4. Verify correct password also rejected while locked
    await expect(authService.login({ ...loginDto, password: 'Password123!' })).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('Account temporarily locked'),
      }),
    );

    // 5. Wait for expiration (2s + buffer)
    await new Promise((r) => setTimeout(r, 2200));

    // 6. Login Success with correct password
    const result = await authService.login({
      email: registerDto.email,
      password: 'Password123!',
    });
    expect(result.accessToken).toBeDefined();
  });
});
