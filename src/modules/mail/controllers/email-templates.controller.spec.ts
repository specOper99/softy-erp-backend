import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { EmailTemplate } from '../entities/email-template.entity';
import { MailService } from '../mail.service';
import { EmailTemplatesController } from './email-templates.controller';

describe('EmailTemplatesController', () => {
  let controller: EmailTemplatesController;
  let templateRepo: jest.Mocked<Repository<EmailTemplate>>;

  const mockTenantId = 'tenant-123';
  const mockTemplate = {
    id: 'template-123',
    tenantId: mockTenantId,
    name: 'welcome',
    subject: 'Welcome!',
    content: '<p>Hello {{name}}</p>',
    isSystem: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailTemplatesController],
      providers: [
        {
          provide: getRepositoryToken(EmailTemplate),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {},
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<EmailTemplatesController>(EmailTemplatesController);
    templateRepo = module.get(getRepositoryToken(EmailTemplate));

    jest.spyOn(TenantContextService, 'getTenantId').mockReturnValue(mockTenantId);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all templates for tenant', async () => {
      templateRepo.find.mockResolvedValue([mockTemplate] as any);

      const result = await controller.findAll();

      expect(templateRepo.find).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        order: { name: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return template by id', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate as any);

      const result = await controller.findOne('template-123');

      expect(result).toEqual(mockTemplate);
    });

    it('should throw NotFoundException if not found', async () => {
      templateRepo.findOne.mockResolvedValue(null);

      await expect(controller.findOne('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create new template', async () => {
      const dto = {
        name: 'welcome',
        subject: 'Welcome!',
        content: '<p>Hi</p>',
      };
      templateRepo.findOne.mockResolvedValue(null); // No existing
      templateRepo.create.mockReturnValue(mockTemplate as any);
      templateRepo.save.mockResolvedValue(mockTemplate as any);

      const result = await controller.create(dto as any);

      expect(templateRepo.create).toHaveBeenCalledWith({
        ...dto,
        tenantId: mockTenantId,
        isSystem: false,
      });
      expect(result).toEqual(mockTemplate);
    });

    it('should throw if template name exists', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate as any);

      await expect(controller.create({ name: 'welcome' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update template', async () => {
      templateRepo.findOne.mockResolvedValue({ ...mockTemplate } as any);
      templateRepo.save.mockResolvedValue({
        ...mockTemplate,
        subject: 'Updated',
      } as any);

      const result = await controller.update('template-123', {
        subject: 'Updated',
      } as any);

      expect(result.subject).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should delete non-system template', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate as any);
      templateRepo.remove.mockResolvedValue(mockTemplate as any);

      await controller.remove('template-123');

      expect(templateRepo.remove).toHaveBeenCalledWith(mockTemplate);
    });

    it('should throw when deleting system template', async () => {
      templateRepo.findOne.mockResolvedValue({
        ...mockTemplate,
        isSystem: true,
      } as any);

      await expect(controller.remove('template-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('preview', () => {
    it('should compile and return template preview', () => {
      const dto = { content: '<p>Hello {{name}}</p>', data: { name: 'John' } };

      const result = controller.preview(dto as any);

      expect(result.html).toBe('<p>Hello John</p>');
    });

    it('should throw on invalid template', () => {
      const dto = { content: '{{#if}}', data: {} }; // Invalid Handlebars

      expect(() => controller.preview(dto as any)).toThrow(BadRequestException);
    });
  });
});
