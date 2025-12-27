import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

// Import all entities
import { AuditLog } from '../modules/audit/entities/audit-log.entity';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { Booking } from '../modules/bookings/entities/booking.entity';
import { PackageItem } from '../modules/catalog/entities/package-item.entity';
import { ServicePackage } from '../modules/catalog/entities/service-package.entity';
import { TaskType } from '../modules/catalog/entities/task-type.entity';
import { EmployeeWallet } from '../modules/finance/entities/employee-wallet.entity';
import { Transaction } from '../modules/finance/entities/transaction.entity';
import { Profile } from '../modules/hr/entities/profile.entity';
import { Attachment } from '../modules/media/entities/attachment.entity';
import { Task } from '../modules/tasks/entities/task.entity';
import { User } from '../modules/users/entities/user.entity';

export const dataSourceOptions: DataSourceOptions = {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434', 10),
    username: process.env.DB_USERNAME || 'chapters_studio',
    password: process.env.DB_PASSWORD || 'chapters_studio_secret',
    database: process.env.DB_DATABASE || 'chapters_studio',
    entities: [
        User,
        Profile,
        ServicePackage,
        PackageItem,
        TaskType,
        Booking,
        Task,
        Transaction,
        EmployeeWallet,
        AuditLog,
        RefreshToken,
        Attachment,
    ],
    migrations: ['src/database/migrations/*.ts'],
    logging: process.env.DB_LOGGING === 'true',
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
