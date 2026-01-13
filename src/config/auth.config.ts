import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  jwtAccessExpires: parseInt(process.env.JWT_ACCESS_EXPIRES_SECONDS || '900', 10),
  jwtRefreshExpires: parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '7', 10),
}));
