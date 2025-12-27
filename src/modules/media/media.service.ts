import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  /**
   * Upload a file and create an attachment record
   */
  async uploadFile(params: UploadFileParams): Promise<Attachment> {
    const { buffer, originalName, mimeType, size, bookingId, taskId } = params;

    // Generate storage key and upload to MinIO
    const key = this.storageService.generateKey(originalName);
    const uploadResult = await this.storageService.uploadFile(
      buffer,
      key,
      mimeType,
    );

    // Create attachment record
    const attachment = this.attachmentRepository.create({
      name: originalName,
      url: uploadResult.url,
      mimeType,
      size,
      bookingId: bookingId || null,
      taskId: taskId || null,
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
    const key = this.storageService.generateKey(filename);
    const uploadUrl = await this.storageService.getPresignedUploadUrl(
      key,
      mimeType,
    );

    // Create attachment record with pending status
    const attachment = this.attachmentRepository.create({
      name: filename,
      url: `${key}`, // Will be updated after upload confirmation
      mimeType,
      size: 0, // Will be updated after upload confirmation
      bookingId: bookingId || null,
      taskId: taskId || null,
    });

    const savedAttachment = await this.attachmentRepository.save(attachment);

    return { uploadUrl, attachment: savedAttachment };
  }

  /**
   * Confirm upload and update attachment with final URL
   */
  async confirmUpload(attachmentId: string, size: number): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException(
        `Attachment with ID ${attachmentId} not found`,
      );
    }

    // Update with actual file size
    attachment.size = size;
    return this.attachmentRepository.save(attachment);
  }

  /**
   * Create attachment record with external URL (for legacy support)
   */
  async create(data: Partial<Attachment>): Promise<Attachment> {
    const attachment = this.attachmentRepository.create(data);
    return this.attachmentRepository.save(attachment);
  }

  async findAll(): Promise<Attachment[]> {
    return this.attachmentRepository.find({
      relations: ['booking', 'task'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
      relations: ['booking', 'task'],
    });
    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }
    return attachment;
  }

  async findByBooking(bookingId: string): Promise<Attachment[]> {
    return this.attachmentRepository.find({
      where: { bookingId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByTask(taskId: string): Promise<Attachment[]> {
    return this.attachmentRepository.find({
      where: { taskId },
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
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
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
