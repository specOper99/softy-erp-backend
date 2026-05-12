import { plainToInstance } from 'class-transformer';
import type { ValidationError } from 'class-validator';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, Matches, MinLength, validateSync } from 'class-validator';
import { RuntimeFailure } from '../common/errors/runtime-failure';

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

  // JWT verification
  @IsString()
  @IsOptional()
  JWT_ALLOWED_ALGORITHMS?: string;

  @IsString()
  @IsOptional()
  JWT_PUBLIC_KEY?: string;

  @IsString()
  @IsOptional()
  JWT_PRIVATE_KEY?: string;

  // CSP reporting
  @IsString()
  @IsOptional()
  CSP_REPORT_URI?: string;

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

  @IsString()
  @MinLength(32, { message: 'PLATFORM_JWT_SECRET must be at least 32 characters (256 bits recommended: 43 chars)' })
  @Matches(/^(?=.*[A-Za-z])(?=.*[0-9]).+$/, {
    message: 'PLATFORM_JWT_SECRET must contain both letters and numbers for minimum complexity',
  })
  PLATFORM_JWT_SECRET?: string;

  /**
   * Secret for cursor pagination HMAC signing.
   * Recommended: 32+ characters of random data.
   */
  @IsString()
  @IsOptional()
  @MinLength(32, { message: 'CURSOR_SECRET must be at least 32 characters' })
  CURSOR_SECRET?: string;

  /**
   * HMAC secret for password reset token hashing.
   * If unset, tokens fall back to plain SHA-256. Set this in all environments.
   * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   */
  @IsString()
  @IsOptional()
  @MinLength(32, { message: 'PASSWORD_RESET_TOKEN_SECRET must be at least 32 characters' })
  PASSWORD_RESET_TOKEN_SECRET?: string;

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
  // Defaults tuned for an ERP where a single page load triggers 10-20 parallel API requests.
  // With multiple concurrent users on the same office IP, 50/100 was too restrictive.
  @IsNumber()
  @IsOptional()
  RATE_LIMIT_SOFT: number = 200;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_HARD: number = 500;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_WINDOW_SECONDS: number = 60;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_BLOCK_SECONDS: number = 900;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_DELAY_MS: number = 500;

  // Throttler (NestJS throttler module)
  @IsNumber()
  @IsOptional()
  THROTTLE_SHORT_TTL_SECONDS: number = 1;

  @IsNumber()
  @IsOptional()
  THROTTLE_SHORT_LIMIT: number = 3;

  @IsNumber()
  @IsOptional()
  THROTTLE_MEDIUM_TTL_SECONDS: number = 10;

  @IsNumber()
  @IsOptional()
  THROTTLE_MEDIUM_LIMIT: number = 20;

  @IsNumber()
  @IsOptional()
  THROTTLE_LONG_TTL_SECONDS: number = 60;

  @IsNumber()
  @IsOptional()
  THROTTLE_LONG_LIMIT: number = 100;

  // Account Lockout
  @IsNumber()
  @IsOptional()
  LOCKOUT_MAX_ATTEMPTS: number = 5;

  @IsNumber()
  @IsOptional()
  LOCKOUT_DURATION_SECONDS: number = 1800;

  @IsNumber()
  @IsOptional()
  LOCKOUT_WINDOW_SECONDS: number = 900;

  // Kill switch (tests only)
  @IsString()
  @IsOptional()
  @IsIn(['true', 'false'])
  DISABLE_RATE_LIMITING?: string;

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
  @IsIn(['true', 'false'])
  VAULT_ENABLED?: string;
}

export function validate(config: Record<string, unknown>) {
  const isProd = config.NODE_ENV === 'production';
  const isTestEnv = config.NODE_ENV === 'test';

  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: !isProd, // Skip missing props in non-prod
  });

  if (errors.length > 0) {
    // Only bypass JWT_SECRET and CURSOR_SECRET validation in explicit test environment
    // This prevents accidental deployment with weak secrets in development/staging
    const secretProperties = ['JWT_SECRET', 'PLATFORM_JWT_SECRET', 'CURSOR_SECRET'];
    const filteredErrors = errors.filter((e: ValidationError) => {
      if (isTestEnv && secretProperties.includes(e.property)) return false;
      return true;
    });

    if (filteredErrors.length > 0) {
      // Create a more readable error summary
      const errorSummary = filteredErrors
        .map((e: ValidationError) => {
          const constraints = Object.values(e.constraints || {}).join(', ');
          return `${e.property}: ${constraints}`;
        })
        .join('; ');
      throw new RuntimeFailure(`Configuration validation failed: ${errorSummary}`);
    }
  }

  // DB_SYNCHRONIZE is forbidden in ALL environments — migrations are the only way to change schema.
  if (validatedConfig.DB_SYNCHRONIZE === 'true') {
    throw new RuntimeFailure('SECURITY: DB_SYNCHRONIZE=true is forbidden in all environments. Use migrations only.');
  }

  // Enhanced security enforcement for production
  if (isProd) {
    // Never allow disabling global rate limiting in production.
    if (validatedConfig.DISABLE_RATE_LIMITING === 'true') {
      throw new RuntimeFailure('SECURITY: DISABLE_RATE_LIMITING is forbidden in production environments.');
    }

    // JWT algorithm must be a single mode (HS256 OR RS256) to prevent alg confusion.
    const rawAlgs = (validatedConfig.JWT_ALLOWED_ALGORITHMS ?? 'HS256')
      .split(',')
      .map((a) => a.trim().toUpperCase())
      .filter(Boolean);
    const uniqueAlgs = Array.from(new Set(rawAlgs));
    if (uniqueAlgs.length !== 1 || (uniqueAlgs[0] !== 'HS256' && uniqueAlgs[0] !== 'RS256')) {
      throw new RuntimeFailure(
        'SECURITY: JWT_ALLOWED_ALGORITHMS must be exactly one of: HS256, RS256 (no comma-separated lists).',
      );
    }
    if (uniqueAlgs[0] === 'RS256' && !validatedConfig.JWT_PUBLIC_KEY) {
      throw new RuntimeFailure('SECURITY: JWT_PUBLIC_KEY is required when JWT_ALLOWED_ALGORITHMS=RS256.');
    }
    if (uniqueAlgs[0] === 'RS256' && !validatedConfig.JWT_PRIVATE_KEY) {
      throw new RuntimeFailure('SECURITY: JWT_PRIVATE_KEY is required when JWT_ALLOWED_ALGORITHMS=RS256.');
    }

    // JWT_SECRET validation with entropy checking
    if (!validatedConfig.JWT_SECRET) {
      throw new RuntimeFailure('SECURITY: JWT_SECRET is required in production environments.');
    }

    const jwtSecretError = validateSecretStrength(validatedConfig.JWT_SECRET, 'JWT_SECRET');
    if (jwtSecretError) {
      throw new RuntimeFailure(jwtSecretError);
    }

    if (!validatedConfig.PLATFORM_JWT_SECRET) {
      throw new RuntimeFailure('SECURITY: PLATFORM_JWT_SECRET is required in production environments.');
    }

    const platformJwtSecretError = validateSecretStrength(validatedConfig.PLATFORM_JWT_SECRET, 'PLATFORM_JWT_SECRET');
    if (platformJwtSecretError) {
      throw new RuntimeFailure(platformJwtSecretError);
    }

    // CURSOR_SECRET is recommended but optional (falls back to JWT_SECRET)
    if (validatedConfig.CURSOR_SECRET) {
      const cursorSecretError = validateSecretStrength(validatedConfig.CURSOR_SECRET, 'CURSOR_SECRET');
      if (cursorSecretError) {
        throw new RuntimeFailure(cursorSecretError);
      }
    }

    // Fail fast if placeholder secrets are present in production.
    // This is an operational safety rail to prevent deploying `.env` placeholders.
    const placeholderRe = /change-me/i;
    const secretKeyRe = /(PASSWORD|SECRET|KEY|TOKEN)/;
    for (const [key, value] of Object.entries(validatedConfig)) {
      if (!secretKeyRe.test(key)) continue;
      if (typeof value !== 'string') continue;
      if (!placeholderRe.test(value)) continue;

      throw new RuntimeFailure(`SECURITY: ${key} appears to be a placeholder value and must be set in production.`);
    }
  }

  // Allow DISABLE_RATE_LIMITING only in explicit test environment.
  if (!isTestEnv && validatedConfig.DISABLE_RATE_LIMITING === 'true') {
    throw new RuntimeFailure('SECURITY: DISABLE_RATE_LIMITING may only be used when NODE_ENV=test.');
  }

  // In non-prod, warn (not throw) when secrets are present but weak.
  // Developers may need short secrets locally; staging/CI should notice these warnings.
  if (!isProd && !isTestEnv) {
    const nonProdSecretsToCheck: Array<[string | undefined, string]> = [
      [validatedConfig.JWT_SECRET, 'JWT_SECRET'],
      [validatedConfig.PLATFORM_JWT_SECRET, 'PLATFORM_JWT_SECRET'],
      [validatedConfig.CURSOR_SECRET, 'CURSOR_SECRET'],
    ];
    for (const [secret, name] of nonProdSecretsToCheck) {
      if (!secret) continue;
      const err = validateSecretStrength(secret, name);
      if (err) {
        console.warn(`[env-validation] NON-PROD WARNING: ${err}`);
      }
    }
  }

  // Vault enforcement (opt-in via VAULT_ENABLED=true)
  if (validatedConfig.VAULT_ENABLED === 'true') {
    if (!validatedConfig.VAULT_ADDR) {
      throw new RuntimeFailure('SECURITY: VAULT_ADDR is required when VAULT_ENABLED=true');
    }
    if (!validatedConfig.VAULT_SECRET_PATH) {
      throw new RuntimeFailure('SECURITY: VAULT_SECRET_PATH is required when VAULT_ENABLED=true');
    }

    const hasToken = !!validatedConfig.VAULT_TOKEN;
    const hasRoleId = !!validatedConfig.VAULT_ROLE_ID;
    const hasSecretId = !!validatedConfig.VAULT_SECRET_ID;

    // Prevent partial AppRole config (one without the other)
    if (hasRoleId !== hasSecretId) {
      throw new RuntimeFailure('SECURITY: Vault AppRole auth requires both VAULT_ROLE_ID and VAULT_SECRET_ID');
    }

    const hasAppRole = hasRoleId && hasSecretId;
    if (!hasToken && !hasAppRole) {
      throw new RuntimeFailure(
        'SECURITY: Vault auth must use VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID when VAULT_ENABLED=true',
      );
    }
  }

  return validatedConfig;
}
