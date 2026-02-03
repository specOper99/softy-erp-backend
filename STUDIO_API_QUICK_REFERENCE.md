# Studio API - Quick Reference Card

## 🆕 New Endpoints

### Studio Settings
```
GET    /tenants/studio/settings      → Get studio configuration
PUT    /tenants/studio/settings      → Update studio settings (requires MFA)
```

### Studio KPIs
```
GET    /dashboard/studio-kpis        → Get all studio metrics in one call
```

## ✨ Enhanced Endpoints (with Filtering)

### Tasks
```
GET    /tasks?status=PENDING&assignedUserId=xxx&bookingId=xxx&search=xxx&page=1&limit=20
```
**Filters:** status, assignedUserId, bookingId, taskTypeId, dueDateStart, dueDateEnd, search

### Packages
```
GET    /packages?isActive=true&search=premium&page=1&limit=20
```
**Filters:** isActive, search

### HR Profiles
```
GET    /hr/profiles?status=active&department=Sales&search=John&page=1&limit=20
```
**Filters:** status, department, contractType, search

## 📦 Response Formats

### Paginated List Response
```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Studio KPIs Response
```json
{
  "totalBookings": 250,
  "pendingBookings": 15,
  "confirmedBookings": 180,
  "todayBookings": 8,
  "totalTasks": 420,
  "pendingTasks": 35,
  "inProgressTasks": 50,
  "todayTasks": 12,
  "totalStaff": 25,
  "activeStaff": 22,
  "onLeaveStaff": 3,
  "totalRevenue": 125000.00,
  "monthlyRevenue": 8500.00,
  "unreadNotifications": 7,
  "generatedAt": "2026-02-03T10:30:00.000Z"
}
```

### Error Response
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "path": "/api/v1/tasks",
  "timestamp": "2026-02-03T10:30:00.000Z"
}
```

## 🔑 Authentication
All endpoints require:
```
Authorization: Bearer <jwt_token>
```

Studio settings update additionally requires MFA.

## 🚀 Migration
Before first use, run:
```bash
npm run migration:run
```

## 📖 Full Documentation
Swagger UI: `http://localhost:3000/api/docs`

## 🎯 Benefits
✅ Single KPI endpoint (no multiple calls)
✅ Pagination metadata on all lists
✅ Advanced filtering on tasks/packages/profiles
✅ Complete studio configuration via API
✅ Standardized error responses
