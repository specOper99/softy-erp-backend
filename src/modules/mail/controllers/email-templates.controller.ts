import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import { CreateEmailTemplateDto, PreviewEmailTemplateDto, UpdateEmailTemplateDto } from '../dto/email-template.dto';
import { EmailTemplatesService } from '../services/email-templates.service';

@ApiTags('Email Templates')
@ApiBearerAuth()
@Controller('email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailTemplatesController {
  constructor(private readonly emailTemplatesService: EmailTemplatesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'List all email templates' })
  async findAll(@Query() query: PaginationDto = new PaginationDto()) {
    return this.emailTemplatesService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get template by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailTemplatesService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new email template' })
  async create(@Body() dto: CreateEmailTemplateDto) {
    return this.emailTemplatesService.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update an email template' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.emailTemplatesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete an email template' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.emailTemplatesService.remove(id);
  }

  @Post('preview')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Preview compiled Handlebars template' })
  preview(@Body() dto: PreviewEmailTemplateDto) {
    return this.emailTemplatesService.preview(dto);
  }
}
