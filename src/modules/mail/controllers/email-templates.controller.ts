import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import Handlebars from 'handlebars';
import { Repository } from 'typeorm';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { TenantContextService } from '../../../common/services/tenant-context.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import {
  CreateEmailTemplateDto,
  PreviewEmailTemplateDto,
  UpdateEmailTemplateDto,
} from '../dto/email-template.dto';
import { EmailTemplate } from '../entities/email-template.entity';
import { MailService } from '../mail.service';

@ApiTags('Email Templates')
@ApiBearerAuth()
@Controller('email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailTemplatesController {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly templateRepository: Repository<EmailTemplate>,
    private readonly mailService: MailService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'List all email templates' })
  async findAll() {
    const tenantId = TenantContextService.getTenantId();
    return this.templateRepository.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get template by ID' })
  async findOne(@Param('id') id: string) {
    const tenantId = TenantContextService.getTenantId();
    const template = await this.templateRepository.findOne({
      where: { id, tenantId },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new email template' })
  async create(@Body() dto: CreateEmailTemplateDto) {
    const tenantId = TenantContextService.getTenantId();

    const existing = await this.templateRepository.findOne({
      where: { name: dto.name, tenantId },
    });

    if (existing) {
      throw new BadRequestException('Template with this name already exists');
    }

    const template = this.templateRepository.create({
      ...dto,
      tenantId,
      isSystem: false,
    });
    return this.templateRepository.save(template);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update an email template' })
  async update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    const tenantId = TenantContextService.getTenantId();
    const template = await this.templateRepository.findOne({
      where: { id, tenantId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    Object.assign(template, dto);
    return this.templateRepository.save(template);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete an email template' })
  async remove(@Param('id') id: string) {
    const tenantId = TenantContextService.getTenantId();
    const template = await this.templateRepository.findOne({
      where: { id, tenantId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.isSystem) {
      throw new BadRequestException('Cannot delete system templates');
    }

    return this.templateRepository.remove(template);
  }

  @Post('preview')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Preview compiled Handlebars template' })
  preview(@Body() dto: PreviewEmailTemplateDto) {
    try {
      const template = Handlebars.compile(dto.content);
      const rendered = template(dto.data);
      return { html: rendered };
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(
          `Template compilation failed: ${error.message}`,
        );
      }
      throw new BadRequestException('Template compilation failed');
    }
  }
}
