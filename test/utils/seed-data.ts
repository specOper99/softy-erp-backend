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

  // 2. Create Admin
  const adminEmail = 'admin@chapters.studio';
  let admin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!admin) {
    const passwordHash = await bcrypt.hash(
      process.env.SEED_ADMIN_PASSWORD || 'password123',
      10,
    );
    admin = userRepo.create({
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      tenantId,
    });
    admin = await userRepo.save(admin);
  }

  // 3. Create Staff
  const staffEmail = 'john.photographer@chapters.studio';
  let staff = await userRepo.findOne({ where: { email: staffEmail } });
  if (!staff) {
    const passwordHash = await bcrypt.hash(
      process.env.SEED_STAFF_PASSWORD || 'password123',
      10,
    );
    staff = userRepo.create({
      email: staffEmail,
      passwordHash,
      role: Role.FIELD_STAFF,
      isActive: true,
      tenantId,
    });
    staff = await userRepo.save(staff);

    // Profile
    await profileRepo.save(
      profileRepo.create({
        userId: staff.id,
        firstName: 'John',
        lastName: 'Doe',
        jobTitle: 'Photographer',
        baseSalary: 2000,
      }),
    );

    // Wallet
    await walletRepo.save(
      walletRepo.create({
        userId: staff.id,
        pendingBalance: 0,
        payableBalance: 0,
        tenantId,
      }),
    );
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
