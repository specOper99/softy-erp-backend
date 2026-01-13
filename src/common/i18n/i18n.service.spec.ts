import { Test, TestingModule } from '@nestjs/testing';
import { I18nService, Language } from './i18n.service';

// Mock fs.readFileSync
jest.mock('fs', () => ({
  readFileSync: jest.fn((filePath: string) => {
    if (filePath.includes('en.json')) {
      return JSON.stringify({
        common: { success: 'Success', error: 'Error' },
        auth: { login_success: 'Login successful' },
        task: { assigned: 'Task assigned to {staffName}' },
      });
    }
    if (filePath.includes('ar.json')) {
      return JSON.stringify({
        common: { success: 'نجاح', error: 'خطأ' },
        auth: { login_success: 'تم تسجيل الدخول بنجاح' },
      });
    }
    if (filePath.includes('ku.json')) {
      return JSON.stringify({
        common: { success: 'سەرکەوتوو' },
      });
    }
    if (filePath.includes('fr.json')) {
      return JSON.stringify({
        common: { success: 'Succès' },
      });
    }
    throw new Error('File not found');
  }),
}));

describe('I18nService', () => {
  let service: I18nService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [I18nService],
    }).compile();

    service = module.get<I18nService>(I18nService);
    service.onModuleInit();
  });

  describe('getSupportedLanguages', () => {
    it('should return supported languages', () => {
      const languages = service.getSupportedLanguages();
      expect(languages).toContain('en');
      expect(languages).toContain('ar');
      expect(languages).toContain('ku');
      expect(languages).toContain('fr');
    });
  });

  describe('getDefaultLanguage', () => {
    it('should return english as default', () => {
      expect(service.getDefaultLanguage()).toBe('en');
    });
  });

  describe('parseAcceptLanguage', () => {
    it('should return default for undefined header', () => {
      expect(service.parseAcceptLanguage(undefined)).toBe('en');
    });

    it('should parse simple language code', () => {
      expect(service.parseAcceptLanguage('ar')).toBe('ar');
    });

    it('should parse language with region code', () => {
      expect(service.parseAcceptLanguage('ar-SA')).toBe('ar');
    });

    it('should parse quality values and return highest', () => {
      expect(service.parseAcceptLanguage('en;q=0.5, ar;q=0.9, fr;q=0.3')).toBe('ar');
    });

    it('should return default for unsupported language', () => {
      expect(service.parseAcceptLanguage('de')).toBe('en');
    });

    it('should handle complex Accept-Language header', () => {
      expect(service.parseAcceptLanguage('de-DE,de;q=0.9,ku;q=0.8')).toBe('ku');
    });
  });

  describe('translate', () => {
    it('should translate simple key', () => {
      expect(service.translate('common.success', 'en')).toBe('Success');
    });

    it('should translate to Arabic', () => {
      expect(service.translate('common.success', 'ar')).toBe('نجاح');
    });

    it('should translate to Kurdish', () => {
      expect(service.translate('common.success', 'ku')).toBe('سەرکەوتوو');
    });

    it('should translate to French', () => {
      expect(service.translate('common.success', 'fr')).toBe('Succès');
    });

    it('should return key if translation not found', () => {
      expect(service.translate('nonexistent.key', 'en')).toBe('nonexistent.key');
    });

    it('should use default language if specified language not loaded', () => {
      expect(service.translate('common.success', 'de' as Language)).toBe('Success');
    });

    it('should replace parameters in translation', () => {
      const result = service.translate('task.assigned', 'en', {
        staffName: 'John Doe',
      });
      expect(result).toBe('Task assigned to John Doe');
    });

    it('should keep placeholder if param not provided', () => {
      const result = service.translate('task.assigned', 'en', {});
      expect(result).toBe('Task assigned to {staffName}');
    });
  });

  describe('t (shorthand)', () => {
    it('should work as alias for translate', () => {
      expect(service.t('common.success')).toBe('Success');
      expect(service.t('common.success', 'ar')).toBe('نجاح');
    });
  });
});
