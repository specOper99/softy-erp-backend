import type { CreateAuditLogDto } from '../api/dto/create-audit-log.dto';

export abstract class AuditPublisher {
  abstract log(data: CreateAuditLogDto): Promise<void>;
}
