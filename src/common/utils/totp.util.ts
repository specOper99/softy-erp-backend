import * as OTPAuth from 'otpauth';
import { toErrorMessage } from './error.util';

export interface TotpIssuerConfig {
  issuer: string;
  label: string;
}

const DEFAULT_ALGORITHM = 'SHA1' as const;
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;
const VALIDATION_WINDOW = 1;

export function createTotpSecret(size = 20): OTPAuth.Secret {
  return new OTPAuth.Secret({ size });
}

export function buildTotp(secret: OTPAuth.Secret | string, config: TotpIssuerConfig): OTPAuth.TOTP {
  const secretObj = typeof secret === 'string' ? OTPAuth.Secret.fromBase32(secret) : secret;

  return new OTPAuth.TOTP({
    issuer: config.issuer,
    label: config.label,
    algorithm: DEFAULT_ALGORITHM,
    digits: DEFAULT_DIGITS,
    period: DEFAULT_PERIOD,
    secret: secretObj,
  });
}

export function verifyTotpToken(secret: string, token: string, onError?: (message: string) => void): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: DEFAULT_ALGORITHM,
      digits: DEFAULT_DIGITS,
      period: DEFAULT_PERIOD,
    });
    const delta = totp.validate({ token, window: VALIDATION_WINDOW });
    return delta !== null;
  } catch (error) {
    onError?.(`TOTP verification failed: ${toErrorMessage(error)}`);
    return false;
  }
}
