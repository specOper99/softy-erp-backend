import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateNotificationDto, NotificationFilterDto } from '../dto/notification.dto';
import { Notification } from '../entities/notification.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async createNotification(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create(dto);
    return this.notificationRepo.save(notification);
  }

  async getUserNotifications(
    userId: string,
    tenantId: string,
    filter: NotificationFilterDto,
  ): Promise<{ data: Notification[]; total: number; page: number; limit: number }> {
    const { read, type, page = 1, limit = 20 } = filter;

    const queryBuilder = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.tenantId = :tenantId', { tenantId });

    if (read !== undefined) {
      queryBuilder.andWhere('notification.read = :read', { read });
    }

    if (type) {
      queryBuilder.andWhere('notification.type = :type', { type });
    }

    queryBuilder
      .orderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async markAsRead(notificationId: string, userId: string, tenantId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId, tenantId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${notificationId} not found`);
    }

    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      await this.notificationRepo.save(notification);
    }

    return notification;
  }

  async markAllAsRead(userId: string, tenantId: string): Promise<void> {
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ read: true, readAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere('tenantId = :tenantId', { tenantId })
      .andWhere('read = :read', { read: false })
      .execute();

    this.logger.log(`Marked all notifications as read for user ${userId}`);
  }

  async getUnreadCount(userId: string, tenantId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, tenantId, read: false },
    });
  }

  async deleteNotification(notificationId: string, userId: string, tenantId: string): Promise<void> {
    const result = await this.notificationRepo.delete({
      id: notificationId,
      userId,
      tenantId,
    });

    if (result.affected === 0) {
      throw new NotFoundException(`Notification with ID ${notificationId} not found`);
    }
  }
}
