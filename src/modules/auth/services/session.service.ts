import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GeoIpService } from '../../../common/services/geoip.service';
import { MailService } from '../../mail/mail.service';
import { UsersService } from '../../users/services/users.service';
import { RefreshToken } from '../entities/refresh-token.entity';
import { TokenService } from './token.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly geoIpService: GeoIpService,
  ) {}

  async getActiveSessions(userId: string): Promise<RefreshToken[]> {
    return this.tokenService.getActiveSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const affected = await this.tokenService.revokeSession(userId, sessionId);
    if (affected === 0) {
      throw new NotFoundException('Session not found or already revoked');
    }
  }

  async revokeOtherSessions(userId: string, currentRefreshToken: string): Promise<number> {
    const currentTokenHash = this.tokenService.hashToken(currentRefreshToken);
    return this.tokenService.revokeOtherSessions(userId, currentTokenHash);
  }

  async logoutAllSessions(userId: string): Promise<number> {
    return this.tokenService.revokeAllUserTokens(userId);
  }

  async checkNewDevice(userId: string, userAgent: string, ipAddress?: string): Promise<void> {
    try {
      const ua = userAgent.substring(0, 500);
      const previousLogin = await this.tokenService.findPreviousLoginByUserAgent(userId, ua);

      if (!previousLogin) {
        this.logger.warn({
          message: 'New device login detected',
          userId,
          userAgent: ua,
          ipAddress,
        });

        if (ipAddress) {
          const user = await this.usersService.findOne(userId);
          const location = this.geoIpService.getLocation(ipAddress);
          const locationStr =
            location.country !== 'Unknown' ? `${location.city}, ${location.country}` : 'Unknown Location';

          if (user) {
            await this.mailService.queueNewDeviceLogin({
              email: user.email,
              name: user.email,
              device: ua,
              ipAddress,
              time: new Date(),
              location: locationStr,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Error checking new device', error);
    }
  }

  async checkSuspiciousActivity(userId: string, currentIp: string): Promise<void> {
    try {
      const currentLocation = this.geoIpService.getLocation(currentIp);
      if (currentLocation.country === 'Unknown' || currentLocation.country === 'Localhost') {
        return;
      }

      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const recentSessions = await this.tokenService.getRecentSessions(userId, oneHourAgo);

      for (const session of recentSessions) {
        if (!session.ipAddress || session.ipAddress === currentIp) continue;

        const sessionLocation = this.geoIpService.getLocation(session.ipAddress);
        if (sessionLocation.country === 'Unknown' || sessionLocation.country === 'Localhost') {
          continue;
        }

        if (sessionLocation.country !== currentLocation.country) {
          const user = await this.usersService.findOne(userId);
          if (user) {
            await this.mailService.queueSuspiciousActivity({
              email: user.email,
              name: user.email,
              activityType: 'IMPOSSIBLE_TRAVEL',
              details: `Login from ${currentLocation.country} after login from ${sessionLocation.country} within 1 hour.`,
              ipAddress: currentIp,
              time: new Date(),
              location: `${currentLocation.city}, ${currentLocation.country}`,
            });

            this.logger.warn({
              message: 'Suspicious activity detected: Impossible travel',
              userId,
              ip1: currentIp,
              location1: currentLocation.country,
              ip2: session.ipAddress,
              location2: sessionLocation.country,
            });

            break;
          }
        }
      }
    } catch (error) {
      this.logger.error('Error checking suspicious activity', error);
    }
  }
}
