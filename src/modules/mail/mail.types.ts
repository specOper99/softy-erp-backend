export interface BookingEmailData {
  clientName: string;
  clientEmail: string;
  eventDate: Date;
  packageName: string;
  totalPrice: number;
  bookingId: string;
}

export interface TaskAssignmentEmailData {
  employeeName: string;
  employeeEmail: string;
  taskType: string;
  clientName: string;
  eventDate: Date;
  commission: number;
}

export interface PayrollEmailData {
  employeeName: string;
  employeeEmail: string;
  baseSalary: number;
  commission: number;
  totalPayout: number;
  payrollDate: Date;
}

export interface MagicLinkEmailData {
  clientEmail: string;
  clientName: string;
  token: string;
  expiresInHours: number;
  tenantSlug: string;
}

export interface PasswordResetEmailData {
  email: string;
  name: string;
  token: string;
  expiresInHours: number;
}

export interface EmailVerificationEmailData {
  email: string;
  name: string;
  token: string;
}

export interface NewDeviceLoginEmailData {
  email: string;
  name: string;
  device: string;
  ipAddress: string;
  time: Date;
  location?: string;
}

export interface SuspiciousActivityEmailData {
  email: string;
  name: string;
  activityType: string;
  details: string;
  time: Date;
  ipAddress: string;
  location?: string;
}

export interface EmailResult {
  success: boolean;
  email: string;
  error?: string;
  retried?: boolean;
}

export interface CancellationEmailData {
  clientName: string;
  to: string;
  bookingId: string;
  eventDate: Date;
  cancelledAt: Date;
  daysBeforeEvent: number;
  cancellationReason: string;
  amountPaid: number;
  refundAmount: number;
  refundPercentage: number;
}

export interface PaymentReceiptEmailData {
  clientName: string;
  to: string;
  bookingId: string;
  eventDate: Date;
  amount: number;
  paymentMethod: string;
  reference: string;
  totalPrice: number;
  amountPaid: number;
}

export interface BookingRescheduledStaffEmailData {
  employeeEmail: string;
  employeeName: string;
  bookingId: string;
  eventDate: Date;
  startTime: string | null;
}

export const EMAIL_QUEUE = 'email';

// Base interface for all email jobs with tenant context
export interface TenantAwareEmailJobData {
  tenantId: string;
}

// Queue job data types (tenant-aware)
export interface BookingConfirmationJobData extends TenantAwareEmailJobData {
  clientName: string;
  clientEmail: string;
  eventDate: string; // ISO date string
  packageName: string;
  totalPrice: number;
  bookingId: string;
}

export interface TaskAssignmentJobData extends TenantAwareEmailJobData {
  employeeName: string;
  employeeEmail: string;
  taskType: string;
  clientName: string;
  eventDate: string;
  commission: number;
}

export interface PayrollJobData extends TenantAwareEmailJobData {
  employeeName: string;
  employeeEmail: string;
  baseSalary: number;
  commission: number;
  totalPayout: number;
  payrollDate: string;
}

export interface BookingCancellationJobData extends TenantAwareEmailJobData {
  clientName: string;
  to: string;
  bookingId: string;
  eventDate: string;
  cancelledAt: string;
  daysBeforeEvent: number;
  cancellationReason: string;
  amountPaid: number;
  refundAmount: number;
  refundPercentage: number;
}

export interface PaymentReceiptJobData extends TenantAwareEmailJobData {
  clientName: string;
  to: string;
  bookingId: string;
  eventDate: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  totalPrice: number;
  amountPaid: number;
}

export interface PasswordResetEmailData {
  email: string;
  name: string;
  token: string;
  expiresInHours: number;
}

export interface EmailVerificationEmailData {
  email: string;
  name: string;
  token: string;
}

export interface NewDeviceLoginJobData extends TenantAwareEmailJobData {
  email: string;
  name: string;
  device: string;
  ipAddress: string;
  time: string;
  location?: string;
}

export interface SuspiciousActivityJobData extends TenantAwareEmailJobData {
  email: string;
  name: string;
  activityType: string;
  details: string;
  ipAddress: string;
  time: string;
  location?: string;
}

export type EmailJobData =
  | { type: 'booking-confirmation'; data: BookingConfirmationJobData }
  | { type: 'task-assignment'; data: TaskAssignmentJobData }
  | { type: 'payroll'; data: PayrollJobData }
  | { type: 'password-reset'; data: PasswordResetEmailData & { tenantId: string } }
  | { type: 'email-verification'; data: EmailVerificationEmailData & { tenantId: string } }
  | { type: 'booking-cancellation'; data: BookingCancellationJobData }
  | { type: 'payment-receipt'; data: PaymentReceiptJobData }
  | { type: 'new-device-login'; data: NewDeviceLoginJobData }
  | { type: 'suspicious-activity'; data: SuspiciousActivityJobData };
