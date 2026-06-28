import { Injectable } from '@nestjs/common';

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1']);
const MOCK_LOCATIONS = [
  { country: 'US', city: 'New York' },
  { country: 'UK', city: 'London' },
  { country: 'JP', city: 'Tokyo' },
] as const;

@Injectable()
export class GeoIpService {
  getLocation(ip: string): { country: string; city: string } {
    if (LOCALHOST_IPS.has(ip)) return { country: 'Localhost', city: 'Localhost' };

    const parts = ip.split('.');
    if (parts.length === 4) {
      const lastOctetStr = parts[3];
      if (lastOctetStr) {
        const lastOctet = parseInt(lastOctetStr, 10);
        if (!Number.isNaN(lastOctet)) return MOCK_LOCATIONS[lastOctet % 3]!;
      }
    }
    return { country: 'Unknown', city: 'Unknown' };
  }
}
