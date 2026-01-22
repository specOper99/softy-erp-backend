import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantsService } from '../../tenants/tenants.service';
import { CreateProfileDto, UpdateProfileDto } from '../dto/hr.dto';
import { HrService } from '../services/hr.service';
import { PayrollService } from '../services/payroll.service';
import { HrController } from './hr.controller';

describe('HrController', () => {
  let controller: HrController;
  let service: HrService;
  let payrollService: PayrollService;

  const mockProfile = { id: 'uuid', firstName: 'John' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HrController],
      providers: [
        {
          provide: HrService,
          useValue: {
            createProfile: jest.fn().mockResolvedValue(mockProfile),
            findAllProfiles: jest.fn().mockResolvedValue([mockProfile]),
            findProfileById: jest.fn().mockResolvedValue(mockProfile),
            findProfileByUserId: jest.fn().mockResolvedValue(mockProfile),
            updateProfile: jest.fn().mockResolvedValue(mockProfile),
            deleteProfile: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PayrollService,
          useValue: {
            runPayroll: jest.fn().mockResolvedValue({ success: true }),
            getPayrollHistory: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TenantsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ subscriptionPlan: 'PRO' }),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<HrController>(HrController);
    service = module.get<HrService>(HrService);
    payrollService = module.get<PayrollService>(PayrollService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createProfile', () => {
    it('should call service.createProfile', async () => {
      const dto = { firstName: 'Jane' } as CreateProfileDto;
      await controller.createProfile(dto);
      expect(service.createProfile).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAllProfiles', () => {
    it('should call service.findAllProfiles', async () => {
      await controller.findAllProfiles();
      expect(service.findAllProfiles).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should call service.findProfileById', async () => {
      await controller.findOne('uuid');
      expect(service.findProfileById).toHaveBeenCalledWith('uuid');
    });
  });

  describe('findByUserId', () => {
    it('should call service.findProfileByUserId', async () => {
      await controller.findByUserId('u-uuid');
      expect(service.findProfileByUserId).toHaveBeenCalledWith('u-uuid');
    });
  });

  describe('update', () => {
    it('should call service.updateProfile', async () => {
      const dto = { firstName: 'Updated' } as UpdateProfileDto;
      await controller.update('uuid', dto);
      expect(service.updateProfile).toHaveBeenCalledWith('uuid', dto);
    });
  });

  describe('remove', () => {
    it('should call service.deleteProfile', async () => {
      await controller.remove('uuid');
      expect(service.deleteProfile).toHaveBeenCalledWith('uuid');
    });
  });

  describe('runPayroll', () => {
    it('should call service.runPayroll', async () => {
      await controller.runPayroll();
      expect(payrollService.runPayroll).toHaveBeenCalled();
    });
  });
});
