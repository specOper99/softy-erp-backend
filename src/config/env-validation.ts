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

  // Database (used by runtime config)
  @IsString()
  @IsOptional()
  DB_HOST?: string;

  @IsNumber()
  @IsOptional()
  DB_PORT?: number;

  @IsString()
  @IsOptional()
  DB_USERNAME?: string;

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string;

  @IsString()
  @IsOptional()
  DB_DATABASE?: string;

  @IsString()
  @IsOptional()
  DB_SYNCHRONIZE?: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  // Metrics (Prometheus)
  @IsString()
  @IsOptional()
  METRICS_TOKEN?: string;

  // Reverse proxy / ingress (Express trust proxy)
  // Set TRUST_PROXY=true when running behind a reverse proxy (e.g., Kubernetes ingress)
  @IsString()
  @IsOptional()
  TRUST_PROXY?: string;

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

  // Rate Limiting
  @IsNumber()
  @IsOptional()
  RATE_LIMIT_SOFT: number = 50;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_HARD: number = 100;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_WINDOW_SECONDS: number = 60;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_BLOCK_SECONDS: number = 900;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_DELAY_MS: number = 500;

  // Auth Extras
  @IsNumber()
  @IsOptional()
  JWT_ACCESS_EXPIRES_SECONDS: number = 900;

  @IsNumber()
  @IsOptional()
  JWT_REFRESH_EXPIRES_DAYS: number = 7;
  // Vault Configuration
  @IsString()
  @IsOptional()
  VAULT_ADDR?: string;

  @IsString()
  @IsOptional()
  VAULT_TOKEN?: string;

  @IsString()
  @IsOptional()
  VAULT_ROLE_ID?: string;

  @IsString()
  @IsOptional()
  VAULT_SECRET_ID?: string;

  @IsString()
  @IsOptional()
  VAULT_SECRET_PATH?: string;

  @IsString()
  @IsOptional()
  VAULT_ENABLED?: string;
}

export function validate(config: Record<string, any>) {
  const isProd = config.NODE_ENV === 'production';

  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: !isProd, // Skip missing props in non-prod
  });

  if (errors.length > 0) {
    // Filter out JWT_SECRET errors for non-production environments to allow easier local development/testing
    const filteredErrors = errors.filter((e) => {
      if (!isProd && e.property === 'JWT_SECRET') return false;
      return true;
    });

    if (filteredErrors.length > 0) {
      // Create a more readable error summary
      const errorSummary = filteredErrors
        .map((e) => {
          const constraints = Object.values(e.constraints || {}).join(', ');
          return `${e.property}: ${constraints}`;
        })
        .join('; ');
      throw new Error(`Configuration validation failed: ${errorSummary}`);
    }
  }

  // Final security enforcement for production
  if (isProd) {
    if (!validatedConfig.JWT_SECRET || validatedConfig.JWT_SECRET.length < 32) {
      throw new Error(
        'SECURITY: JWT_SECRET must be at least 32 characters in production environments.',
      );
    }
  }

  return validatedConfig;
}
