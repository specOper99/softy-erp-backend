export class CreateAuditLogDto {
  userId?: string;
  action: string;
  entityName: string;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
}
