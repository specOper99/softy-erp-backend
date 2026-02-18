import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StartTimeEntryDto, StopTimeEntryDto } from './time-entry.dto';

describe('TimeEntry DTOs', () => {
  describe('StartTimeEntryDto', () => {
    it('should validate with valid coordinates', async () => {
      const dto = plainToInstance(StartTimeEntryDto, {
        taskId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
        latitude: 33.3152,
        longitude: 44.3661,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when latitude is out of range', async () => {
      const dto = plainToInstance(StartTimeEntryDto, {
        taskId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
        latitude: 999,
      });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'latitude')).toBe(true);
    });

    it('should fail when longitude is out of range', async () => {
      const dto = plainToInstance(StartTimeEntryDto, {
        taskId: 'e2f7e9e7-64de-4cd9-b91a-83f097ca9b25',
        longitude: -999,
      });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'longitude')).toBe(true);
    });
  });

  describe('StopTimeEntryDto', () => {
    it('should validate with valid coordinates', async () => {
      const dto = plainToInstance(StopTimeEntryDto, {
        latitude: -12.0464,
        longitude: -77.0428,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when latitude is out of range', async () => {
      const dto = plainToInstance(StopTimeEntryDto, {
        latitude: -91,
      });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'latitude')).toBe(true);
    });

    it('should fail when longitude is out of range', async () => {
      const dto = plainToInstance(StopTimeEntryDto, {
        longitude: 181,
      });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'longitude')).toBe(true);
    });
  });
});
