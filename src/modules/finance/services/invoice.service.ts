import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { Booking } from '../../bookings/entities/booking.entity';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';

import { InvoiceRepository } from '../repositories/invoice.repository';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,

    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
  ) {}

  async createInvoice(bookingId: string): Promise<Invoice> {
    const tenantId = TenantContextService.getTenantId();

    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, tenantId },
      relations: ['client', 'servicePackage'],
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${bookingId} not found`);
    }

    const existingInvoice = await this.invoiceRepository.findOne({
      where: { bookingId },
    });

    if (existingInvoice) {
      return existingInvoice;
    }

    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${datePart}-${randomPart}`;

    const items = [
      {
        description: booking.servicePackage.name,
        quantity: 1,
        unitPrice: booking.subTotal,
        amount: booking.subTotal,
      },
    ];

    const invoice = this.invoiceRepository.create({
      booking,
      invoiceNumber,
      status: InvoiceStatus.DRAFT,
      issueDate: new Date(),
      dueDate: new Date(booking.eventDate),
      items,
      subTotal: booking.subTotal,
      taxTotal: booking.taxAmount,
      totalAmount: booking.totalPrice,
      currency: 'USD',
    });

    try {
      return await this.invoiceRepository.save(invoice);
    } catch (error) {
      // Handle unique constraint violation (concurrent duplicate creation)
      if ((error as { code?: string }).code === '23505') {
        const existing = await this.invoiceRepository.findOne({
          where: { bookingId },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async getInvoicePdf(invoiceId: string): Promise<Uint8Array> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId },
      relations: ['booking', 'booking.client'],
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${invoiceId} not found`);
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 12;
    const margin = 50;

    page.drawText('INVOICE', {
      x: margin,
      y: height - margin,
      size: 24,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    page.drawText(`# ${invoice.invoiceNumber}`, {
      x: width - margin - 150,
      y: height - margin,
      size: 14,
      font,
    });

    let yPos = height - margin - 60;
    page.drawText(`Date: ${invoice.issueDate.toISOString().split('T')[0]}`, {
      x: margin,
      y: yPos,
      size: fontSize,
      font,
    });

    yPos -= 20;
    page.drawText(`Due Date: ${invoice.dueDate.toISOString().split('T')[0]}`, {
      x: margin,
      y: yPos,
      size: fontSize,
      font,
    });

    yPos -= 40;
    const clientName = invoice.booking?.client?.name || 'Unknown Client';
    const clientEmail = invoice.booking?.client?.email || 'N/A';

    page.drawText('Bill To:', {
      x: margin,
      y: yPos,
      size: fontSize,
      font: boldFont,
    });

    yPos -= 20;
    page.drawText(clientName, {
      x: margin,
      y: yPos,
      size: fontSize,
      font,
    });

    yPos -= 20;
    page.drawText(clientEmail, {
      x: margin,
      y: yPos,
      size: fontSize,
      font,
    });

    page.drawText(`Status: ${invoice.status}`, {
      x: width - margin - 150,
      y: height - margin - 60,
      size: fontSize,
      font: boldFont,
      color: invoice.status === InvoiceStatus.PAID ? rgb(0, 0.5, 0) : rgb(0.5, 0, 0),
    });

    yPos -= 60;
    page.drawText('Description', {
      x: margin,
      y: yPos,
      size: fontSize,
      font: boldFont,
    });
    page.drawText('Qty', { x: 300, y: yPos, size: fontSize, font: boldFont });
    page.drawText('Price', { x: 350, y: yPos, size: fontSize, font: boldFont });
    page.drawText('Total', { x: 450, y: yPos, size: fontSize, font: boldFont });

    yPos -= 10;
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: width - margin, y: yPos },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    yPos -= 20;
    for (const item of invoice.items) {
      page.drawText(item.description, {
        x: margin,
        y: yPos,
        size: fontSize,
        font,
      });
      page.drawText(item.quantity.toString(), {
        x: 300,
        y: yPos,
        size: fontSize,
        font,
      });
      page.drawText(item.unitPrice.toFixed(2), {
        x: 350,
        y: yPos,
        size: fontSize,
        font,
      });
      page.drawText(item.amount.toFixed(2), {
        x: 450,
        y: yPos,
        size: fontSize,
        font,
      });
      yPos -= 20;
    }

    yPos -= 20;
    page.drawLine({
      start: { x: 300, y: yPos },
      end: { x: width - margin, y: yPos },
      thickness: 1,
      color: rgb(0, 0, 0),
    });

    yPos -= 20;
    page.drawText('Subtotal:', { x: 350, y: yPos, size: fontSize, font });
    page.drawText(invoice.subTotal.toFixed(2), {
      x: 450,
      y: yPos,
      size: fontSize,
      font,
    });

    yPos -= 20;
    page.drawText('Tax:', { x: 350, y: yPos, size: fontSize, font });
    page.drawText(invoice.taxTotal.toFixed(2), {
      x: 450,
      y: yPos,
      size: fontSize,
      font,
    });

    yPos -= 20;
    page.drawText('Total:', {
      x: 350,
      y: yPos,
      size: fontSize + 2,
      font: boldFont,
    });
    page.drawText(invoice.totalAmount.toFixed(2), {
      x: 450,
      y: yPos,
      size: fontSize + 2,
      font: boldFont,
    });

    page.drawText('Thank you for your business!', {
      x: margin,
      y: 50,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    return pdfDoc.save();
  }
}
