import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

class StatementFilterBaseDto {
  @ApiProperty({ description: 'Start date for statement (ISO8601)', example: '2026-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date for statement (ISO8601)', example: '2026-01-31' })
  @IsDateString()
  endDate: string;
}

export class ClientStatementQueryDto extends StatementFilterBaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId: string;
}

export class VendorStatementQueryDto extends StatementFilterBaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vendorId: string;
}

export class EmployeeStatementQueryDto extends StatementFilterBaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;
}

export interface StatementLineDto {
  id: string;
  type: string;
  amount: number;
  category: string | null;
  description: string | null;
  transactionDate: Date;
  referenceId?: string;
}

export interface StatementTotalsDto {
  income: number;
  expense: number;
  payroll: number;
  net: number;
}

export class StatementResponseDto {
  @ApiProperty({ format: 'uuid' })
  entityId: string;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiPropertyOptional()
  currency?: string;

  @ApiProperty({
    example: {
      income: 1000,
      expense: 300,
      payroll: 200,
      net: 500,
    },
  })
  totals: StatementTotalsDto;

  @ApiProperty({
    example: [
      {
        id: 'tx-1',
        type: 'INCOME',
        amount: 1000,
        category: 'Booking Payment',
        description: 'Advance payment',
        transactionDate: '2026-01-10T00:00:00.000Z',
        referenceId: 'booking-1',
      },
    ],
  })
  lines: StatementLineDto[];
}
