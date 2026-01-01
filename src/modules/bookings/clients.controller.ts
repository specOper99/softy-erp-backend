import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/enums';
import { RolesGuard } from '../../common/guards';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingsService } from './bookings.service';

@ApiTags('Clients')
@ApiBearerAuth()
@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Create a new client' })
  create(@Body() dto: any) {
    // We'll reuse BookingsService or add methods there.
    // For simplicity of this task, I'll add a createClient method to BookingsService.
    return this.bookingsService.createClient(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all clients' })
  findAll(@Query() query: PaginationDto) {
    return this.bookingsService.findAllClients(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.findClientById(id);
  }
}
