import { ConfigService } from '@nestjs/config';

export type AllowedJwtAlgorithm = 'HS256' | 'RS256';

export function getAllowedJwtAlgorithm(configService: ConfigService): AllowedJwtAlgorithm {
  const rawAlgorithms = configService.get<string>('JWT_ALLOWED_ALGORITHMS') ?? 'HS256';
  const parsed = rawAlgorithms
    .split(',')
    .map((algorithm) => algorithm.trim().toUpperCase())
    .filter((algorithm): algorithm is AllowedJwtAlgorithm => algorithm === 'HS256' || algorithm === 'RS256');

  const unique = Array.from(new Set(parsed));
  if (unique.length !== 1) {
    throw new Error('JWT_ALLOWED_ALGORITHMS must be exactly one of: HS256, RS256');
  }

  return unique[0] ?? 'HS256';
}
