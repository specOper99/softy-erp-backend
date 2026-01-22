# API Versioning Policy

## 1. Strategy
We use **URI Versioning**.
- Format: `/api/v{major}/{resource}`
- Example: `GET /api/v1/bookings`

## 2. When to Version?
New versions (`v2`) are required ONLY for **Breaking Changes**:
- Removing a field from response.
- Making an optional parameter required.
- Changing the type of a field.

**Non-Breaking Changes** (Additions) should be made to the existing version (`v1`).

## 3. Deprecation Policy
1. **Announce**: Mark endpoint as `@Deprecated` in Swagger and add `Deprecation` HTTP header.
2. **Sunset Header**: Add `Sunset: <Date>` header (at least 6 months future).
3. **Communication**: Email developers 3 months before removal.
4. **Removal**: Remove code after Sunset date.

## 4. Header Handling
Clients SHOULD expect:
```http
Warning: 299 - "This endpoint is deprecated and will be removed on 2026-07-01"
```
