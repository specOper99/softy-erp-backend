# API Documentation Standards

## Overview

This document defines the standards and best practices for API documentation in the Chapters Studio ERP system. It covers OpenAPI/Swagger specifications, endpoint documentation, versioning strategies, and deprecation policies.

---

## Table of Contents

1. [OpenAPI Specification](#openapi-specification)
2. [Endpoint Documentation](#endpoint-documentation)
3. [Versioning Strategy](#versioning-strategy)
4. [Error Response Standards](#error-response-standards)
5. [Deprecation Policy](#deprecation-policy)
6. [Documentation Examples](#documentation-examples)

---

## OpenAPI Specification

### Swagger Configuration

```typescript
// src/main.ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('Chapters Studio ERP API')
  .setDescription(
    `API for Chapters Studio ERP - Manages Bookings, Field Tasks, Finance, and HR/Payroll
  
  ## Authentication
  All endpoints require Bearer token authentication except for:
  - POST /api/v1/auth/login
  - POST /api/v1/auth/register
  - POST /api/v1/auth/forgot-password
  
  ## Rate Limiting
  - Authentication endpoints: 5 requests per 15 minutes
  - General API: 100 requests per minute`,
  )
  .setVersion('1.0.0')
  .addBearerAuth()
  .addTag('Auth', 'Authentication endpoints')
  .addTag('Users', 'User management')
  .addTag('Bookings', 'Booking management')
  .addTag('Tasks', 'Task assignment')
  .addTag('Finance', 'Financial operations')
  .addTag('HR', 'Human resources')
  .setLicense('Private', 'https://chapters.studio/terms')
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

### API Tags and Organization

| Tag               | Description              | Endpoints                        |
| ----------------- | ------------------------ | -------------------------------- |
| **Auth**          | Authentication endpoints | login, register, logout, refresh |
| **Users**         | User management          | CRUD, profile, settings          |
| **Bookings**      | Booking operations       | create, update, cancel, list     |
| **Tasks**         | Task management          | assign, complete, list           |
| **Finance**       | Financial operations     | transactions, wallets, reports   |
| **HR**            | Human resources          | employees, payroll, reviews      |
| **Admin**         | Administrative functions | system config, audit logs        |
| **Client Portal** | Client-facing endpoints  | bookings, invoices               |

---

## Endpoint Documentation

### Standard Response Structure

```typescript
// Success Response
interface ApiResponse<T> {
  statusCode: number;
  data: T;
  timestamp: string;
  path: string;
}

// Paginated Response
interface PaginatedResponse<T> {
  statusCode: number;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  timestamp: string;
  path: string;
}
```

### DTO Documentation Example

```typescript
// src/modules/auth/dto/login.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'User email address',
    format: 'email',
  })
  @IsEmail({}, { message: 'auth.email_invalid' })
  email: string;

  @ApiProperty({
    example: 'SecureP@ss123',
    description: 'User password',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Remember me - extends refresh token expiry',
    default: false,
  })
  @IsOptional()
  rememberMe?: boolean;
}
```

### Response DTO Documentation

```typescript
// src/modules/auth/dto/auth-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../users/enums/role.enum';

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'random_refresh_token_string...' })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Access token expiry in seconds' })
  expiresIn: number;

  @ApiProperty({
    type: 'object',
    properties: {
      id: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
      email: { type: 'string', example: 'john@example.com' },
      role: { type: 'string', enum: Role, example: 'OPS_MANAGER' },
      tenantId: {
        type: 'string',
        example: '550e8400-e29b-41d4-a716-446655440001',
      },
    },
  })
  user: {
    id: string;
    email: string;
    role: Role;
    tenantId: string;
  };
}
```

### Parameter Documentation

```typescript
// Path Parameters
@Put(':id')
@ApiOperation({ summary: 'Update user by ID' })
@ApiParam({
  name: 'id',
  description: 'User UUID',
  type: 'string',
  format: 'uuid',
})
@ApiResponse({ status: 200, description: 'User updated successfully' })
@ApiResponse({ status: 404, description: 'User not found' })
async updateUser(
  @Param('id', new ParseUUIDPipe()) id: string,
  @Body() dto: UpdateUserDto,
): Promise<User> {
  // ...
}

// Query Parameters
@Get()
@ApiOperation({ summary: 'List all users with pagination' })
@ApiQuery({
  name: 'page',
  required: false,
  type: 'number',
  default: 1,
  description: 'Page number (1-indexed)',
})
@ApiQuery({
  name: 'limit',
  required: false,
  type: 'number',
  default: 20,
  description: 'Items per page (max 100)',
})
@ApiQuery({
  name: 'role',
  required: false,
  enum: Role,
  description: 'Filter by user role',
})
async listUsers(
  @Query('page') page: number = 1,
  @Query('limit') limit: number = 20,
  @Query('role') role?: Role,
): Promise<PaginatedResponse<User>> {
  // ...
}
```

---

## Versioning Strategy

### URI Versioning

```typescript
// src/main.ts
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});

// Endpoints become:
// /api/v1/users
// /api/v2/users (when v2 is released)
```

### Version Transition Timeline

| Version | Status     | Release Date | Support End |
| ------- | ---------- | ------------ | ----------- |
| v1      | Current    | Jan 2026     | Jan 2027    |
| v2      | Planned    | Jul 2026     | Jan 2028    |
| v1      | Deprecated | Jul 2026     | Jan 2027    |

### Version Header (Optional)

```typescript
// For clients that cannot change URLs
app.enableVersioning({
  type: VersioningType.HEADER,
  header: 'X-API-Version',
  defaultVersion: '1',
});
```

---

## Error Response Standards

### Standard Error Format

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  correlationId: string;
  timestamp: string;
  path: string;
  method: string;
  details?: Record<string, unknown>;
}
```

### Error Codes

| Code | Error                 | Description                       |
| ---- | --------------------- | --------------------------------- |
| 400  | BAD_REQUEST           | Invalid request parameters        |
| 401  | UNAUTHORIZED          | Missing or invalid authentication |
| 403  | FORBIDDEN             | Insufficient permissions          |
| 404  | NOT_FOUND             | Resource not found                |
| 409  | CONFLICT              | Business rule violation           |
| 422  | UNPROCESSABLE_ENTITY  | Validation failed                 |
| 429  | TOO_MANY_REQUESTS     | Rate limit exceeded               |
| 500  | INTERNAL_SERVER_ERROR | Server error                      |

### Error Response Examples

**Validation Error:**

```json
{
  "statusCode": 400,
  "message": ["auth.email_required", "auth.password_min_length"],
  "error": "BadRequestException",
  "correlationId": "corr_1702122881000_abc123",
  "timestamp": "2026-01-08T11:14:41.000Z",
  "path": "/api/v1/auth/login",
  "method": "POST"
}
```

**Authentication Error:**

```json
{
  "statusCode": 401,
  "message": "auth.invalid_credentials",
  "error": "UnauthorizedException",
  "correlationId": "corr_1702122881000_def456",
  "timestamp": "2026-01-08T11:14:42.000Z",
  "path": "/api/v1/auth/login",
  "method": "POST"
}
```

**Not Found Error:**

```json
{
  "statusCode": 404,
  "message": "finance.transaction_not_found",
  "error": "NotFoundException",
  "correlationId": "corr_1702122881000_ghi789",
  "timestamp": "2026-01-08T11:14:43.000Z",
  "path": "/api/v1/finance/transactions/550e8400-e29b-41d4-a716-446655440000",
  "method": "GET"
}
```

---

## Deprecation Policy

### Deprecation Announcement

```typescript
// Add deprecation notice to endpoint
@Get('legacy-endpoint')
@ApiOperation({
  summary: 'Legacy endpoint (DEPRECATED)',
  description: '**DEPRECATED**: This endpoint will be removed in v2.0. Use /api/v2/new-endpoint instead.',
  deprecated: true,
})
async legacyEndpoint(): Promise<void> {
  // ...
}
```

### Sunset Headers

```typescript
// Add sunset header to deprecated responses
res.setHeader('Sunset', 'Sat, 01 Jul 2026 00:00:00 GMT');
res.setHeader('Deprecation', 'true');
```

### Communication Timeline

| Phase            | Timing                | Action                                       |
| ---------------- | --------------------- | -------------------------------------------- |
| **Announcement** | 6 months before       | Add `@deprecated` flag, include in changelog |
| **Warning**      | 3 months before       | Include deprecation header in responses      |
| **Sunset**       | Removal date          | Endpoint returns 410 Gone                    |
| **Removal**      | 3 months after sunset | Delete endpoint code                         |

---

## Documentation Examples

### Complete Endpoint Documentation

```typescript
// src/modules/users/users.controller.ts
@Controller('users')
export class UsersController {
  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description:
      'Retrieves a user by their unique identifier. Returns user details including profile, role, and tenant information.',
  })
  @ApiParam({
    name: 'id',
    description: 'The UUID of the user to retrieve',
    type: 'string',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'User found and returned',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    type: NotFoundErrorResponse,
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied - not a tenant admin',
    type: ForbiddenErrorResponse,
  })
  @ApiSecurity('bearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPS_MANAGER)
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.findOne(id);
    return this.usersMapper.toResponseDto(user);
  }
}
```

### Testing Documentation Integration

```typescript
// tests/e2e/users.e2e-spec.ts
describe('UsersController (e2e)', () => {
  it('should get user by id', () => {
    return request(app.getHttpServer())
      .get('/api/v1/users/550e8400-e29b-41d4-a716-446655440000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.data).toHaveProperty('id');
        expect(res.body.data.email).toBe('john@example.com');
      });
  });
}
```

---

## Best Practices

### DO's

✅ Use descriptive operation summaries (8-12 words)  
✅ Include example values for all properties  
✅ Document all possible response codes  
✅ Use proper enum representations  
✅ Include correlationId in all responses  
✅ Add descriptions for complex business logic  
✅ Keep documentation synchronized with code  
✅ Use consistent naming conventions

### DON'Ts

❌ Don't leave undocumented endpoints  
❌ Don't use vague descriptions ("Does something")  
❌ Don't omit error response documentation  
❌ Don't hardcode sensitive data in examples  
❌ Don't forget to update docs when changing APIs  
❌ Don't use inconsistent naming between code and docs  
❌ Don't omit rate limiting information

---

## Tools and Resources

| Tool              | Purpose                       |
| ----------------- | ----------------------------- |
| Swagger UI        | Interactive API documentation |
| Swagger Editor    | YAML/JSON OpenAPI editor      |
| OpenAPI Generator | Generate client SDKs          |
| Postman           | API testing and documentation |
| Redoc             | Alternative API documentation |

---

## References

- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.3)
- [NestJS Swagger](https://docs.nestjs.com/openapi/introduction)
- [Google API Design Guide](https://cloud.google.com/apis/design)

---

_Document Version: 1.0.0_  
_Last Updated: January 8, 2026_  
_Next Review: April 8, 2026_
