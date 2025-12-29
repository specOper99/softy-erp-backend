import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Provision = 'provision',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  DATABASE_HOST?: string;

  @IsNumber()
  @IsOptional()
  DATABASE_PORT?: number;

  @IsString()
  @IsOptional()
  DATABASE_USER?: string;

  @IsString()
  @IsOptional()
  DATABASE_PASS?: string;

  @IsString()
  @IsOptional()
  DATABASE_NAME?: string;

  @IsString()
  @MinLength(32)
  @IsOptional()
  JWT_SECRET: string = 'a_very_long_secret_for_jwt_auth_nest_js_erp';

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  @IsString()
  @IsOptional()
  AWS_S3_REGION?: string;

  @IsString()
  @IsOptional()
  AWS_S3_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  AWS_S3_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  AWS_S3_BUCKET?: string;

  @IsString()
  @IsOptional()
  MAIL_HOST?: string;

  @IsNumber()
  @IsOptional()
  MAIL_PORT?: number;

  @IsString()
  @IsOptional()
  MAIL_USER?: string;

  @IsString()
  @IsOptional()
  MAIL_PASS?: string;

  @IsString()
  @IsOptional()
  MAIL_FROM?: string;

  @IsString()
  @IsOptional()
  SEED_ADMIN_PASSWORD?: string;
}

export function validate(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  // Support short secrets for tests if not in production
  if (errors.length > 0) {
    const isProd = config.NODE_ENV === 'production';
    const filteredErrors = errors.filter((e) => {
      if (!isProd && e.property === 'JWT_SECRET') return false;
      return true;
    });

    if (filteredErrors.length > 0) {
      throw new Error(filteredErrors.toString());
    }
  }
  return validatedConfig;
}
