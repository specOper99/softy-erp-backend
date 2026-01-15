import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { MailService } from '../../mail/mail.service';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { TokenService } from './token.service';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetRepository: Repository<PasswordResetToken>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
  ) {}

  async forgotPassword(email: string): Promise<void> {
    // Timing Attack Mitigation: Always perform crypto operations
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.usersService.findByEmailGlobal(email);

    if (!user) {
      this.logger.warn({
        message: 'Password reset requested for non-existent email',
        email,
      });
      return;
    }

    await this.passwordResetRepository.update({ email, used: false }, { used: true });

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.passwordResetRepository.save({
      email,
      tokenHash,
      expiresAt,
      used: false,
    });

    this.logger.log({
      message: 'Password reset token generated',
      email,
      userId: user.id,
    });

    await this.mailService.queuePasswordReset({
      email,
      name: user.email,
      token,
      expiresInHours: 1,
    });
  }

  async resetPassword(
    token: string,
    newPassword: string,
    onResetComplete?: (userId: string) => Promise<void>,
  ): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await this.passwordResetRepository.findOne({
      where: { tokenHash },
    });

    if (!resetToken?.isValid()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.usersService.findByEmailGlobal(resetToken.email);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.dataSource.manager.update(User, { id: user.id }, { passwordHash });

    await this.passwordResetRepository.update({ id: resetToken.id }, { used: true });

    // Callback to logout all sessions
    if (onResetComplete) {
      await onResetComplete(user.id);
    }

    this.logger.log({
      message: 'Password reset completed',
      userId: user.id,
      email: user.email,
    });
  }
}
