import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators';
import { NoCache } from '../../../common/decorators/no-cache.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { RolesGuard } from '../../../common/guards';
import { MfaRequired } from '../../auth/decorators/mfa-required.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
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
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get all employee wallets' })
  findAll(@Query() query: PaginationDto = new PaginationDto()) {
    return this.walletService.getAllWallets(query);
  }

  @Get('user/:userId')
  @NoCache()
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  @ApiOperation({ summary: 'Get wallet by user ID' })
  findByUserId(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.walletService.getWalletByUserId(userId);
  }
}
