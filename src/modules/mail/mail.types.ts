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

export const EMAIL_QUEUE = 'email';

export interface BookingConfirmationJobData {
  clientName: string;
  clientEmail: string;
  eventDate: string; // ISO date string
  packageName: string;
  totalPrice: number;
  bookingId: string;
}

export interface TaskAssignmentJobData {
  employeeName: string;
  employeeEmail: string;
  taskType: string;
  clientName: string;
  eventDate: string;
  commission: number;
}

export interface PayrollJobData {
  employeeName: string;
  employeeEmail: string;
  baseSalary: number;
  commission: number;
  totalPayout: number;
  payrollDate: string;
}

export interface BookingCancellationJobData {
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

export interface PaymentReceiptJobData {
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

export type EmailJobData =
  | { type: 'booking-confirmation'; data: BookingConfirmationJobData }
  | { type: 'task-assignment'; data: TaskAssignmentJobData }
  | { type: 'payroll'; data: PayrollJobData }
  | { type: 'password-reset'; data: PasswordResetEmailData }
  | { type: 'email-verification'; data: EmailVerificationEmailData }
  | { type: 'booking-cancellation'; data: BookingCancellationJobData }
  | { type: 'payment-receipt'; data: PaymentReceiptJobData }
  | {
      type: 'new-device-login';
      data: Omit<NewDeviceLoginEmailData, 'time'> & { time: string };
    }
  | {
      type: 'suspicious-activity';
      data: Omit<SuspiciousActivityEmailData, 'time'> & { time: string };
    };
