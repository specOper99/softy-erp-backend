/**
 * Ticket priority levels.
 */
export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Payload for creating a ticket.
 */
export interface TicketPayload {
  title: string;
  description: string;
  priority: TicketPriority;
  labels?: string[];
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Abstract ticketing provider interface.
 */
export interface TicketingProvider {
  createTicket(payload: TicketPayload): Promise<string | null>;
  isEnabled(): boolean;
}
