import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses, Roles } from '../../../common/decorators';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import {
  CreateProcessingTypeDto,
  ProcessingTypeResponseDto,
  UpdateProcessingTypeDto,
} from '../dto/processing-type.dto';
import { ProcessingTypeService } from '../services/processing-type.service';

@ApiTags('Processing Types')
@ApiBearerAuth()
@ApiErrorResponses('BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT')
@Controller('processing-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProcessingTypesController {
  constructor(private readonly service: ProcessingTypeService) {}

  @Get()
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'List all processing types for the tenant' })
  @ApiQuery({ name: 'packageId', required: false, description: 'Optional service package ID filter' })
  @ApiResponse({ status: 200, type: [ProcessingTypeResponseDto] })
  findAll(@Query('packageId') packageId?: string) {
    return this.service.findAll(packageId ? { packageId } : undefined);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER, Role.FIELD_STAFF)
  @ApiOperation({ summary: 'Get a single processing type by ID' })
  @ApiResponse({ status: 200, type: ProcessingTypeResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new processing type' })
  @ApiBody({ type: CreateProcessingTypeDto })
  @ApiResponse({ status: 201, type: ProcessingTypeResponseDto })
  create(@Body() dto: CreateProcessingTypeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a processing type' })
  @ApiBody({ type: UpdateProcessingTypeDto })
  @ApiResponse({ status: 200, type: ProcessingTypeResponseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProcessingTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a processing type' })
  @ApiResponse({ status: 204, description: 'Deleted successfully' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
