import { validate } from 'class-validator';
import { LogoutDto, RevokeOtherSessionsDto } from './auth.dto';

describe('Auth DTO validation', () => {
  describe('LogoutDto', () => {
    it('accepts allSessions boolean', async () => {
      const dto = new LogoutDto();
      dto.allSessions = true;
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects empty refreshToken', async () => {
      const dto = new LogoutDto();
      dto.refreshToken = '';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('RevokeOtherSessionsDto', () => {
    it('rejects missing currentRefreshToken', async () => {
      const dto = new RevokeOtherSessionsDto();
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts valid currentRefreshToken', async () => {
      const dto = new RevokeOtherSessionsDto();
      dto.currentRefreshToken = 'refresh-token';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
