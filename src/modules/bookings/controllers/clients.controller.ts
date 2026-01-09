import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../../common/decorators';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../users/enums/role.enum';
import {
  CreateClientDto,
  UpdateClientDto,
  UpdateClientTagsDto,
} from '../dto/client.dto';
import { BookingsService } from '../services/bookings.service';
import { BookingExportService } from '../services/booking-export.service';

@ApiTags('Clients')
@ApiBearerAuth()
@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly bookingExportService: BookingExportService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a new client' })
  create(@Body() dto: CreateClientDto) {
    // We'll reuse BookingsService or add methods there.
    // For simplicity of this task, I'll add a createClient method to BookingsService.
    return this.bookingsService.createClient(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all clients with optional tag filtering' })
  findAll(
    @Query() query: PaginationDto,
    @Query(
      'tags',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    tags?: string[],
  ) {
    return this.bookingsService.findAllClients(query, tags);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.findClientById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update client details' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) {
    return this.bookingsService.updateClient(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete client (soft delete, no bookings allowed)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.deleteClient(id);
  }

  @Patch(':id/tags')
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Update client tags' })
  updateTags(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientTagsDto,
  ) {
    return this.bookingsService.updateClientTags(id, dto.tags);
  }

  @Get('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export clients to CSV' })
  exportClients(@Res() res: Response) {
    return this.bookingExportService.exportClientsToCSV(res);
  }
}
