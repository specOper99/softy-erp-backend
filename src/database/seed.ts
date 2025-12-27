import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

// Load environment variables
config();

// Validate required environment variables
const requiredEnvVars = [
  'SEED_ADMIN_PASSWORD',
  'SEED_STAFF_PASSWORD',
  'SEED_OPS_PASSWORD',
] as const;

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
  console.error('\nPlease set these in your .env file before running the seeder.');
  process.exit(1);
}

// Import entities
import { Role } from '../common/enums';
import { Booking } from '../modules/bookings/entities/booking.entity';
import { PackageItem } from '../modules/catalog/entities/package-item.entity';
import { ServicePackage } from '../modules/catalog/entities/service-package.entity';
import { TaskType } from '../modules/catalog/entities/task-type.entity';
import { EmployeeWallet } from '../modules/finance/entities/employee-wallet.entity';
import { Transaction } from '../modules/finance/entities/transaction.entity';
import { Profile } from '../modules/hr/entities/profile.entity';
import { Task } from '../modules/tasks/entities/task.entity';
import { User } from '../modules/users/entities/user.entity';

// Create data source
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [
    User,
    Profile,
    EmployeeWallet,
    Transaction,
    ServicePackage,
    TaskType,
    PackageItem,
    Booking,
    Task,
  ],
  synchronize: true, // Only for seeding - creates tables
});

async function seed() {
  console.log('🌱 Starting database seed...\n');

  try {
    await AppDataSource.initialize();
    console.log('✅ Database connected\n');

    // Get repositories
    const userRepo = AppDataSource.getRepository(User);
    const profileRepo = AppDataSource.getRepository(Profile);
    const walletRepo = AppDataSource.getRepository(EmployeeWallet);
    const packageRepo = AppDataSource.getRepository(ServicePackage);
    const taskTypeRepo = AppDataSource.getRepository(TaskType);
    const packageItemRepo = AppDataSource.getRepository(PackageItem);

    // ============ 1. CREATE ADMIN USER ============
    console.log('👤 Creating admin user...');
    const existingAdmin = await userRepo.findOne({
      where: { email: 'admin@chapters.studio' },
    });

    let _adminUser: User;
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(
        process.env.SEED_ADMIN_PASSWORD!,
        10,
      );
      _adminUser = userRepo.create({
        email: 'admin@chapters.studio',
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
      });
      _adminUser = await userRepo.save(_adminUser);
      console.log('   ✅ Admin user created: admin@chapters.studio');
    } else {
      _adminUser = existingAdmin;
      console.log('   ⏭️  Admin user already exists');
    }

    // ============ 2. CREATE TASK TYPES ============
    console.log('\n📋 Creating task types...');
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
        where: { name: data.name },
      });
      if (!existing) {
        const taskType = taskTypeRepo.create(data);
        taskTypes.push(await taskTypeRepo.save(taskType));
        console.log(`   ✅ Created: ${data.name}`);
      } else {
        taskTypes.push(existing);
        console.log(`   ⏭️  Exists: ${data.name}`);
      }
    }

    // ============ 3. CREATE SERVICE PACKAGES ============
    console.log('\n📦 Creating service packages...');
    const packagesData = [
      {
        name: 'Wedding Premium',
        description:
          'Complete wedding coverage with photography, videography, drone, and full editing',
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
      let pkg = await packageRepo.findOne({ where: { name: pkgData.name } });
      if (!pkg) {
        pkg = packageRepo.create({
          name: pkgData.name,
          description: pkgData.description,
          price: pkgData.price,
        });
        pkg = await packageRepo.save(pkg);
        console.log(`   ✅ Created package: ${pkgData.name}`);

        // Add package items
        for (const itemData of pkgData.items) {
          const taskType = taskTypes.find(
            (t) => t.name === itemData.taskTypeName,
          );
          if (taskType) {
            const item = packageItemRepo.create({
              packageId: pkg.id,
              taskTypeId: taskType.id,
              quantity: itemData.quantity,
            });
            await packageItemRepo.save(item);
          }
        }
      } else {
        console.log(`   ⏭️  Exists: ${pkgData.name}`);
      }
    }

    // ============ 4. CREATE FIELD STAFF USERS ============
    console.log('\n👥 Creating field staff users...');
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
        const passwordHash = await bcrypt.hash(
          process.env.SEED_STAFF_PASSWORD!,
          10,
        );
        user = userRepo.create({
          email: data.email,
          passwordHash,
          role: Role.FIELD_STAFF,
          isActive: true,
        });
        user = await userRepo.save(user);
        console.log(`   ✅ Created user: ${data.email}`);

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
        });
        await walletRepo.save(wallet);
      } else {
        console.log(`   ⏭️  Exists: ${data.email}`);
      }
    }

    // ============ 5. CREATE OPS MANAGER ============
    console.log('\n👔 Creating operations manager...');
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
      });
      await userRepo.save(opsUser);
      console.log('   ✅ Created: ops@chapters.studio');
    } else {
      console.log('   ⏭️  Exists: ops@chapters.studio');
    }

    console.log('\n========================================');
    console.log('🎉 Seed completed successfully!');
    console.log('========================================\n');
    console.log('Login credentials:');
    console.log('  Admin:    admin@chapters.studio / [SEED_ADMIN_PASSWORD]');
    console.log('  Ops Mgr:  ops@chapters.studio / [SEED_OPS_PASSWORD]');
    console.log('  Staff:    john.photographer@chapters.studio / [SEED_STAFF_PASSWORD]');
    console.log('            sarah.videographer@chapters.studio / [SEED_STAFF_PASSWORD]');
    console.log('            mike.editor@chapters.studio / [SEED_STAFF_PASSWORD]\n');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

void seed();
