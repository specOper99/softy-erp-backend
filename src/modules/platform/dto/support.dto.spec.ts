import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import {
  EndImpersonationDto,
  SearchTenantsDto,
  StartImpersonationDto,
  TenantErrorsQueryDto,
  TenantLogsQueryDto,
} from './support.dto';

describe('Support DTOs', () => {
  describe('StartImpersonationDto', () => {
    it('should validate with required fields', async () => {
      const dto = plainToInstance(StartImpersonationDto, {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        reason: 'Customer support request #12345',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without userId', async () => {
      const dto = plainToInstance(StartImpersonationDto, {
        reason: 'Support request',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('userId');
    });

    it('should fail validation without reason', async () => {
      const dto = plainToInstance(StartImpersonationDto, {
        userId: '550e8400-e29b-41d4-a716-446655440001',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('reason');
    });

    it('should fail validation with invalid userId UUID', async () => {
      const dto = plainToInstance(StartImpersonationDto, {
        userId: 'invalid-uuid',
        reason: 'Support request',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('userId');
    });

    it('should validate with optional approvalTicketId', async () => {
      const dto = plainToInstance(StartImpersonationDto, {
        userId: '550e8400-e29b-41d4-a716-446655440001',
        reason: 'Customer support request',
        approvalTicketId: 'TICKET-12345',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('EndImpersonationDto', () => {
    it('should validate with no fields (all optional)', async () => {
      const dto = plainToInstance(EndImpersonationDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with optional reason', async () => {
      const dto = plainToInstance(EndImpersonationDto, {
        reason: 'Issue resolved',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('SearchTenantsDto', () => {
    it('should validate with required query', async () => {
      const dto = plainToInstance(SearchTenantsDto, {
        query: 'acme corp',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation without query', async () => {
      const dto = plainToInstance(SearchTenantsDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('query');
    });

    it('should validate with limit within range', async () => {
      const dto = plainToInstance(SearchTenantsDto, {
        query: 'test',
        limit: 25,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with limit exceeding max (50)', async () => {
      const dto = plainToInstance(SearchTenantsDto, {
        query: 'test',
        limit: 100,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('limit');
    });

    it('should fail validation with limit below min (1)', async () => {
      const dto = plainToInstance(SearchTenantsDto, {
        query: 'test',
        limit: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('limit');
    });
  });

  describe('TenantLogsQueryDto', () => {
    it('should validate with all optional fields empty', async () => {
      const dto = plainToInstance(TenantLogsQueryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with level filter', async () => {
      const dto = plainToInstance(TenantLogsQueryDto, {
        level: 'error',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with module filter', async () => {
      const dto = plainToInstance(TenantLogsQueryDto, {
        module: 'auth',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with date range', async () => {
      const dto = plainToInstance(TenantLogsQueryDto, {
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-01-31T23:59:59Z',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid date', async () => {
      const dto = plainToInstance(TenantLogsQueryDto, {
        startDate: 'invalid-date',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('startDate');
    });

    it('should validate with limit within range', async () => {
      const dto = plainToInstance(TenantLogsQueryDto, {
        limit: 500,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with limit exceeding max (1000)', async () => {
      const dto = plainToInstance(TenantLogsQueryDto, {
        limit: 1500,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('limit');
    });
  });

  describe('TenantErrorsQueryDto', () => {
    it('should validate with all optional fields empty', async () => {
      const dto = plainToInstance(TenantErrorsQueryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with errorType filter', async () => {
      const dto = plainToInstance(TenantErrorsQueryDto, {
        errorType: 'ValidationError',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with date range', async () => {
      const dto = plainToInstance(TenantErrorsQueryDto, {
        startDate: '2026-01-15',
        endDate: '2026-01-19',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with limit within range', async () => {
      const dto = plainToInstance(TenantErrorsQueryDto, {
        limit: 50,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with limit exceeding max (100)', async () => {
      const dto = plainToInstance(TenantErrorsQueryDto, {
        limit: 150,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('limit');
    });

    it('should fail validation with limit below min (1)', async () => {
      const dto = plainToInstance(TenantErrorsQueryDto, {
        limit: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]?.property).toBe('limit');
    });
  });
});
