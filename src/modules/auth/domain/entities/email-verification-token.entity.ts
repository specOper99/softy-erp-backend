import { Entity } from 'typeorm';
import { BaseTokenEntity } from './base-token.entity';

@Entity('email_verification_tokens')
export class EmailVerificationToken extends BaseTokenEntity {}
