import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  type: 'postgres' as const,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'chapters_studio',
  password: process.env.DB_PASSWORD || 'chapters_studio_secret',
  database: process.env.DB_DATABASE || 'chapters_studio',
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  autoLoadEntities: true,
  logging: process.env.NODE_ENV === 'development',
}));
