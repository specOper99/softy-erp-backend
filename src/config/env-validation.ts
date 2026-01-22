import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, MinLength, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Provision = 'provision',
}

/**
 * Calculate Shannon entropy of a string.
 * Returns bits per character (higher is better for randomness).
 *
 * @param str - String to measure
 * @returns Entropy in bits per character
 */
function calculateEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;

  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Validate secret strength checking for weak patterns.
 * Returns error message if weak, undefined if strong.
 */
function validateSecretStrength(secret: string, name: string): string | undefined {
  // Minimum length check (256 bits = 43 base64 chars)
  if (secret.length < 43) {
    return (
      `SECURITY: ${name} must be at least 43 characters (256 bits). ` +
      `Use: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  // Entropy check (good random strings have ~4-6 bits per character)
  const entropy = calculateEntropy(secret);
  if (entropy < 3.5) {
    return (
      `SECURITY: ${name} has insufficient entropy (${entropy.toFixed(2)} bits/char). ` +
      `Use a cryptographically secure random string generator.`
    );
  }

  // Block common weak patterns
  const weakPatterns: [RegExp, string][] = [
    [/^(.)\1{10,}$/, 'repeated characters'],
    [/^(01|10){10,}$/, 'binary pattern'],
    [/^(abc|123)+$/i, 'sequential pattern'],
    [/^[a-z]+$/i, 'only letters (no numbers/symbols)'],
    [/^[0-9]+$/, 'only digits'],
    [/password|secret|admin|test|dev/i, 'common keywords'],
  ];

  for (const [pattern, description] of weakPatterns) {
    if (pattern.test(secret)) {
      return (
        `SECURITY: ${name} matches a weak pattern (${description}). ` +
        `Use: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
      );
    }
  }

  return undefined;
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

  /**
   * JWT signing secret - MUST be cryptographically strong in production.
   * Recommended: 256 bits (43+ base64 characters) with high entropy.
   * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   */
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters (256 bits recommended: 43 chars)' })
  @Matches(/^(?=.*[A-Za-z])(?=.*[0-9]).+$/, {
    message: 'JWT_SECRET must contain both letters and numbers for minimum complexity',
  })
  JWT_SECRET?: string;

  /**
   * Secret for cursor pagination HMAC signing.
   * Recommended: 32+ characters of random data.
   */
  @IsString()
  @IsOptional()
  @MinLength(32, { message: 'CURSOR_SECRET must be at least 32 characters' })
  CURSOR_SECRET?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  // Metrics (Prometheus)
  @IsString()
  @IsOptional()
  @MinLength(16, { message: 'METRICS_TOKEN must be at least 16 characters for security' })
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

  @IsString()
  @IsOptional()
  TENANT_ALLOWED_DOMAINS?: string;
}

export function validate(config: Record<string, unknown>) {
  const isProd = config.NODE_ENV === 'production';

  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: !isProd, // Skip missing props in non-prod
  });

  if (errors.length > 0) {
    // Only bypass JWT_SECRET and CURSOR_SECRET validation in explicit test environment
    // This prevents accidental deployment with weak secrets in development/staging
    const isTestEnv = config.NODE_ENV === 'test';
    const secretProperties = ['JWT_SECRET', 'CURSOR_SECRET'];
    const filteredErrors = errors.filter((e) => {
      if (isTestEnv && secretProperties.includes(e.property)) return false;
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

  // Enhanced security enforcement for production
  if (isProd) {
    // JWT_SECRET validation with entropy checking
    if (!validatedConfig.JWT_SECRET) {
      throw new Error('SECURITY: JWT_SECRET is required in production environments.');
    }

    const jwtSecretError = validateSecretStrength(validatedConfig.JWT_SECRET, 'JWT_SECRET');
    if (jwtSecretError) {
      throw new Error(jwtSecretError);
    }

    // CURSOR_SECRET is recommended but optional (falls back to JWT_SECRET)
    if (validatedConfig.CURSOR_SECRET) {
      const cursorSecretError = validateSecretStrength(validatedConfig.CURSOR_SECRET, 'CURSOR_SECRET');
      if (cursorSecretError) {
        throw new Error(cursorSecretError);
      }
    }
  }

  return validatedConfig;
}
