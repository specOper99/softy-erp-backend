import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Role } from '../../src/common/enums';
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

  // 1. Create Tenant
  let tenant = await tenantRepo.findOne({
    where: { slug: 'chapters-studio-hq' },
  });
  if (!tenant) {
    tenant = tenantRepo.create({
      name: 'Chapters Studio HQ',
      slug: 'chapters-studio-hq',
    });
    tenant = await tenantRepo.save(tenant);
  }
  const tenantId = tenant.id;

  // 2. Create/Update Admin
  const adminEmail = 'admin@chapters.studio';
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
  } else {
    admin.passwordHash = adminPasswordHash;
    admin.tenantId = tenantId;
    admin = await userRepo.save(admin);
  }

  // Sync admin profile/wallet if they exist
  await profileRepo.update({ userId: admin.id }, { tenantId });
  const adminWallet = await walletRepo.findOne({ where: { userId: admin.id } });
  if (adminWallet) {
    await walletRepo.update({ id: adminWallet.id }, { tenantId });
  } else {
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
  const staffEmail = 'john.photographer@chapters.studio';
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
  } else {
    staff.passwordHash = staffPasswordHash;
    staff.tenantId = tenantId;
    staff = await userRepo.save(staff);
  }

  // Sync staff profile/wallet
  const staffProfile = await profileRepo.findOne({
    where: { userId: staff.id },
  });
  if (!staffProfile) {
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
  } else {
    await profileRepo.update({ id: staffProfile.id }, { tenantId });
  }

  const staffWallet = await walletRepo.findOne({
    where: { userId: staff.id },
  });
  if (!staffWallet) {
    await walletRepo.save(
      walletRepo.create({
        userId: staff.id,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
      }),
    );
  } else {
    await walletRepo.update({ id: staffWallet.id }, { tenantId });
  }

  // 4. Create Task Types
  const taskTypeName = 'Photography';
  let taskType = await taskTypeRepo.findOne({
    where: { name: taskTypeName, tenantId },
  });
  if (!taskType) {
    taskType = await taskTypeRepo.save(
      taskTypeRepo.create({
        name: taskTypeName,
        description: 'Photos',
        defaultCommissionAmount: 100,
        tenantId,
      }),
    );
  }

  // 5. Create Package
  const packageName = 'Wedding Premium';
  let pkg = await packageRepo.findOne({
    where: { name: packageName, tenantId },
  });
  if (!pkg) {
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
  }

  return { tenantId, admin, staff, pkg, taskType };
}
