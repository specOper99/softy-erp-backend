import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Client } from '../../src/modules/bookings/entities/client.entity';
import { PackageItem } from '../../src/modules/catalog/entities/package-item.entity';
import { ServicePackage } from '../../src/modules/catalog/entities/service-package.entity';
import { TaskType } from '../../src/modules/catalog/entities/task-type.entity';
import { EmployeeWallet } from '../../src/modules/finance/entities/employee-wallet.entity';
import { Profile } from '../../src/modules/hr/entities/profile.entity';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { Role } from '../../src/modules/users/enums/role.enum';

import { SubscriptionPlan } from '../../src/modules/tenants/enums/subscription-plan.enum';

export async function seedTestDatabase(dataSource: DataSource) {
  const tenantRepo = dataSource.getRepository(Tenant);
  const userRepo = dataSource.getRepository(User);
  const profileRepo = dataSource.getRepository(Profile);
  const walletRepo = dataSource.getRepository(EmployeeWallet);
  const taskTypeRepo = dataSource.getRepository(TaskType);
  const packageRepo = dataSource.getRepository(ServicePackage);
  const packageItemRepo = dataSource.getRepository(PackageItem);
  const clientRepo = dataSource.getRepository(Client);

  // Generate random suffix for isolation
  const suffix = Date.now().toString().slice(-6);
  const tenantSlug = `chapters-studio-${suffix}`;

  // 1. Create Tenant
  let tenant = await tenantRepo.findOne({
    where: { slug: tenantSlug },
  });
  if (!tenant) {
    tenant = tenantRepo.create({
      name: `Chapters Studio ${suffix}`,
      slug: tenantSlug,
      subscriptionPlan: SubscriptionPlan.PRO,
    });
    tenant = await tenantRepo.save(tenant);
  }

  const tenantId = tenant.id;

  // 2. Create/Update Admin
  const adminEmail = `admin-${suffix}@chapters.studio`;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChaptersERP123!';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  let admin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!admin) {
    admin = userRepo.create({
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isActive: true,
      tenantId,
    });
    admin = await userRepo.save(admin);
  }

  // Sync admin profile/wallet if they exist
  const existingAdminProfile = await profileRepo.findOne({
    where: { userId: admin.id },
  });
  if (!existingAdminProfile) {
    await profileRepo.save(
      profileRepo.create({
        userId: admin.id,
        firstName: 'Admin',
        lastName: 'User',
        baseSalary: 0,
        tenantId,
      }),
    );
  }

  const adminWallet = await walletRepo.findOne({ where: { userId: admin.id } });
  if (!adminWallet) {
    await walletRepo.save(
      walletRepo.create({
        userId: admin.id,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
      }),
    );
  }

  // 3. Create/Update Staff
  const staffEmail = `staff-${suffix}@chapters.studio`;
  const staffPassword = process.env.SEED_STAFF_PASSWORD || 'ChaptersERP123!';
  const staffPasswordHash = await bcrypt.hash(staffPassword, 10);

  let staff = await userRepo.findOne({ where: { email: staffEmail } });
  if (!staff) {
    staff = userRepo.create({
      email: staffEmail,
      passwordHash: staffPasswordHash,
      role: Role.FIELD_STAFF,
      isActive: true,
      tenantId,
    });
    staff = await userRepo.save(staff);
  }

  if (!staff) {
    throw new Error('Failed to seed staff user');
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
  const clientEmail = 'test.client@example.com';
  try {
    let client = await clientRepo.findOne({
      where: { email: clientEmail, tenantId },
    });
    if (!client) {
      try {
        client = await clientRepo.save(
          clientRepo.create({
            name: 'Test Client',
            email: clientEmail,
            phone: '+1234567890',
            tenantId,
          }),
        );
      } catch {
        client = (await clientRepo.findOne({
          where: { email: clientEmail, tenantId },
        })) as Client;
      }
    }

    return { tenantId, admin, staff, pkg, taskType, client };
  } catch (outerError: unknown) {
    console.error('Seeder error:', outerError instanceof Error ? outerError.message : String(outerError));
    throw outerError;
  }
}
