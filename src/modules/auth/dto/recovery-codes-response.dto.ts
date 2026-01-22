import { ApiProperty } from '@nestjs/swagger';

export class RecoveryCodesResponseDto {
  @ApiProperty({
    description: 'Array of 10 recovery codes. Store these securely - they are shown only once.',
    example: [
      'A1B2C3D4',
      'E5F6G7H8',
      'I9J0K1L2',
      'M3N4O5P6',
      'Q7R8S9T0',
      'U1V2W3X4',
      'Y5Z6A7B8',
      'C9D0E1F2',
      'G3H4I5J6',
      'K7L8M9N0',
    ],
    type: [String],
  })
  codes: string[];

  @ApiProperty({
    description: 'Number of recovery codes remaining',
    example: 10,
  })
  remaining: number;

  @ApiProperty({
    description: 'Warning message if running low on codes',
    example: 'Warning: Only 2 recovery codes remaining. Consider regenerating.',
    required: false,
  })
  warning?: string;
}
