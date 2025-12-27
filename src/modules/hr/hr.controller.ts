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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { RolesGuard } from '../../common/guards';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProfileDto, UpdateProfileDto } from './dto';
import { HrService } from './hr.service';

@ApiTags('HR')
@ApiBearerAuth()
@Controller('hr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HrController {
    constructor(private readonly hrService: HrService) { }

    @Post('profiles')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Create employee profile (Admin only)' })
    createProfile(@Body() dto: CreateProfileDto) {
        return this.hrService.createProfile(dto);
    }

    @Get('profiles')
    @Roles(Role.ADMIN, Role.OPS_MANAGER)
    @ApiOperation({ summary: 'Get all employee profiles' })
    findAllProfiles() {
        return this.hrService.findAllProfiles();
    }

    @Get('profiles/:id')
    @Roles(Role.ADMIN, Role.OPS_MANAGER)
    @ApiOperation({ summary: 'Get profile by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.hrService.findProfileById(id);
    }

    @Get('profiles/user/:userId')
    @Roles(Role.ADMIN, Role.OPS_MANAGER)
    @ApiOperation({ summary: 'Get profile by user ID' })
    findByUserId(@Param('userId', ParseUUIDPipe) userId: string) {
        return this.hrService.findProfileByUserId(userId);
    }

    @Patch('profiles/:id')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Update profile (Admin only)' })
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateProfileDto,
    ) {
        return this.hrService.updateProfile(id, dto);
    }

    @Delete('profiles/:id')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Delete profile (Admin only)' })
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.hrService.deleteProfile(id);
    }

    @Post('payroll/run')
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Run payroll manually (Admin only)' })
    runPayroll() {
        return this.hrService.runPayroll();
    }
}
