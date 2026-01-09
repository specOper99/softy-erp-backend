import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from '../i18n';
import { I18nExceptionFilter } from './i18n-exception.filter';

describe('I18nExceptionFilter', () => {
  let filter: I18nExceptionFilter;
  let i18nService: jest.Mocked<I18nService>;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  const mockRequest = {
    url: '/api/v1/test',
    headers: {
      'accept-language': 'en',
    },
  };

  const mockHost = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  } as unknown as ArgumentsHost;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        I18nExceptionFilter,
        {
          provide: I18nService,
          useValue: {
            parseAcceptLanguage: jest.fn().mockReturnValue('en'),
            translate: jest.fn((key: string) => {
              const translations: Record<string, string> = {
                'common.unauthorized': 'Access denied',
                'auth.login_failed': 'Invalid credentials',
              };
              return translations[key] || key;
            }),
          },
        },
      ],
    }).compile();

    filter = module.get<I18nExceptionFilter>(I18nExceptionFilter);
    i18nService = module.get(I18nService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('catch', () => {
    it('should translate known error message', () => {
      const exception = new HttpException(
        'Unauthorized',
        HttpStatus.UNAUTHORIZED,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Access denied',
        }),
      );
    });

    it('should handle object exception response', () => {
      const exception = new HttpException(
        { message: 'Invalid email or password' },
        HttpStatus.UNAUTHORIZED,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid credentials',
        }),
      );
    });

    it('should handle array message (validation errors)', () => {
      const exception = new HttpException(
        { message: ['Field is required', 'Invalid format'] },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
        }),
      );
    });

    it('should handle { key, args } pattern', () => {
      const exception = new HttpException(
        { key: 'booking.not_found', args: { id: '123' } },
        HttpStatus.NOT_FOUND,
      );

      filter.catch(exception, mockHost);

      expect(i18nService.translate).toHaveBeenCalledWith(
        'booking.not_found',
        'en',
        { id: '123' },
      );
    });

    it('should parse Accept-Language header', () => {
      const hostWithArabic = {
        switchToHttp: jest.fn().mockReturnValue({
          getResponse: () => mockResponse,
          getRequest: () => ({
            ...mockRequest,
            headers: { 'accept-language': 'ar' },
          }),
        }),
      } as unknown as ArgumentsHost;

      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, hostWithArabic);

      expect(i18nService.parseAcceptLanguage).toHaveBeenCalledWith('ar');
    });

    it('should return original message if no translation', () => {
      i18nService.translate.mockImplementation((key) => key);
      const exception = new HttpException(
        'Custom error',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Custom error',
        }),
      );
    });

    it('should include timestamp and path', () => {
      const exception = new HttpException('Error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
          path: '/api/v1/test',
        }),
      );
    });

    it('should map status codes to error names', () => {
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not Found',
        }),
      );
    });
  });
});
