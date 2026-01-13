import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CursorPaginationDto } from '../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { FileTypeUtil } from '../../common/utils/file-type.util';
import { Attachment } from './entities/attachment.entity';
import { StorageService } from './storage.service';

export interface UploadFileParams {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
  bookingId?: string;
  taskId?: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    private readonly storageService: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Validate that bookingId and taskId belong to the current tenant
   */
  private async validateReferences(tenantId: string, bookingId?: string, taskId?: string): Promise<void> {
    if (bookingId) {
      const booking = await this.dataSource.manager.findOne('Booking', {
        where: { id: bookingId, tenantId },
      });
      if (!booking) {
        throw new BadRequestException('media.booking_not_found_in_tenant');
      }
    }
    if (taskId) {
      const task = await this.dataSource.manager.findOne('Task', {
        where: { id: taskId, tenantId },
      });
      if (!task) {
        throw new BadRequestException('media.task_not_found_in_tenant');
      }
    }
  }

  /**
   * Upload a file and create an attachment record
   */
  async uploadFile(params: UploadFileParams): Promise<Attachment> {
    const { buffer, originalName, mimeType, size, bookingId, taskId } = params;
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    // Validate bookingId/taskId belong to tenant
    await this.validateReferences(tenantId, bookingId, taskId);

    // Security: Validate File Type (Magic Bytes)
    const typeInfo = await FileTypeUtil.validateBuffer(buffer);

    if (!typeInfo || !StorageService.ALLOWED_MIME_TYPES.has(typeInfo.mime)) {
      throw new BadRequestException({
        key: 'media.invalid_file_type',
        args: { mimeType: typeInfo?.mime || 'unknown' },
      });
    }

    if (typeInfo.mime !== mimeType) {
      this.logger.warn(`MIME mismatch: Claimed ${mimeType}, Detected ${typeInfo.mime}`);
      // We can either reject or correct it. For security, rejection is safer if they mismatch significantly.
      // But some browsers are weird. Let's strictly enforce detected type matches whitelist at least.
      if (!StorageService.ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new BadRequestException('media.invalid_mime_type');
      }
    }

    // Generate storage key and upload to MinIO
    const key = await this.storageService.generateKey(originalName);
    const uploadResult = await this.storageService.uploadFile(buffer, key, mimeType);

    // Create attachment record
    const attachment = this.attachmentRepository.create({
      name: originalName,
      url: uploadResult.url,
      mimeType,
      size,
      bookingId: bookingId || null,
      taskId: taskId || null,
      tenantId,
    });

    const savedAttachment = await this.attachmentRepository.save(attachment);
    this.logger.log(`Uploaded file: ${originalName} -> ${key}`);

    return savedAttachment;
  }

  /**
   * Get a pre-signed URL for direct upload
   */
  async getPresignedUploadUrl(
    filename: string,
    mimeType: string,
    bookingId?: string,
    taskId?: string,
  ): Promise<{ uploadUrl: string; attachment: Attachment }> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    // Validate bookingId/taskId belong to tenant
    await this.validateReferences(tenantId, bookingId, taskId);

    // Security: Validate MIME type against whitelist
    if (!StorageService.ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException({
        key: 'media.unsupported_file_type',
        args: {
          mimeType,
          allowed: [...StorageService.ALLOWED_MIME_TYPES].join(', '),
        },
      });
    }

    const key = await this.storageService.generateKey(filename);
    const uploadUrl = await this.storageService.getPresignedUploadUrl(key, mimeType);

    // Create attachment record with pending status
    const attachment = this.attachmentRepository.create({
      name: filename,
      url: `${key}`, // store key; download uses presigned URL
      mimeType,
      size: 0, // Will be updated after upload confirmation
      bookingId: bookingId || null,
      taskId: taskId || null,
      tenantId,
    });

    const savedAttachment = await this.attachmentRepository.save(attachment);

    return { uploadUrl, attachment: savedAttachment };
  }

  /**
   * Confirm upload and update attachment with final URL
   */
  async confirmUpload(attachmentId: string, size: number): Promise<Attachment> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }
    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId, tenantId },
    });

    if (!attachment) {
      throw new NotFoundException({
        key: 'media.attachment_not_found',
        args: { id: attachmentId },
      });
    }

    // Update with actual file size
    attachment.size = size;
    return this.attachmentRepository.save(attachment);
  }

  /**
   * Create attachment record with external URL (for legacy support)
   */
  async create(data: Partial<Attachment>): Promise<Attachment> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }

    const attachment = this.attachmentRepository.create(data);
    if (attachment.tenantId && attachment.tenantId !== tenantId) {
      throw new ForbiddenException('media.cross_tenant_denied');
    }
    attachment.tenantId = tenantId;
    return this.attachmentRepository.save(attachment);
  }

  async findAll(query: PaginationDto = new PaginationDto()): Promise<Attachment[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }
    return this.attachmentRepository.find({
      where: { tenantId },
      relations: ['booking', 'task'],
      order: { createdAt: 'DESC' },
      skip: query.getSkip(),
      take: query.getTake(),
    });
  }

  async findAllCursor(query: CursorPaginationDto): Promise<{ data: Attachment[]; nextCursor: string | null }> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }
    const limit = query.limit || 20;

    const qb = this.attachmentRepository.createQueryBuilder('attachment');

    qb.leftJoinAndSelect('attachment.booking', 'booking')
      .leftJoinAndSelect('attachment.task', 'task')
      .where('attachment.tenantId = :tenantId', { tenantId })
      .orderBy('attachment.createdAt', 'DESC')
      .addOrderBy('attachment.id', 'DESC')
      .take(limit + 1);

    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, 'base64').toString('utf-8');
      const [dateStr, id] = decoded.split('|');
      const date = new Date(dateStr);

      qb.andWhere('(attachment.createdAt < :date OR (attachment.createdAt = :date AND attachment.id < :id))', {
        date,
        id,
      });
    }

    const attachments = await qb.getMany();
    let nextCursor: string | null = null;

    if (attachments.length > limit) {
      attachments.pop();
      const lastItem = attachments[attachments.length - 1];
      const cursorData = `${lastItem.createdAt.toISOString()}|${lastItem.id}`;
      nextCursor = Buffer.from(cursorData).toString('base64');
    }

    return { data: attachments, nextCursor };
  }

  async findOne(id: string): Promise<Attachment> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }
    const attachment = await this.attachmentRepository.findOne({
      where: { id, tenantId },
      relations: ['booking', 'task'],
    });
    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }
    return attachment;
  }

  async findByBooking(bookingId: string): Promise<Attachment[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }
    return this.attachmentRepository.find({
      where: { bookingId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByTask(taskId: string): Promise<Attachment[]> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }
    return this.attachmentRepository.find({
      where: { taskId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a pre-signed download URL for an attachment
   */
  async getDownloadUrl(id: string): Promise<string> {
    const attachment = await this.findOne(id);
    const key = this.storageService.extractKeyFromUrl(attachment.url);

    if (!key) {
      // Return original URL if it's an external URL
      return attachment.url;
    }

    return this.storageService.getPresignedDownloadUrl(key);
  }

  /**
   * Delete attachment and its file from storage
   */
  async remove(id: string): Promise<void> {
    const tenantId = TenantContextService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('common.tenant_missing');
    }
    const attachment = await this.attachmentRepository.findOne({
      where: { id, tenantId },
    });
    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }

    // Try to delete from storage
    const key = this.storageService.extractKeyFromUrl(attachment.url);
    if (key) {
      try {
        await this.storageService.deleteFile(key);
      } catch (error) {
        this.logger.warn(`Failed to delete file from storage: ${key}`, error);
      }
    }

    await this.attachmentRepository.remove(attachment);
  }
}
