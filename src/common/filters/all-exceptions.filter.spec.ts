import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createMockArgumentsHost } from '../../../test/helpers/test-setup.utils';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockHost: ReturnType<typeof createMockArgumentsHost>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AllExceptionsFilter],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);
    mockHost = createMockArgumentsHost();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('catch', () => {
    it('should handle HttpException with object response', () => {
      const exception = new HttpException({ message: 'Bad Request', error: 'ValidationError' }, HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Bad Request',
          // error field is not in ErrorResponse interface
          path: '/api/v1/test',
        }),
      );
    });

    it('should handle HttpException with string response', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Forbidden',
        }),
      );
    });

    it('should handle HttpException with array message (flattened)', () => {
      const exception = new HttpException(
        { message: ['Field is required', 'Field must be valid'] },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Field is required, Field must be valid',
        }),
      );
    });

    it('should handle generic Error with sanitized message', () => {
      const exception = new Error('Something went wrong');

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred. Please try again later.',
        }),
      );
    });

    it('should handle unknown exception type', () => {
      const exception = 'Unknown error string';

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred. Please try again later.',
        }),
      );
    });

    it('should include timestamp in response', () => {
      const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockHost.mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );
    });
  });
});
