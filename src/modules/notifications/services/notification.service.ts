import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateNotificationDto, NotificationFilterDto } from '../dto/notification.dto';
import { Notification } from '../entities/notification.entity';
import { NotificationRepository } from '../repositories/notification.repository';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly notificationRepo: NotificationRepository) {}

  async createNotification(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create(dto);
    return this.notificationRepo.save(notification);
  }

  async getUserNotifications(
    userId: string,
    filter: NotificationFilterDto,
  ): Promise<{ data: Notification[]; total: number; page: number; limit: number }> {
    const { read, type, page = 1, limit = 20 } = filter;

    const queryBuilder = this.notificationRepo
      .createQueryBuilder('notification')
      .andWhere('notification.userId = :userId', { userId });

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

  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
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

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo
      .createQueryBuilder('notification')
      .update(Notification)
      .set({ read: true, readAt: new Date() })
      .andWhere('userId = :userId', { userId })
      .andWhere('read = :read', { read: false })
      .execute();

    this.logger.log(`Marked all notifications as read for user ${userId}`);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, read: false },
    });
  }

  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.delete({
      id: notificationId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException(`Notification with ID ${notificationId} not found`);
    }
  }

  // Client Portal Methods
  async create(dto: CreateNotificationDto): Promise<Notification> {
    return this.createNotification(dto);
  }

  async findByClient(
    tenantId: string,
    clientId: string,
    pagination: { page?: number; limit?: number },
  ): Promise<[Notification[], number]> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 10;

    const queryBuilder = this.notificationRepo
      .createQueryBuilder('notification')
      .andWhere('notification.tenantId = :tenantId', { tenantId })
      .andWhere('notification.clientId = :clientId', { clientId })
      .orderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    return queryBuilder.getManyAndCount();
  }

  async markAsReadForClient(tenantId: string, clientId: string, notificationId: string): Promise<void> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, tenantId, clientId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${notificationId} not found`);
    }

    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      await this.notificationRepo.save(notification);
    }
  }
}
