import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { CreateEmailTemplateDto, PreviewEmailTemplateDto, UpdateEmailTemplateDto } from '../dto/email-template.dto';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailTemplatesService } from '../services/email-templates.service';
import { EmailTemplatesController } from './email-templates.controller';

describe('EmailTemplatesController', () => {
  let controller: EmailTemplatesController;
  let emailTemplatesService: jest.Mocked<EmailTemplatesService>;

  const mockTenantId = 'tenant-123';
  const mockTemplate = {
    id: 'template-123',
    tenantId: mockTenantId,
    name: 'welcome',
    subject: 'Welcome!',
    content: '<p>Hello {{name}}</p>',
    isSystem: false,
  } as unknown as EmailTemplate;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailTemplatesController],
      providers: [
        {
          provide: EmailTemplatesService,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            preview: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<EmailTemplatesController>(EmailTemplatesController);
    emailTemplatesService = module.get(EmailTemplatesService);

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
      emailTemplatesService.findAll.mockResolvedValue([mockTemplate]);

      const result = await controller.findAll();

      expect(emailTemplatesService.findAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return template by id', async () => {
      emailTemplatesService.findById.mockResolvedValue(mockTemplate);

      const result = await controller.findOne('template-123');

      expect(result).toEqual(mockTemplate);
    });

    it('should throw NotFoundException if not found', async () => {
      emailTemplatesService.findById.mockRejectedValue(new NotFoundException('Template not found'));

      await expect(controller.findOne('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create new template', async () => {
      const dto: CreateEmailTemplateDto = {
        name: 'welcome',
        subject: 'Welcome!',
        content: '<p>Hi</p>',
      };
      emailTemplatesService.create.mockResolvedValue(mockTemplate);

      const result = await controller.create(dto);

      expect(emailTemplatesService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockTemplate);
    });

    it('should throw if template name exists', async () => {
      emailTemplatesService.create.mockRejectedValue(new BadRequestException('Template already exists'));

      await expect(controller.create({ name: 'welcome' } as CreateEmailTemplateDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should update template', async () => {
      const updatedTemplate = { ...mockTemplate, subject: 'Updated' } as unknown as EmailTemplate;
      emailTemplatesService.update.mockResolvedValue(updatedTemplate);

      const result = await controller.update('template-123', {
        subject: 'Updated',
      } as UpdateEmailTemplateDto);

      expect(result.subject).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should delete non-system template', async () => {
      emailTemplatesService.remove.mockResolvedValue(undefined);

      await controller.remove('template-123');

      expect(emailTemplatesService.remove).toHaveBeenCalledWith('template-123');
    });

    it('should throw when deleting system template', async () => {
      emailTemplatesService.remove.mockRejectedValue(new BadRequestException('Cannot delete system template'));

      await expect(controller.remove('template-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('preview', () => {
    it('should compile and return template preview', () => {
      const dto: PreviewEmailTemplateDto = { content: '<p>Hello {{name}}</p>', data: { name: 'John' } };
      emailTemplatesService.preview.mockReturnValue({ html: '<p>Hello John</p>' });

      const result = controller.preview(dto);

      expect(result.html).toBe('<p>Hello John</p>');
    });

    it('should throw on invalid template', () => {
      const dto: PreviewEmailTemplateDto = { content: '{{#if}}', data: {} }; // Invalid Handlebars
      emailTemplatesService.preview.mockImplementation(() => {
        throw new BadRequestException('Invalid template syntax');
      });

      expect(() => controller.preview(dto)).toThrow(BadRequestException);
    });
  });
});
