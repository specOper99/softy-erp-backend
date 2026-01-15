import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import archiver from 'archiver';
import { createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Repository } from 'typeorm';
import { BUSINESS_CONSTANTS } from '../../common/constants/business.constants';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { Booking } from '../bookings/entities/booking.entity';
import { Transaction } from '../finance/entities/transaction.entity';
import { Profile } from '../hr/entities/profile.entity';
import { StorageService } from '../media/storage.service';
import { Task } from '../tasks/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { CreatePrivacyRequestDto } from './dto/privacy.dto';
import { PrivacyRequest, PrivacyRequestStatus, PrivacyRequestType } from './entities/privacy-request.entity';

interface UserDataExport {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    emailVerified: boolean;
    isMfaEnabled: boolean;
    createdAt: Date;
  };
  profile: Partial<Profile> | null;
  bookings: Partial<Booking>[];
  tasks: Partial<Task>[];
  transactions: Partial<Transaction>[];
}

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);
  private readonly tempDir = BUSINESS_CONSTANTS.PRIVACY.TEMP_EXPORT_DIR;

  constructor(
    @InjectRepository(PrivacyRequest)
    private readonly privacyRequestRepository: Repository<PrivacyRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly storageService: StorageService,
  ) {}

  async createRequest(userId: string, dto: CreatePrivacyRequestDto): Promise<PrivacyRequest> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    const existingPending = await this.privacyRequestRepository.findOne({
      where: {
        userId,
        tenantId,
        type: dto.type,
        status: PrivacyRequestStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new BadRequestException(`A pending ${dto.type} request already exists`);
    }

    const request = this.privacyRequestRepository.create({
      userId,
      tenantId,
      type: dto.type,
      status: PrivacyRequestStatus.PENDING,
      metadata: dto.reason ? { reason: dto.reason } : undefined,
    });

    return this.privacyRequestRepository.save(request);
  }

  async getMyRequests(userId: string): Promise<PrivacyRequest[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    // PERFORMANCE: Added limit to prevent memory exhaustion
    return this.privacyRequestRepository.find({
      where: { userId, tenantId },
      order: { requestedAt: 'DESC' },
      take: 100,
    });
  }

  async getRequestById(requestId: string, userId: string): Promise<PrivacyRequest> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    const request = await this.privacyRequestRepository.findOne({
      where: { id: requestId, userId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Privacy request not found');
    }

    return request;
  }

  async cancelRequest(requestId: string, userId: string): Promise<PrivacyRequest> {
    const request = await this.getRequestById(requestId, userId);

    if (request.status !== PrivacyRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }

    request.cancel();
    return this.privacyRequestRepository.save(request);
  }

  async processDataExport(requestId: string): Promise<void> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    const request = await this.privacyRequestRepository.findOne({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Privacy request not found');
    }

    if (request.type !== PrivacyRequestType.DATA_EXPORT) {
      throw new BadRequestException('Invalid request type');
    }

    request.startProcessing();
    await this.privacyRequestRepository.save(request);

    try {
      const exportData = await this.collectUserData(request.userId, tenantId);
      const { filePath, key } = await this.createExportZip(request.userId, exportData);
      const downloadUrl = await this.storageService.getPresignedDownloadUrl(key, 7 * 24 * 3600);

      request.complete(downloadUrl, filePath);
      await this.privacyRequestRepository.save(request);

      this.logger.log(`Data export completed for user ${request.userId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      request.fail(errorMessage);
      await this.privacyRequestRepository.save(request);
      this.logger.error(`Data export failed for user ${request.userId}`, error);
      throw error;
    }
  }

  private async collectUserData(userId: string, tenantId: string): Promise<UserDataExport> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [profile, bookings, tasks, transactions] = await Promise.all([
      this.profileRepository.findOne({ where: { userId, tenantId } }),
      // PERFORMANCE: Added limit to prevent memory exhaustion on large datasets
      this.bookingRepository.find({
        where: { tenantId },
        take: 1000,
        order: { createdAt: 'DESC' },
      }),
      this.taskRepository.find({ where: { assignedUserId: userId, tenantId } }),
      // PERFORMANCE: Added limit to prevent memory exhaustion on large datasets
      this.transactionRepository.find({
        where: { tenantId },
        take: 1000,
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        isMfaEnabled: user.isMfaEnabled,
        createdAt: user.createdAt,
      },
      profile: profile
        ? {
            firstName: profile.firstName,
            lastName: profile.lastName,
            phone: profile.phone,
            address: profile.address,
          }
        : null,
      bookings: bookings.map((b) => ({
        id: b.id,
        eventDate: b.eventDate,
        status: b.status,
        totalPrice: b.totalPrice,
        createdAt: b.createdAt,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        status: t.status,
        commissionSnapshot: t.commissionSnapshot,
        createdAt: t.createdAt,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        createdAt: t.createdAt,
      })),
    };
  }

  private async createExportZip(userId: string, data: UserDataExport): Promise<{ filePath: string; key: string }> {
    // SECURITY: Sanitize userId to prevent path traversal attacks
    const safeUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
    if (safeUserId !== userId || safeUserId.length === 0) {
      throw new BadRequestException('Invalid user ID format');
    }

    await fs.mkdir(this.tempDir, { recursive: true });

    const timestamp = Date.now();
    const filename = `privacy-export-${safeUserId}-${timestamp}.zip`;
    const localPath = path.join(this.tempDir, filename);

    // SECURITY: Validate path is within temp directory (prevents path traversal)
    const resolvedPath = path.resolve(localPath);
    const resolvedBase = path.resolve(this.tempDir);
    if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
      throw new BadRequestException('Invalid file path');
    }

    const output = createWriteStream(localPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.append(JSON.stringify(data, null, 2), { name: 'user-data.json' });
    archive.append(JSON.stringify(data.bookings, null, 2), {
      name: 'bookings.json',
    });
    archive.append(JSON.stringify(data.tasks, null, 2), { name: 'tasks.json' });
    archive.append(JSON.stringify(data.transactions, null, 2), {
      name: 'transactions.json',
    });

    await archive.finalize();

    await new Promise<void>((resolve, reject) => {
      const onClose = () => {
        output.removeListener('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        output.removeListener('close', onClose);
        reject(err);
      };
      output.once('close', onClose);
      output.once('error', onError);
    });

    // SECURITY: Validate file size to prevent disk exhaustion attacks
    const stats = await fs.stat(localPath);
    const maxSizeBytes = BUSINESS_CONSTANTS.PRIVACY.MAX_EXPORT_SIZE_MB * 1024 * 1024;
    if (stats.size > maxSizeBytes) {
      await fs.unlink(localPath);
      throw new BadRequestException(
        `Export exceeds maximum size limit of ${BUSINESS_CONSTANTS.PRIVACY.MAX_EXPORT_SIZE_MB}MB`,
      );
    }

    const buffer = await fs.readFile(localPath);
    const key = `privacy-exports/${filename}`;
    await this.storageService.uploadFile(buffer, key, 'application/zip');

    await fs.unlink(localPath);

    return { filePath: localPath, key };
  }

  async processDataDeletion(requestId: string, processedBy: string): Promise<void> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    const request = await this.privacyRequestRepository.findOne({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Privacy request not found');
    }

    if (request.type !== PrivacyRequestType.DATA_DELETION) {
      throw new BadRequestException('Invalid request type');
    }

    request.startProcessing();
    request.processedBy = processedBy;
    await this.privacyRequestRepository.save(request);

    try {
      await this.anonymizeUserData(request.userId, tenantId);

      request.complete();
      await this.privacyRequestRepository.save(request);

      this.logger.log(`Data deletion completed for user ${request.userId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      request.fail(errorMessage);
      await this.privacyRequestRepository.save(request);
      this.logger.error(`Data deletion failed for user ${request.userId}`, error);
      throw error;
    }
  }

  private async anonymizeUserData(userId: string, tenantId: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const anonymizedEmail = `deleted-${userId.slice(0, 8)}@anonymized.local`;

    await this.userRepository.update(
      { id: userId },
      {
        email: anonymizedEmail,
        passwordHash: 'DELETED',
        mfaSecret: '',
        mfaRecoveryCodes: [],
        isActive: false,
        deletedAt: new Date(),
      },
    );

    await this.profileRepository.update(
      { userId },
      {
        firstName: 'Deleted',
        lastName: 'User',
        phone: undefined,
        address: undefined,
      },
    );

    this.logger.log(`User ${userId} data anonymized`);
  }

  async getPendingRequests(): Promise<PrivacyRequest[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    // PERFORMANCE: Added limit to prevent memory exhaustion
    return this.privacyRequestRepository.find({
      where: { tenantId, status: PrivacyRequestStatus.PENDING },
      order: { requestedAt: 'ASC' },
      relations: ['user'],
      take: 100,
    });
  }
}
