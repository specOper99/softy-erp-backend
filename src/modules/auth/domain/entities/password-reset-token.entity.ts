import { Entity } from 'typeorm';
import { BaseTokenEntity } from './base-token.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseTokenEntity {}
