import { Controller, Get, Param, ParseUUIDPipe, Query, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../../common/decorators';
import { NoCache } from '../../../common/decorators/no-cache.decorator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MFA_REQUIRED_KEY } from '../../auth/guards/mfa-required.guard';
import { Role } from '../../users/enums/role.enum';
import { WalletService } from '../services/wallet.service';

@ApiTags('Finance - Wallets')
@ApiBearerAuth()
@Controller('wallets')
@UseGuards(JwtAuthGuard, RolesGuard)
@MfaRequired()
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @NoCache()
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get all employee wallets (Offset Pagination)',
    deprecated: true,
    description: 'Use /wallets/cursor for better performance with large datasets.',
  })
  findAll(@Query() query: PaginationDto = new PaginationDto()) {
    return this.walletService.getAllWallets(query);
  }

  @Get('cursor')
  @NoCache()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all employee wallets with cursor pagination' })
  findAllCursor(@Query() query: CursorPaginationDto) {
    return this.walletService.getAllWalletsCursor(query);
  }

  @Get('user/:userId')
  @NoCache()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get wallet by user ID' })
  findByUserId(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.walletService.getWalletByUserId(userId);
  }

  @Get('me')
  @NoCache()
  @Roles(Role.FIELD_STAFF, Role.ADMIN, Role.OPS_MANAGER)
  @SetMetadata(MFA_REQUIRED_KEY, false)
  @ApiOperation({ summary: 'Get wallet for current user' })
  findMyWallet(@CurrentUser('id') userId: string) {
    return this.walletService.getWalletByUserId(userId);
  }
}
