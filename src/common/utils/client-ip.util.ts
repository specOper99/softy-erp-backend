import type { Request } from 'express';
import { isIP } from 'net';

function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

function isPrivateOrLoopbackIp(ip: string): boolean {
  const normalized = normalizeIp(ip);

  if (normalized === '127.0.0.1' || normalized === '::1') return true;

  if (normalized.startsWith('10.')) return true;
  if (normalized.startsWith('192.168.')) return true;

  if (normalized.startsWith('172.')) {
    const secondOctet = Number(normalized.split('.')[1]);
    if (Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // IPv6 ULA (fc00::/7)
  if (normalized.toLowerCase().startsWith('fc') || normalized.toLowerCase().startsWith('fd')) return true;

  return false;
}

function getTrustedProxyRemoteAddress(request: Request): string | undefined {
  const raw = request.socket?.remoteAddress;
  if (typeof raw !== 'string') return undefined;
  const ip = normalizeIp(raw);
  return isIP(ip) ? ip : undefined;
}

function parseXForwardedFor(forwarded: string): string | undefined {
  const parts = forwarded
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Many proxies append the immediate client IP to the end.
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = normalizeIp(parts[i] ?? '');
    if (candidate && isIP(candidate)) return candidate;
  }

  return undefined;
}

export function getClientIp(
  request: Request,
  trustProxyHeaders: boolean,
  warn?: (message: string) => void,
): string | null {
  if (trustProxyHeaders) {
    const remote = getTrustedProxyRemoteAddress(request);

    // Defense-in-depth: only trust proxy headers when the direct connection
    // comes from a private/loopback address (typical for ingress / reverse proxies).
    const canTrustHeaders = remote ? isPrivateOrLoopbackIp(remote) : false;

    if (!canTrustHeaders && remote) {
      warn?.(`Ignoring proxy headers from non-private remoteAddress: ${remote}`);
    }

    if (canTrustHeaders) {
      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        const ip = parseXForwardedFor(forwarded);
        if (ip) return ip;
        warn?.(`Invalid IPs in X-Forwarded-For header: ${forwarded}`);
      }

      const realIp = request.headers['x-real-ip'];
      if (typeof realIp === 'string') {
        const ip = normalizeIp(realIp.trim());
        if (ip && isIP(ip)) return ip;
        warn?.(`Invalid IP in X-Real-IP header: ${realIp}`);
      }
    }
  }

  const rawIp = request.ip || request.socket?.remoteAddress;
  if (!rawIp) {
    warn?.('No IP address available from request');
    return null;
  }

  const ip = normalizeIp(rawIp);
  if (!isIP(ip)) {
    warn?.(`Invalid IP address from request: ${ip}`);
    return null;
  }
  return ip;
}
