import { Injectable } from '@nestjs/common';

@Injectable()
export class PrivacyService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(..._args: any[]) {}

  async processDataExport(_requestId: string): Promise<void> {}
}
