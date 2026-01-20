import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RequireReasonGuard } from './require-reason.guard';

describe('RequireReasonGuard', () => {
  let guard: RequireReasonGuard;
  let reflector: Reflector;

  const createMockExecutionContext = (body: object | null, query: object | null): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ body, query }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequireReasonGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RequireReasonGuard>(RequireReasonGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    describe('when @RequireReason decorator is not applied', () => {
      it('should allow access without reason', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
        const context = createMockExecutionContext({}, {});

        expect(guard.canActivate(context)).toBe(true);
      });

      it('should allow access when decorator returns undefined', () => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
        const context = createMockExecutionContext({}, {});

        expect(guard.canActivate(context)).toBe(true);
      });
    });

    describe('when @RequireReason decorator is applied', () => {
      beforeEach(() => {
        jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      });

      // Valid reason scenarios
      describe('valid reason in body', () => {
        it('should allow access with valid reason in body', () => {
          const context = createMockExecutionContext({ reason: 'This is a valid reason for the operation' }, {});

          expect(guard.canActivate(context)).toBe(true);
        });

        it('should allow access with exactly 10 characters', () => {
          const context = createMockExecutionContext({ reason: '1234567890' }, {});

          expect(guard.canActivate(context)).toBe(true);
        });

        it('should allow access with long detailed reason', () => {
          const reason = 'Customer requested account suspension due to suspected unauthorized access. Ticket #12345.';
          const context = createMockExecutionContext({ reason }, {});

          expect(guard.canActivate(context)).toBe(true);
        });

        it('should trim and attach validated reason to request', () => {
          const request = { body: { reason: '  Valid reason here  ' }, query: {} };
          const context = {
            switchToHttp: () => ({
              getRequest: () => request,
            }),
            getHandler: () => jest.fn(),
            getClass: () => jest.fn(),
          } as unknown as ExecutionContext;

          guard.canActivate(context);

          expect(request).toHaveProperty('validatedReason', 'Valid reason here');
        });
      });

      describe('valid reason in query', () => {
        it('should allow access with valid reason in query string', () => {
          const context = createMockExecutionContext({}, { reason: 'Valid reason from query parameter' });

          expect(guard.canActivate(context)).toBe(true);
        });

        it('should prefer body reason over query reason', () => {
          const request = {
            body: { reason: 'Body reason!' },
            query: { reason: 'Query reason!' },
          };
          const context = {
            switchToHttp: () => ({
              getRequest: () => request,
            }),
            getHandler: () => jest.fn(),
            getClass: () => jest.fn(),
          } as unknown as ExecutionContext;

          guard.canActivate(context);

          // Body takes precedence
          expect(request).toHaveProperty('validatedReason', 'Body reason!');
        });
      });

      // Invalid reason scenarios
      describe('missing reason', () => {
        it('should throw BadRequestException when reason is missing entirely', () => {
          const context = createMockExecutionContext({}, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
          expect(() => guard.canActivate(context)).toThrow(
            'A detailed reason (minimum 10 characters) is required for this operation',
          );
        });

        it('should throw BadRequestException when reason is null', () => {
          const context = createMockExecutionContext({ reason: null }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw BadRequestException when reason is undefined', () => {
          const context = createMockExecutionContext({ reason: undefined }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });
      });

      describe('invalid reason type', () => {
        it('should throw BadRequestException when reason is a number', () => {
          const context = createMockExecutionContext({ reason: 12345678901 }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw BadRequestException when reason is an object', () => {
          const context = createMockExecutionContext({ reason: { text: 'not a string' } }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw BadRequestException when reason is an array', () => {
          const context = createMockExecutionContext({ reason: ['not', 'a', 'string'] }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw BadRequestException when reason is boolean', () => {
          const context = createMockExecutionContext({ reason: true }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });
      });

      describe('reason too short', () => {
        it('should throw BadRequestException when reason is less than 10 characters', () => {
          const context = createMockExecutionContext({ reason: 'Too short' }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw BadRequestException when reason is exactly 9 characters', () => {
          const context = createMockExecutionContext({ reason: '123456789' }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw BadRequestException when reason is 1 character', () => {
          const context = createMockExecutionContext({ reason: 'x' }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw BadRequestException when reason is empty string', () => {
          const context = createMockExecutionContext({ reason: '' }, {});

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw when trimmed reason is less than 10 characters', () => {
          const context = createMockExecutionContext(
            { reason: '     short     ' }, // "short" is only 5 chars
            {},
          );

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });

        it('should throw when reason is only whitespace', () => {
          const context = createMockExecutionContext(
            { reason: '            ' }, // All spaces
            {},
          );

          expect(() => guard.canActivate(context)).toThrow(BadRequestException);
        });
      });

      // Edge cases
      describe('edge cases', () => {
        it('should handle null body gracefully', () => {
          const context = createMockExecutionContext(null, { reason: 'Valid reason!' });

          expect(guard.canActivate(context)).toBe(true);
        });

        it('should handle null query gracefully', () => {
          const context = createMockExecutionContext({ reason: 'Valid reason!' }, null);

          expect(guard.canActivate(context)).toBe(true);
        });

        it('should handle special characters in reason', () => {
          const context = createMockExecutionContext(
            { reason: "Customer's request: 日本語 émojis 🎉 <script>alert('xss')</script>" },
            {},
          );

          expect(guard.canActivate(context)).toBe(true);
        });

        it('should handle unicode characters correctly', () => {
          const context = createMockExecutionContext(
            { reason: 'Ñoño áéíóú' }, // 10+ unicode chars
            {},
          );

          expect(guard.canActivate(context)).toBe(true);
        });
      });
    });
  });
});
