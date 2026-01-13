import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  BookingTrendDto,
  DashboardKpiDto,
  PackageStatsDto,
  RevenueStatsDto,
  StaffPerformanceDto,
} from '../dto/dashboard.dto';
import type { PnLReportRow, RevenueByPackageRow } from '../types/report.types';

@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);

  async generateDashboardPdf(data: {
    kpis: DashboardKpiDto;
    revenue: RevenueStatsDto;
    bookingTrends: BookingTrendDto[];
    staffPerformance: StaffPerformanceDto[];
    packageStats: PackageStatsDto[];
  }): Promise<Uint8Array> {
    try {
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage();
      const { height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const fontSize = 12;
      let y = height - 50;

      // Title
      page.drawText('Dashboard Report', {
        x: 50,
        y,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      y -= 40;

      // KPIs Section
      page.drawText('Key Performance Indicators', {
        x: 50,
        y,
        size: 16,
        font: boldFont,
      });
      y -= 25;

      const kpiItems = [
        `Total Revenue: ${data.kpis.totalRevenue}`,
        `Total Bookings: ${data.kpis.totalBookings}`,
        `Task Completion: ${data.kpis.taskCompletionRate.toFixed(1)}%`,
        `Avg Booking Value: ${data.kpis.averageBookingValue.toFixed(2)}`,
      ];

      kpiItems.forEach((item) => {
        page.drawText(`• ${item}`, { x: 60, y, size: fontSize, font });
        y -= 20;
      });
      y -= 20;

      // Revenue Section
      page.drawText('Revenue Summary (Recent Months)', {
        x: 50,
        y,
        size: 16,
        font: boldFont,
      });
      y -= 25;

      data.revenue.revenueByMonth.slice(0, 5).forEach((m) => {
        page.drawText(`${m.month}: ${m.revenue} - Net: ${m.net}`, {
          x: 60,
          y,
          size: fontSize,
          font,
        });
        y -= 20;
      });
      y -= 20;

      // Staff Performance Section
      if (y < 100) {
        page = pdfDoc.addPage();
        y = height - 50;
      }
      page.drawText('Top Staff Performance', {
        x: 50,
        y,
        size: 16,
        font: boldFont,
      });
      y -= 25;

      data.staffPerformance.slice(0, 5).forEach((s) => {
        page.drawText(`${s.staffName}: ${s.completedTasks} tasks`, {
          x: 60,
          y,
          size: fontSize,
          font,
        });
        y -= 20;
      });

      const pdfBytes = await pdfDoc.save();
      return pdfBytes;
    } catch (error) {
      this.logger.error('Failed to generate PDF report', error);
      throw error;
    }
  }

  async generatePnLPdf(data: PnLReportRow[]): Promise<Uint8Array> {
    try {
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      let y = height - 50;

      page.drawText('Profit & Loss Report', {
        x: 50,
        y,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      y -= 40;

      // Table Header
      const colWidth = 100;
      const headers = ['Period', 'Income', 'Expenses', 'Payroll', 'Net'];
      headers.forEach((h, i) => {
        page.drawText(h, { x: 50 + i * colWidth, y, size: 12, font: boldFont });
      });
      y -= 20;
      page.drawLine({
        start: { x: 50, y: y + 10 },
        end: { x: width - 50, y: y + 10 },
        thickness: 1,
      });

      // Data Rows
      for (const row of data) {
        if (y < 50) {
          page = pdfDoc.addPage();
          y = height - 50;
        }

        page.drawText(row.period, { x: 50, y, size: 10, font });
        page.drawText(row.income.toFixed(2), { x: 150, y, size: 10, font });
        page.drawText(row.expenses.toFixed(2), { x: 250, y, size: 10, font });
        page.drawText(row.payroll.toFixed(2), { x: 350, y, size: 10, font });

        const netColor = row.net >= 0 ? rgb(0, 0.5, 0) : rgb(0.8, 0, 0);
        page.drawText(row.net.toFixed(2), {
          x: 450,
          y,
          size: 10,
          font: boldFont,
          color: netColor,
        });
        y -= 20;
      }

      return pdfDoc.save();
    } catch (error) {
      this.logger.error('Failed to generate P&L PDF', error);
      throw error;
    }
  }

  async generateRevenueByPackagePdf(data: RevenueByPackageRow[]): Promise<Uint8Array> {
    try {
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      let y = height - 50;

      page.drawText('Revenue by Package', {
        x: 50,
        y,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      y -= 40;

      // Table Header
      page.drawText('Package Name', { x: 50, y, size: 12, font: boldFont });
      page.drawText('Bookings', { x: 300, y, size: 12, font: boldFont });
      page.drawText('Total Revenue', { x: 400, y, size: 12, font: boldFont });
      y -= 20;
      page.drawLine({
        start: { x: 50, y: y + 10 },
        end: { x: width - 50, y: y + 10 },
        thickness: 1,
      });

      // Data Rows
      for (const row of data) {
        if (y < 50) {
          page = pdfDoc.addPage();
          y = height - 50;
        }

        page.drawText(row.packageName, { x: 50, y, size: 10, font });
        page.drawText(row.bookingCount.toString(), {
          x: 300,
          y,
          size: 10,
          font,
        });
        page.drawText(row.totalRevenue.toFixed(2), {
          x: 400,
          y,
          size: 10,
          font,
        });
        y -= 20;
      }

      return pdfDoc.save();
    } catch (error) {
      this.logger.error('Failed to generate Revenue by Package PDF', error);
      throw error;
    }
  }
}
