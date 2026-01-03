import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { Client } from '../../bookings/entities/client.entity';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class ClientAuthService {
  private readonly TOKEN_EXPIRY_HOURS = 24;

  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly mailService: MailService,
  ) {}

  async requestMagicLink(email: string): Promise<{ message: string }> {
    // Look up client by email (email is unique per tenant, so this is safe)
    // If multiple tenants could have the same email, add tenant context back
    const client = await this.clientRepository.findOne({
      where: { email },
    });

    if (!client) {
      // Don't reveal if email exists for security
      return { message: 'If an account exists, a magic link has been sent.' };
    }

    // Generate secure token
    const token = randomBytes(32).toString('hex');
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + this.TOKEN_EXPIRY_HOURS);

    // Save token to client
    client.accessToken = token;
    client.accessTokenExpiry = expiry;
    await this.clientRepository.save(client);

    // Send email with magic link
    await this.mailService.sendMagicLink({
      clientEmail: client.email,
      clientName: client.name,
      token,
      expiresInHours: this.TOKEN_EXPIRY_HOURS,
    });

    return { message: 'If an account exists, a magic link has been sent.' };
  }

  async verifyMagicLink(
    token: string,
  ): Promise<{ accessToken: string; expiresAt: Date; client: Client }> {
    const client = await this.clientRepository.findOne({
      where: { accessToken: token },
    });

    if (!client) {
      throw new NotFoundException('Invalid or expired token');
    }

    if (!client.isAccessTokenValid()) {
      throw new UnauthorizedException('Token has expired');
    }

    // Generate new session token (reuse the existing token for simplicity)
    // In production, you might want to generate a JWT here
    const sessionExpiry = new Date();
    sessionExpiry.setHours(sessionExpiry.getHours() + this.TOKEN_EXPIRY_HOURS);

    client.accessTokenExpiry = sessionExpiry;
    await this.clientRepository.save(client);

    return {
      accessToken: token,
      expiresAt: sessionExpiry,
      client,
    };
  }

  async validateClientToken(token: string): Promise<Client | null> {
    const client = await this.clientRepository.findOne({
      where: { accessToken: token },
    });

    if (!client || !client.isAccessTokenValid()) {
      return null;
    }

    return client;
  }

  async logout(token: string): Promise<void> {
    const client = await this.clientRepository.findOne({
      where: { accessToken: token },
    });

    if (client) {
      client.accessToken = '';
      client.accessTokenExpiry = new Date(0);
      await this.clientRepository.save(client);
    }
  }
}
