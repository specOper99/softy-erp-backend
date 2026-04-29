import type { Request } from 'express';
import * as ipaddr from 'ipaddr.js';

const TRUSTED_RANGES = new Set(['loopback', 'private', 'uniqueLocal', 'linkLocal']);

function parseIp(raw: string): string | undefined {
  try {
    return ipaddr.process(raw).toString();
  } catch {
    return undefined;
  }
}

function isPrivateOrLoopbackIp(ip: string): boolean {
  try {
    return TRUSTED_RANGES.has(ipaddr.process(ip).range());
  } catch {
    return false;
  }
}

function getTrustedProxyRemoteAddress(request: Request): string | undefined {
  const raw = request.socket?.remoteAddress;
  if (typeof raw !== 'string') return undefined;
  return parseIp(raw);
}

function parseXForwardedFor(forwarded: string): string | undefined {
  const parts = forwarded
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Many proxies append the immediate client IP to the end.
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = parseIp(parts[i] ?? '');
    if (ip) return ip;
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
        const ip = parseIp(realIp.trim());
        if (ip) return ip;
        warn?.(`Invalid IP in X-Real-IP header: ${realIp}`);
      }
    }
  }

  const rawIp = request.ip || request.socket?.remoteAddress;
  if (!rawIp) {
    warn?.('No IP address available from request');
    return null;
  }

  const ip = parseIp(rawIp);
  if (!ip) {
    warn?.(`Invalid IP address from request: ${rawIp}`);
    return null;
  }
  return ip;
}
