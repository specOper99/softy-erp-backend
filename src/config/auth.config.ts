import { registerAs } from '@nestjs/config';
import { parseEnvInt } from '../common/utils/env-int.util';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  jwtPrivateKey: process.env.JWT_PRIVATE_KEY,
  jwtAccessExpiresSeconds: parseEnvInt(process.env.JWT_ACCESS_EXPIRES_SECONDS, 900),
  jwtRefreshExpiresDays: parseEnvInt(process.env.JWT_REFRESH_EXPIRES_DAYS, 7),
}));
