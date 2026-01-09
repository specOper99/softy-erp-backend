import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../audit/audit.service';
import { MfaRequired } from '../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '../users/enums/role.enum';
import { KeyRotationService } from './services/key-rotation.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly keyRotationService: KeyRotationService,
    private readonly auditService: AuditService,
  ) {}

  @Post('keys/rotate')
  @MfaRequired()
  @ApiOperation({
    summary: 'Rotate encryption keys and re-encrypt all secrets',
  })
  async rotateKeys() {
    return this.keyRotationService.rotateKeys();
  }

  @Get('audit/verify')
  @ApiOperation({ summary: 'Verify audit log chain integrity' })
  async verifyAuditChain(@Query('limit') limit?: number) {
    return this.auditService.verifyChainIntegrity(undefined, limit ?? 1000);
  }
}
