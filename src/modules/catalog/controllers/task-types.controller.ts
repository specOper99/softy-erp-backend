import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GlobalCacheInterceptor } from '../../../common/cache/cache.interceptor';
import { Cacheable, Roles } from '../../../common/decorators';
import { Role } from '../../../common/enums';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateTaskTypeDto, UpdateTaskTypeDto } from '../dto';
import { CatalogService } from '../services/catalog.service';

@ApiTags('Task Types')
@ApiBearerAuth()
@Controller('task-types')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(GlobalCacheInterceptor)
export class TaskTypesController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a new task type' })
  create(@Body() dto: CreateTaskTypeDto) {
    return this.catalogService.createTaskType(dto);
  }

  @Get()
  @Cacheable()
  @ApiOperation({ summary: 'Get all task types' })
  findAll() {
    return this.catalogService.findAllTaskTypes();
  }

  @Get(':id')
  @Cacheable()
  @ApiOperation({ summary: 'Get task type by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.findTaskTypeById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update task type' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskTypeDto,
  ) {
    return this.catalogService.updateTaskType(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete task type (Admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.deleteTaskType(id);
  }
}
