import * as argon2 from 'argon2';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { getDatabaseConnectionConfig } from './db-config';

// Load environment variables
config();

class SeedLogger {
  static log(message: string): void {
    process.stdout.write(`${message}\n`);
  }

  static error(message: string, error?: unknown): void {
    process.stderr.write(`${message}\n`);
    if (error) {
      if (error instanceof AggregateError) {
        for (const inner of error.errors) {
          const innerMessage =
            inner instanceof Error
              ? (inner.stack ?? inner.message)
              : typeof inner === 'string'
                ? inner
                : JSON.stringify(inner);
          process.stderr.write(`${innerMessage}\n`);
        }
        return;
      }

      const errorMessage =
        error instanceof Error
          ? (error.stack ?? error.message)
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      process.stderr.write(`${errorMessage}\n`);
    }
  }
}

// Argon2id options matching PasswordHashService (OWASP 2025)
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};
const requiredEnvVars = [
  'SEED_ADMIN_PASSWORD',
  'SEED_STAFF_PASSWORD',
  'SEED_OPS_PASSWORD',
  'SEED_PLATFORM_ADMIN_PASSWORD',
] as const;

// Validate required environment variables
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  SeedLogger.error('Missing required environment variables:');
  missingEnvVars.forEach((envVar) => SeedLogger.error(`   - ${envVar}`));
  SeedLogger.error('\nPlease set these in your .env file before running the seeder.');
  process.exit(1);
}

// Import entities
import { Booking } from '../modules/bookings/entities/booking.entity';
import { Client } from '../modules/bookings/entities/client.entity';
import { ServicePackage } from '../modules/catalog/entities/service-package.entity';
import { EmployeeWallet } from '../modules/finance/entities/employee-wallet.entity';
import { Invoice } from '../modules/finance/entities/invoice.entity';
import { Payout } from '../modules/finance/entities/payout.entity';
import { TransactionCategory } from '../modules/finance/entities/transaction-category.entity';
import { Transaction } from '../modules/finance/entities/transaction.entity';
import { TransactionType } from '../modules/finance/enums/transaction-type.enum';
import { Profile } from '../modules/hr/entities/profile.entity';
import { PlatformUser } from '../modules/platform/entities/platform-user.entity';
import { PlatformRole } from '../modules/platform/enums/platform-role.enum';
import { Task } from '../modules/tasks/entities/task.entity';
import { Tenant } from '../modules/tenants/entities/tenant.entity';
import { User } from '../modules/users/entities/user.entity';
import { Role } from '../modules/users/enums/role.enum';

// Create data source
const shouldDropSchema = (process.env.SEED_DROP_SCHEMA ?? 'false') === 'true';
const nodeEnv = process.env.NODE_ENV ?? 'development';

if (shouldDropSchema && nodeEnv === 'production') {
  SeedLogger.error(
    'Refusing to run seeder with SEED_DROP_SCHEMA enabled in production. ' +
      'Set SEED_DROP_SCHEMA=false or use a non-production environment.',
  );
  process.exit(1);
}

const AppDataSource = new DataSource({
  type: 'postgres',
  ...getDatabaseConnectionConfig(),
  entities: [
    Tenant,
    User,
    Profile,
    EmployeeWallet,
    Transaction,
    TransactionCategory,
    Payout,
    ServicePackage,
    Booking,
    Client,
    Invoice,
    Task,
    PlatformUser,
  ],
  migrations: ['src/database/migrations/*.{ts,js}'],
  dropSchema: shouldDropSchema,
  migrationsRun: true,
  synchronize: false, // Use migrations instead of synchronize during seeding
});

const REQUIRED_SEED_PASSWORDS = [
  'SEED_ADMIN_PASSWORD',
  'SEED_STAFF_PASSWORD',
  'SEED_OPS_PASSWORD',
  'SEED_PLATFORM_ADMIN_PASSWORD',
] as const;

function assertSeedPasswordsConfigured(): void {
  const missing = REQUIRED_SEED_PASSWORDS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Seeding aborted: required environment variables are not set: ${missing.join(', ')}. ` +
        'Set strong unique values before running the seed script.',
    );
  }
}

async function seed() {
  SeedLogger.log('Starting database seed...\n');
  SeedLogger.log(
    `DB: ${process.env.DB_HOST ?? '<missing>'}:${process.env.DB_PORT ?? '<missing>'} / ${process.env.DB_DATABASE ?? '<missing>'}`,
  );

  assertSeedPasswordsConfigured();

  try {
    await AppDataSource.initialize();
    SeedLogger.log('Database connected\n');

    // Get repositories
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const profileRepo = AppDataSource.getRepository(Profile);
    const walletRepo = AppDataSource.getRepository(EmployeeWallet);
    const packageRepo = AppDataSource.getRepository(ServicePackage);
    const categoryRepo = AppDataSource.getRepository(TransactionCategory);

    // ============ 0. CREATE DEFAULT TENANT ============
    SeedLogger.log('Creating default tenant...');
    let mainTenant = await tenantRepo.findOne({
      where: { slug: 'softy-hq' },
    });

    if (!mainTenant) {
      mainTenant = tenantRepo.create({
        name: 'softY HQ',
        slug: 'softy-hq',
      });
      mainTenant = await tenantRepo.save(mainTenant);
      SeedLogger.log('   Tenant created: softY HQ');
    } else {
      SeedLogger.log('   Tenant already exists');
    }

    const tenantId = mainTenant.id;

    // ============ 1. CREATE ADMIN USER ============
    SeedLogger.log('Creating admin user...');
    const existingAdmin = await userRepo.findOne({
      where: { email: 'admin@erp.soft-y.org' }, // Email is globally unique
    });

    let _adminUser: User;
    if (!existingAdmin) {
      const passwordHash = await argon2.hash(process.env.SEED_ADMIN_PASSWORD!, ARGON2_OPTIONS);
      _adminUser = userRepo.create({
        email: 'admin@erp.soft-y.org',
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        tenantId,
      });
      _adminUser = await userRepo.save(_adminUser);
      SeedLogger.log('   Admin user created: admin@erp.soft-y.org');
    } else {
      _adminUser = existingAdmin;
      SeedLogger.log('   Admin user already exists');
    }

    // ============ 2. CREATE SERVICE PACKAGES ============
    SeedLogger.log('\nCreating service packages...');
    const packagesData = [
      {
        name: 'Wedding Premium',
        description: 'Complete wedding coverage with photography, videography, drone, and full editing',
        price: 2500,
      },
      {
        name: 'Corporate Event',
        description: 'Professional corporate event coverage',
        price: 1500,
      },
      {
        name: 'Music Video',
        description: 'Full music video production',
        price: 3000,
      },
      {
        name: 'Photo Session',
        description: 'Basic photography session',
        price: 500,
      },
    ];

    for (const pkgData of packagesData) {
      const existing = await packageRepo.findOne({
        where: { name: pkgData.name, tenantId },
      });
      if (!existing) {
        const pkg = packageRepo.create({ ...pkgData, tenantId });
        await packageRepo.save(pkg);
        SeedLogger.log(`   Created package: ${pkgData.name}`);
      } else {
        SeedLogger.log(`   Exists: ${pkgData.name}`);
      }
    }

    // ============ 3. CREATE FIELD STAFF USERS ============
    SeedLogger.log('\nCreating field staff users...');
    const staffData = [
      {
        email: 'john.photographer@erp.soft-y.org',
        firstName: 'John',
        lastName: 'Smith',
        jobTitle: 'Senior Photographer',
        baseSalary: 2500,
      },
      {
        email: 'sarah.videographer@erp.soft-y.org',
        firstName: 'Sarah',
        lastName: 'Johnson',
        jobTitle: 'Lead Videographer',
        baseSalary: 2800,
      },
      {
        email: 'mike.editor@erp.soft-y.org',
        firstName: 'Mike',
        lastName: 'Williams',
        jobTitle: 'Video Editor',
        baseSalary: 2200,
      },
    ];

    for (const data of staffData) {
      let user = await userRepo.findOne({ where: { email: data.email } });
      if (!user) {
        const passwordHash = await argon2.hash(process.env.SEED_STAFF_PASSWORD!, ARGON2_OPTIONS);
        user = userRepo.create({
          email: data.email,
          passwordHash,
          role: Role.FIELD_STAFF,
          isActive: true,
          tenantId,
        });
        user = await userRepo.save(user);
        SeedLogger.log(`   Created user: ${data.email}`);

        // Create profile
        const profile = profileRepo.create({
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          jobTitle: data.jobTitle,
          baseSalary: data.baseSalary,
          hireDate: new Date(),
          tenantId,
        });
        await profileRepo.save(profile);

        // Create wallet
        const wallet = walletRepo.create({
          userId: user.id,
          pendingBalance: 0,
          payableBalance: 0,
          tenantId,
        });
        await walletRepo.save(wallet);
      } else {
        SeedLogger.log(`   Exists: ${data.email}`);

        const existingProfile = await profileRepo.findOne({ where: { userId: user.id, tenantId } });
        if (!existingProfile) {
          const profile = profileRepo.create({
            userId: user.id,
            firstName: data.firstName,
            lastName: data.lastName,
            jobTitle: data.jobTitle,
            baseSalary: data.baseSalary,
            hireDate: new Date(),
            tenantId,
          });
          await profileRepo.save(profile);
        }

        const existingWallet = await walletRepo.findOne({ where: { userId: user.id, tenantId } });
        if (!existingWallet) {
          const wallet = walletRepo.create({
            userId: user.id,
            pendingBalance: 0,
            payableBalance: 0,
            tenantId,
          });
          await walletRepo.save(wallet);
        }
      }
    }

    // ============ 5. CREATE OPS MANAGER ============
    SeedLogger.log('\nCreating operations manager...');
    const existingOps = await userRepo.findOne({
      where: { email: 'ops@erp.soft-y.org' },
    });
    if (!existingOps) {
      const passwordHash = await argon2.hash(process.env.SEED_OPS_PASSWORD!, ARGON2_OPTIONS);
      const opsUser = userRepo.create({
        email: 'ops@erp.soft-y.org',
        passwordHash,
        role: Role.OPS_MANAGER,
        isActive: true,
        tenantId,
      });
      await userRepo.save(opsUser);
      SeedLogger.log('   Created: ops@erp.soft-y.org');
    } else {
      SeedLogger.log('   Exists: ops@erp.soft-y.org');
    }

    // ============ 6. CREATE DEFAULT TRANSACTION CATEGORIES ============
    SeedLogger.log('\nCreating default transaction categories...');
    const defaultCategories = [
      { name: 'Operational', description: 'Operational expenses', applicableType: TransactionType.EXPENSE },
      { name: 'Admin', description: 'Administrative expenses', applicableType: TransactionType.EXPENSE },
      { name: 'Marketing', description: 'Marketing and advertising expenses', applicableType: TransactionType.EXPENSE },
    ];

    for (const catData of defaultCategories) {
      const existing = await categoryRepo.findOne({
        where: { name: catData.name, tenantId },
      });
      if (!existing) {
        const category = categoryRepo.create({
          name: catData.name,
          description: catData.description,
          applicableType: catData.applicableType,
          tenantId,
        });
        await categoryRepo.save(category);
        SeedLogger.log(`   Created category: ${catData.name}`);
      } else {
        SeedLogger.log(`   Exists: ${catData.name}`);
      }
    }

    // ============ 7. CREATE PLATFORM ADMIN USER ============
    SeedLogger.log('\nCreating platform admin user...');
    const platformUserRepo = AppDataSource.getRepository(PlatformUser);
    const existingPlatformAdmin = await platformUserRepo.findOne({
      where: { email: 'admin@erp.soft-y.org' },
    });
    if (!existingPlatformAdmin) {
      const passwordHash = await argon2.hash(process.env.SEED_PLATFORM_ADMIN_PASSWORD!, ARGON2_OPTIONS);
      const platformAdmin = platformUserRepo.create({
        email: 'admin@erp.soft-y.org',
        fullName: 'Platform Administrator',
        passwordHash,
        role: PlatformRole.SUPER_ADMIN,
        status: 'active',
        mfaEnabled: false,
      });
      await platformUserRepo.save(platformAdmin);
      SeedLogger.log('   Created: admin@erp.soft-y.org');
    } else {
      SeedLogger.log('   Exists: admin@erp.soft-y.org');
    }

    SeedLogger.log('\n========================================');
    SeedLogger.log('Seed completed successfully!');
    SeedLogger.log('========================================\n');
    SeedLogger.log('Tenant: softY HQ (softy-hq)');
    SeedLogger.log('Login credentials:');
    SeedLogger.log('  Admin:    admin@erp.soft-y.org / [SEED_ADMIN_PASSWORD]');
    SeedLogger.log('  Ops Mgr:  ops@erp.soft-y.org / [SEED_OPS_PASSWORD]');
    SeedLogger.log('  Staff:    john.photographer@erp.soft-y.org / [SEED_STAFF_PASSWORD]');
    SeedLogger.log('            sarah.videographer@erp.soft-y.org / [SEED_STAFF_PASSWORD]');
    SeedLogger.log('            mike.editor@erp.soft-y.org / [SEED_STAFF_PASSWORD]');
    SeedLogger.log('\nPlatform:');
    SeedLogger.log('  Admin:    admin@erp.soft-y.org / [SEED_PLATFORM_ADMIN_PASSWORD]\n');
  } catch (error) {
    SeedLogger.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

void seed();
