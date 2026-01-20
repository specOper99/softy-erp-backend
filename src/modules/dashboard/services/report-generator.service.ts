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
    return this.generateTablePdf(
      'Profit & Loss Report',
      ['Period', 'Income', 'Expenses', 'Payroll', 'Net'],
      data,
      (row) => [row.period, row.income.toFixed(2), row.expenses.toFixed(2), row.payroll.toFixed(2), row.net.toFixed(2)],
      [50, 150, 250, 350, 450], // Column X positions
      (row) => (row.net >= 0 ? rgb(0, 0.5, 0) : rgb(0.8, 0, 0)), // Color logic for last column
    );
  }

  async generateRevenueByPackagePdf(data: RevenueByPackageRow[]): Promise<Uint8Array> {
    return this.generateTablePdf(
      'Revenue by Package',
      ['Package Name', 'Bookings', 'Total Revenue'],
      data,
      (row) => [row.packageName, row.bookingCount.toString(), row.totalRevenue.toFixed(2)],
      [50, 300, 400], // Column X positions
    );
  }

  private async generateTablePdf<T>(
    title: string,
    headers: string[],
    data: T[],
    rowMapper: (row: T) => string[],
    colXPositions: number[],
    lastColColorMapper?: (row: T) => import('pdf-lib').Color,
  ): Promise<Uint8Array> {
    try {
      const { pdfDoc, page: initialPage, font, boldFont, width, height, startY } = await this.initializePdf(title);
      let page = initialPage;
      let y = startY;

      // Table Header
      headers.forEach((h, i) => {
        page.drawText(h, { x: colXPositions[i], y, size: 12, font: boldFont });
      });
      y -= 20;
      this.drawTableSeparator(page, width, y);

      // Data Rows
      for (const row of data) {
        const check = this.checkPageBreak(pdfDoc, page, y, height);
        page = check.page;
        y = check.y;

        const cells = rowMapper(row);
        cells.forEach((cellText, i) => {
          const isLastCol = i === cells.length - 1;
          const color = isLastCol && lastColColorMapper ? lastColColorMapper(row) : undefined;

          page.drawText(cellText, {
            x: colXPositions[i],
            y,
            size: 10,
            font: isLastCol && lastColColorMapper ? boldFont : font, // Use bold if colored (net profit convention)
            color,
          });
        });

        y -= 20;
      }

      return pdfDoc.save();
    } catch (error) {
      this.logger.error(`Failed to generate PDF: ${title}`, error);
      throw error;
    }
  }
  private async initializePdf(title: string): Promise<{
    pdfDoc: PDFDocument;
    page: import('pdf-lib').PDFPage;
    font: import('pdf-lib').PDFFont;
    boldFont: import('pdf-lib').PDFFont;
    width: number;
    height: number;
    startY: number;
  }> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const y = height - 50;

    page.drawText(title, {
      x: 50,
      y,
      size: 20,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    return { pdfDoc, page, font, boldFont, width, height, startY: y - 40 };
  }

  private checkPageBreak(
    pdfDoc: PDFDocument,
    page: import('pdf-lib').PDFPage,
    y: number,
    height: number,
  ): { page: import('pdf-lib').PDFPage; y: number } {
    if (y < 50) {
      const newPage = pdfDoc.addPage();
      return { page: newPage, y: height - 50 };
    }
    return { page, y };
  }

  private drawTableSeparator(page: import('pdf-lib').PDFPage, width: number, y: number): void {
    page.drawLine({
      start: { x: 50, y: y + 10 },
      end: { x: width - 50, y: y + 10 },
      thickness: 1,
    });
  }
}
