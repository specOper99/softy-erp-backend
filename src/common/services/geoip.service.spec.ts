import { Test, TestingModule } from '@nestjs/testing';
import { GeoIpService } from './geoip.service';

describe('GeoIpService', () => {
  let service: GeoIpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeoIpService],
    }).compile();

    service = module.get<GeoIpService>(GeoIpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLocation', () => {
    it('should return Localhost for 127.0.0.1', () => {
      const result = service.getLocation('127.0.0.1');
      expect(result).toEqual({ country: 'Localhost', city: 'Localhost' });
    });

    it('should return Localhost for ::1 (IPv6 localhost)', () => {
      const result = service.getLocation('::1');
      expect(result).toEqual({ country: 'Localhost', city: 'Localhost' });
    });

    it('should return US/New York when last octet % 3 === 0', () => {
      const result = service.getLocation('192.168.1.0');
      expect(result).toEqual({ country: 'US', city: 'New York' });

      const result2 = service.getLocation('192.168.1.3');
      expect(result2).toEqual({ country: 'US', city: 'New York' });

      const result3 = service.getLocation('10.0.0.6');
      expect(result3).toEqual({ country: 'US', city: 'New York' });
    });

    it('should return UK/London when last octet % 3 === 1', () => {
      const result = service.getLocation('192.168.1.1');
      expect(result).toEqual({ country: 'UK', city: 'London' });

      const result2 = service.getLocation('192.168.1.4');
      expect(result2).toEqual({ country: 'UK', city: 'London' });
    });

    it('should return JP/Tokyo when last octet % 3 === 2', () => {
      const result = service.getLocation('192.168.1.2');
      expect(result).toEqual({ country: 'JP', city: 'Tokyo' });

      const result2 = service.getLocation('192.168.1.5');
      expect(result2).toEqual({ country: 'JP', city: 'Tokyo' });
    });

    it('should return Unknown for invalid IP format', () => {
      const result = service.getLocation('not-an-ip');
      expect(result).toEqual({ country: 'Unknown', city: 'Unknown' });
    });

    it('should return Unknown for IPv6 addresses', () => {
      const result = service.getLocation(
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      );
      expect(result).toEqual({ country: 'Unknown', city: 'Unknown' });
    });

    it('should return Unknown for incomplete IP', () => {
      const result = service.getLocation('192.168.1');
      expect(result).toEqual({ country: 'Unknown', city: 'Unknown' });
    });
  });
});
