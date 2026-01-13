import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

// Load environment variables
config();

class SeedLogger {
  static log(message: string): void {
    process.stdout.write(`${message}\n`);
  }

  static error(message: string, error?: unknown): void {
    process.stderr.write(`${message}\n`);
    if (error) {
      const errorMessage =
        error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
      process.stderr.write(`${errorMessage}\n`);
    }
  }
}

// Validate required environment variables
const requiredEnvVars = ['SEED_ADMIN_PASSWORD', 'SEED_STAFF_PASSWORD', 'SEED_OPS_PASSWORD'] as const;

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  SeedLogger.error('Missing required environment variables:');
  missingEnvVars.forEach((envVar) => SeedLogger.error(`   - ${envVar}`));
  SeedLogger.error('\nPlease set these in your .env file before running the seeder.');
  process.exit(1);
}

// Import entities
import { Booking } from '../modules/bookings/entities/booking.entity';
import { PackageItem } from '../modules/catalog/entities/package-item.entity';
import { ServicePackage } from '../modules/catalog/entities/service-package.entity';
import { TaskType } from '../modules/catalog/entities/task-type.entity';
import { EmployeeWallet } from '../modules/finance/entities/employee-wallet.entity';
import { Transaction } from '../modules/finance/entities/transaction.entity';
import { Profile } from '../modules/hr/entities/profile.entity';
import { Task } from '../modules/tasks/entities/task.entity';
import { Tenant } from '../modules/tenants/entities/tenant.entity';
import { User } from '../modules/users/entities/user.entity';
import { Role } from '../modules/users/enums/role.enum';

// Create data source
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Tenant, User, Profile, EmployeeWallet, Transaction, ServicePackage, TaskType, PackageItem, Booking, Task],
  synchronize: true, // Only for seeding - creates tables
});

async function seed() {
  SeedLogger.log('Starting database seed...\n');

  try {
    await AppDataSource.initialize();
    SeedLogger.log('Database connected\n');

    // Get repositories
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const userRepo = AppDataSource.getRepository(User);
    const profileRepo = AppDataSource.getRepository(Profile);
    const walletRepo = AppDataSource.getRepository(EmployeeWallet);
    const packageRepo = AppDataSource.getRepository(ServicePackage);
    const taskTypeRepo = AppDataSource.getRepository(TaskType);
    const packageItemRepo = AppDataSource.getRepository(PackageItem);

    // ============ 0. CREATE DEFAULT TENANT ============
    SeedLogger.log('Creating default tenant...');
    let mainTenant = await tenantRepo.findOne({
      where: { slug: 'chapters-studio-hq' },
    });

    if (!mainTenant) {
      mainTenant = tenantRepo.create({
        name: 'Chapters Studio HQ',
        slug: 'chapters-studio-hq',
      });
      mainTenant = await tenantRepo.save(mainTenant);
      SeedLogger.log('   Tenant created: Chapters Studio HQ');
    } else {
      SeedLogger.log('   Tenant already exists');
    }

    const tenantId = mainTenant.id;

    // ============ 1. CREATE ADMIN USER ============
    SeedLogger.log('Creating admin user...');
    const existingAdmin = await userRepo.findOne({
      where: { email: 'admin@chapters.studio' }, // Unique constraint is (email, tenantId) typically, but we check email + tenant
    });

    let _adminUser: User;
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD!, 10);
      _adminUser = userRepo.create({
        email: 'admin@chapters.studio',
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        tenantId,
      });
      _adminUser = await userRepo.save(_adminUser);
      SeedLogger.log('   Admin user created: admin@chapters.studio');
    } else {
      _adminUser = existingAdmin;
      SeedLogger.log('   Admin user already exists');
    }

    // ============ 2. CREATE TASK TYPES ============
    SeedLogger.log('\nCreating task types...');
    const taskTypesData = [
      {
        name: 'Photography',
        description: 'Event photography coverage',
        defaultCommissionAmount: 100,
      },
      {
        name: 'Videography',
        description: 'Video recording and capturing',
        defaultCommissionAmount: 150,
      },
      {
        name: 'Video Editing',
        description: 'Post-production video editing',
        defaultCommissionAmount: 200,
      },
      {
        name: 'Color Grading',
        description: 'Professional color correction',
        defaultCommissionAmount: 120,
      },
      {
        name: 'Sound Mixing',
        description: 'Audio mixing and mastering',
        defaultCommissionAmount: 80,
      },
      {
        name: 'Drone Footage',
        description: 'Aerial photography and videography',
        defaultCommissionAmount: 180,
      },
    ];

    const taskTypes: TaskType[] = [];
    for (const data of taskTypesData) {
      const existing = await taskTypeRepo.findOne({
        where: { name: data.name, tenantId },
      });
      if (!existing) {
        const taskType = taskTypeRepo.create({ ...data, tenantId });
        taskTypes.push(await taskTypeRepo.save(taskType));
        SeedLogger.log(`   Created: ${data.name}`);
      } else {
        taskTypes.push(existing);
        SeedLogger.log(`   Exists: ${data.name}`);
      }
    }

    // ============ 3. CREATE SERVICE PACKAGES ============
    SeedLogger.log('\nCreating service packages...');
    const packagesData = [
      {
        name: 'Wedding Premium',
        description: 'Complete wedding coverage with photography, videography, drone, and full editing',
        price: 2500,
        items: [
          { taskTypeName: 'Photography', quantity: 2 },
          { taskTypeName: 'Videography', quantity: 2 },
          { taskTypeName: 'Video Editing', quantity: 1 },
          { taskTypeName: 'Drone Footage', quantity: 1 },
          { taskTypeName: 'Color Grading', quantity: 1 },
        ],
      },
      {
        name: 'Corporate Event',
        description: 'Professional corporate event coverage',
        price: 1500,
        items: [
          { taskTypeName: 'Photography', quantity: 1 },
          { taskTypeName: 'Videography', quantity: 1 },
          { taskTypeName: 'Video Editing', quantity: 1 },
        ],
      },
      {
        name: 'Music Video',
        description: 'Full music video production',
        price: 3000,
        items: [
          { taskTypeName: 'Videography', quantity: 2 },
          { taskTypeName: 'Video Editing', quantity: 1 },
          { taskTypeName: 'Color Grading', quantity: 1 },
          { taskTypeName: 'Sound Mixing', quantity: 1 },
        ],
      },
      {
        name: 'Photo Session',
        description: 'Basic photography session',
        price: 500,
        items: [{ taskTypeName: 'Photography', quantity: 1 }],
      },
    ];

    for (const pkgData of packagesData) {
      let pkg = await packageRepo.findOne({
        where: { name: pkgData.name, tenantId },
      });
      if (!pkg) {
        pkg = packageRepo.create({
          name: pkgData.name,
          description: pkgData.description,
          price: pkgData.price,
          tenantId,
        });
        pkg = await packageRepo.save(pkg);
        SeedLogger.log(`   Created package: ${pkgData.name}`);

        // Add package items
        for (const itemData of pkgData.items) {
          const taskType = taskTypes.find((t) => t.name === itemData.taskTypeName);
          if (taskType) {
            const item = packageItemRepo.create({
              packageId: pkg.id,
              taskTypeId: taskType.id,
              quantity: itemData.quantity,
              tenantId,
            });
            await packageItemRepo.save(item);
          }
        }
      } else {
        SeedLogger.log(`   Exists: ${pkgData.name}`);
      }
    }

    // ============ 4. CREATE FIELD STAFF USERS ============
    SeedLogger.log('\nCreating field staff users...');
    const staffData = [
      {
        email: 'john.photographer@chapters.studio',
        firstName: 'John',
        lastName: 'Smith',
        jobTitle: 'Senior Photographer',
        baseSalary: 2500,
      },
      {
        email: 'sarah.videographer@chapters.studio',
        firstName: 'Sarah',
        lastName: 'Johnson',
        jobTitle: 'Lead Videographer',
        baseSalary: 2800,
      },
      {
        email: 'mike.editor@chapters.studio',
        firstName: 'Mike',
        lastName: 'Williams',
        jobTitle: 'Video Editor',
        baseSalary: 2200,
      },
    ];

    for (const data of staffData) {
      let user = await userRepo.findOne({ where: { email: data.email } });
      if (!user) {
        const passwordHash = await bcrypt.hash(process.env.SEED_STAFF_PASSWORD!, 10);
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
      }
    }

    // ============ 5. CREATE OPS MANAGER ============
    SeedLogger.log('\nCreating operations manager...');
    const existingOps = await userRepo.findOne({
      where: { email: 'ops@chapters.studio' },
    });
    if (!existingOps) {
      const passwordHash = await bcrypt.hash(process.env.SEED_OPS_PASSWORD!, 10);
      const opsUser = userRepo.create({
        email: 'ops@chapters.studio',
        passwordHash,
        role: Role.OPS_MANAGER,
        isActive: true,
        tenantId,
      });
      await userRepo.save(opsUser);
      SeedLogger.log('   Created: ops@chapters.studio');
    } else {
      SeedLogger.log('   Exists: ops@chapters.studio');
    }

    SeedLogger.log('\n========================================');
    SeedLogger.log('Seed completed successfully!');
    SeedLogger.log('========================================\n');
    SeedLogger.log('Tenant: Chapters Studio HQ (chapters-studio-hq)');
    SeedLogger.log('Login credentials:');
    SeedLogger.log('  Admin:    admin@chapters.studio / [SEED_ADMIN_PASSWORD]');
    SeedLogger.log('  Ops Mgr:  ops@chapters.studio / [SEED_OPS_PASSWORD]');
    SeedLogger.log('  Staff:    john.photographer@chapters.studio / [SEED_STAFF_PASSWORD]');
    SeedLogger.log('            sarah.videographer@chapters.studio / [SEED_STAFF_PASSWORD]');
    SeedLogger.log('            mike.editor@chapters.studio / [SEED_STAFF_PASSWORD]\n');
  } catch (error) {
    SeedLogger.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

void seed();
