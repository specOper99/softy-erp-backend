import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly isEnabled: boolean;

    constructor(
        private readonly mailerService: MailerService,
        private readonly configService: ConfigService,
    ) {
        this.isEnabled = !!this.configService.get('MAIL_USER');
        if (!this.isEnabled) {
            this.logger.warn('Email sending is disabled (MAIL_USER not configured)');
        }
    }

    async sendBookingConfirmation(data: BookingEmailData): Promise<void> {
        if (!this.isEnabled) {
            this.logger.log(`[DEV] Booking confirmation email to ${data.clientEmail}`, data);
            return;
        }

        try {
            await this.mailerService.sendMail({
                to: data.clientEmail,
                subject: `Booking Confirmed - ${data.packageName}`,
                template: 'booking-confirmation',
                context: {
                    clientName: data.clientName,
                    eventDate: this.formatDate(data.eventDate),
                    packageName: data.packageName,
                    totalPrice: this.formatCurrency(data.totalPrice),
                    bookingId: data.bookingId,
                    year: new Date().getFullYear(),
                },
            });
            this.logger.log(`Booking confirmation sent to ${data.clientEmail}`);
        } catch (error) {
            this.logger.error(`Failed to send booking confirmation to ${data.clientEmail}`, error);
        }
    }

    async sendTaskAssignment(data: TaskAssignmentEmailData): Promise<void> {
        if (!this.isEnabled) {
            this.logger.log(`[DEV] Task assignment email to ${data.employeeEmail}`, data);
            return;
        }

        try {
            await this.mailerService.sendMail({
                to: data.employeeEmail,
                subject: `New Task Assigned: ${data.taskType}`,
                template: 'task-assignment',
                context: {
                    employeeName: data.employeeName,
                    taskType: data.taskType,
                    clientName: data.clientName,
                    eventDate: this.formatDate(data.eventDate),
                    commission: this.formatCurrency(data.commission),
                    year: new Date().getFullYear(),
                },
            });
            this.logger.log(`Task assignment sent to ${data.employeeEmail}`);
        } catch (error) {
            this.logger.error(`Failed to send task assignment to ${data.employeeEmail}`, error);
        }
    }

    async sendPayrollNotification(data: PayrollEmailData): Promise<void> {
        if (!this.isEnabled) {
            this.logger.log(`[DEV] Payroll notification email to ${data.employeeEmail}`, data);
            return;
        }

        try {
            await this.mailerService.sendMail({
                to: data.employeeEmail,
                subject: 'Payroll Processed - Payment Details',
                template: 'payroll-notification',
                context: {
                    employeeName: data.employeeName,
                    baseSalary: this.formatCurrency(data.baseSalary),
                    commission: this.formatCurrency(data.commission),
                    totalPayout: this.formatCurrency(data.totalPayout),
                    payrollDate: this.formatDate(data.payrollDate),
                    year: new Date().getFullYear(),
                },
            });
            this.logger.log(`Payroll notification sent to ${data.employeeEmail}`);
        } catch (error) {
            this.logger.error(`Failed to send payroll notification to ${data.employeeEmail}`, error);
        }
    }

    private formatDate(date: Date): string {
        return new Date(date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(amount);
    }
}
