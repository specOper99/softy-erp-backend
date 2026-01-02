import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Role } from '../../src/common/enums';
import { Client } from '../../src/modules/bookings/entities/client.entity';
import { PackageItem } from '../../src/modules/catalog/entities/package-item.entity';
import { ServicePackage } from '../../src/modules/catalog/entities/service-package.entity';
import { TaskType } from '../../src/modules/catalog/entities/task-type.entity';
import { EmployeeWallet } from '../../src/modules/finance/entities/employee-wallet.entity';
import { Profile } from '../../src/modules/hr/entities/profile.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/users/entities/user.entity';

export async function seedTestDatabase(dataSource: DataSource) {
  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);
  const profileRepo = dataSource.getRepository(Profile);
  const walletRepo = dataSource.getRepository(EmployeeWallet);
  const taskTypeRepo = dataSource.getRepository(TaskType);
  const packageRepo = dataSource.getRepository(ServicePackage);
  const packageItemRepo = dataSource.getRepository(PackageItem);
  const clientRepo = dataSource.getRepository(Client);

  // 1. Create Tenant
  let tenant = await tenantRepo.findOne({
    where: { slug: 'chapters-studio-hq' },
  });
  if (!tenant) {
    try {
      tenant = tenantRepo.create({
        name: 'Chapters Studio HQ',
        slug: 'chapters-studio-hq',
      });
      tenant = await tenantRepo.save(tenant);
    } catch {
      tenant = await tenantRepo.findOne({
        where: { slug: 'chapters-studio-hq' },
      });
    }
  }

  if (!tenant) {
    throw new Error('Failed to seed/find test tenant');
  }

  const tenantId = tenant.id;

  // 2. Create/Update Admin
  const adminEmail = 'admin@chapters.studio';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  let admin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!admin) {
    try {
      admin = userRepo.create({
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: Role.ADMIN,
        isActive: true,
        tenantId,
      });
      admin = await userRepo.save(admin);
    } catch {
      admin = await userRepo.findOne({ where: { email: adminEmail } });
    }
  } else {
    admin.passwordHash = adminPasswordHash;
    admin.tenantId = tenantId;
    admin = await userRepo.save(admin);
  }

  if (!admin) {
    throw new Error('Failed to seed/find admin user');
  }

  // Sync admin profile/wallet if they exist
  const existingAdminProfile = await profileRepo.findOne({
    where: { userId: admin.id },
  });
  if (existingAdminProfile) {
    await profileRepo.update({ id: existingAdminProfile.id }, { tenantId });
  } else {
    try {
      await profileRepo.save(
        profileRepo.create({
          userId: admin.id,
          firstName: 'Admin',
          lastName: 'User',
          baseSalary: 0,
          tenantId,
        }),
      );
    } catch {
      // Profile already exists
    }
  }

  const adminWallet = await walletRepo.findOne({ where: { userId: admin.id } });
  if (adminWallet) {
    await walletRepo.update({ id: adminWallet.id }, { tenantId });
  } else {
    try {
      await walletRepo.save(
        walletRepo.create({
          userId: admin.id,
          pendingBalance: 0,
          payableBalance: 0,
          tenantId,
        }),
      );
    } catch {
      // Wallet already exists
    }
  }

  // 3. Create/Update Staff
  const staffEmail = 'john.photographer@chapters.studio';
  const staffPassword = process.env.SEED_STAFF_PASSWORD || 'ChaptersERP123!';
  const staffPasswordHash = await bcrypt.hash(staffPassword, 10);

  let staff = await userRepo.findOne({ where: { email: staffEmail } });
  if (!staff) {
    try {
      staff = userRepo.create({
        email: staffEmail,
        passwordHash: staffPasswordHash,
        role: Role.FIELD_STAFF,
        isActive: true,
        tenantId,
      });
      staff = await userRepo.save(staff);
    } catch {
      staff = await userRepo.findOne({ where: { email: staffEmail } });
    }
  } else {
    staff.passwordHash = staffPasswordHash;
    staff.tenantId = tenantId;
    staff = await userRepo.save(staff);
  }

  if (!staff) {
    throw new Error('Failed to seed/find staff user');
  }

  // Sync staff profile/wallet
  const staffProfile = await profileRepo.findOne({
    where: { userId: staff.id },
  });
  if (!staffProfile) {
    try {
      await profileRepo.save(
        profileRepo.create({
          userId: staff.id,
          firstName: 'John',
          lastName: 'Doe',
          jobTitle: 'Photographer',
          baseSalary: 2000,
          tenantId,
        }),
      );
    } catch {
      // Profile already exists
    }
  } else {
    await profileRepo.update({ id: staffProfile.id }, { tenantId });
  }

  const staffWallet = await walletRepo.findOne({
    where: { userId: staff.id },
  });
  if (!staffWallet) {
    try {
      await walletRepo.save(
        walletRepo.create({
          userId: staff.id,
          pendingBalance: 0,
          payableBalance: 0,
          tenantId,
        }),
      );
    } catch {
      // Wallet already exists
    }
  } else {
    await walletRepo.update({ id: staffWallet.id }, { tenantId });
  }

  // 4. Create Task Types
  const taskTypeName = 'Photography';
  let taskType = await taskTypeRepo.findOne({
    where: { name: taskTypeName, tenantId },
  });
  if (!taskType) {
    try {
      taskType = await taskTypeRepo.save(
        taskTypeRepo.create({
          name: taskTypeName,
          description: 'Photos',
          defaultCommissionAmount: 100,
          tenantId,
        }),
      );
    } catch {
      taskType = await taskTypeRepo.findOne({
        where: { name: taskTypeName, tenantId },
      });
    }
  }

  if (!taskType) {
    throw new Error('Failed to seed/find task type');
  }

  // 5. Create Package
  const packageName = 'Wedding Premium';
  let pkg = await packageRepo.findOne({
    where: { name: packageName, tenantId },
  });
  if (!pkg) {
    try {
      pkg = await packageRepo.save(
        packageRepo.create({
          name: packageName,
          description: 'Full Package',
          price: 2000,
          tenantId,
        }),
      );

      await packageItemRepo.save(
        packageItemRepo.create({
          packageId: pkg.id,
          taskTypeId: taskType.id,
          quantity: 2,
          tenantId,
        }),
      );
    } catch {
      pkg = await packageRepo.findOne({
        where: { name: packageName, tenantId },
      });
    }
  }

  if (!pkg) {
    throw new Error('Failed to seed/find package');
  }

  // 6. Create Client
  console.log('SEED DEBUG: Starting Client seeding phase');
  const clientEmail = 'test.client@example.com';
  try {
    console.log('SEED DEBUG: Finding client by email:', clientEmail);
    let client = await clientRepo.findOne({
      where: { email: clientEmail, tenantId },
    });
    console.log(
      'SEED DEBUG: Client search result:',
      client ? 'Found' : 'Not Found',
    );
    if (!client) {
      console.log('SEED DEBUG: Creating new client object');
      try {
        client = await clientRepo.save(
          clientRepo.create({
            name: 'Test Client',
            email: clientEmail,
            phone: '+1234567890',
            tenantId,
          }),
        );
        console.log('SEED DEBUG: Client saved successfully');
      } catch (saveError: unknown) {
        console.error(
          'SEED DEBUG: Client save failed:',
          saveError instanceof Error ? saveError.message : String(saveError),
        );
        console.log('SEED DEBUG: Retrying client find after save failure');
        client = (await clientRepo.findOne({
          where: { email: clientEmail, tenantId },
        })) as Client;
        console.log(
          'SEED DEBUG: Client retry find result:',
          client ? 'Found' : 'Not Found',
        );
      }
    }

    console.log('SEED DEBUG: Seeding finished successfully');
    return { tenantId, admin, staff, pkg, taskType, client };
  } catch (outerError: unknown) {
    console.error(
      'SEED DEBUG: CRITICAL ERROR IN SEEDER:',
      outerError instanceof Error ? outerError.message : String(outerError),
    );
    if (outerError instanceof Error && outerError.stack) {
      console.error(outerError.stack);
    }
    throw outerError;
  }
}
