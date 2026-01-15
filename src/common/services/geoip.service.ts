import { Injectable } from '@nestjs/common';

@Injectable()
export class GeoIpService {
  getLocation(ip: string): { country: string; city: string } {
    if (ip === '127.0.0.1' || ip === '::1') {
      return { country: 'Localhost', city: 'Localhost' };
    }

    const parts = ip.split('.');
    if (parts.length === 4) {
      const lastOctetStr = parts[3];
      if (lastOctetStr) {
        const lastOctet = parseInt(lastOctetStr, 10);
        if (lastOctet % 3 === 0) return { country: 'US', city: 'New York' };
        if (lastOctet % 3 === 1) return { country: 'UK', city: 'London' };
        if (lastOctet % 3 === 2) return { country: 'JP', city: 'Tokyo' };
      }
    }

    return { country: 'Unknown', city: 'Unknown' };
  }
}
