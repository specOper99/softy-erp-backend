import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  BookingTrendDto,
  DashboardKpiDto,
  PackageStatsDto,
  RevenueStatsDto,
  StaffPerformanceDto,
} from '../dto/dashboard.dto';

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
}
