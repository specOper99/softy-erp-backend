import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConsumerInbox } from '../entities/consumer-inbox.entity';

@Injectable()
export class ConsumerInboxService {
  constructor(
    @InjectRepository(ConsumerInbox)
    private readonly inboxRepository: Repository<ConsumerInbox>,
  ) {}

  /**
   * Returns true when this consumer has not yet processed the event.
   * Caller must commit inbox row in the same transaction as the side effect.
   */
  async tryClaim(consumerName: string, eventId: string, manager?: EntityManager): Promise<boolean> {
    const existing = manager
      ? await manager.findOne(ConsumerInbox, { where: { consumerName, eventId } })
      : await this.inboxRepository.findOne({ where: { consumerName, eventId } });
    return !existing;
  }

  async recordProcessed(consumerName: string, eventId: string, manager: EntityManager): Promise<void> {
    await manager.save(ConsumerInbox, { consumerName, eventId });
  }
}
