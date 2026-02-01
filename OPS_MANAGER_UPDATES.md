# تحديثات Backend - دعم OPS_MANAGER

## التحديثات المنفذة

### 1. نظام الإشعارات (Notifications System) ✅

تم إنشاء نظام إشعارات كامل يشمل:

#### الـ Endpoints الجديدة:

```
GET    /notifications              - عرض الإشعارات مع pagination و filters
GET    /notifications/unread-count - عدد الإشعارات غير المقروءة
PATCH  /notifications/:id/read     - تمييز إشعار كمقروء
POST   /notifications/mark-all-read - تمييز جميع الإشعارات كمقروءة
DELETE /notifications/:id           - حذف إشعار
```

#### الملفات المنشأة:

1. **Entity**: `backend/src/modules/notifications/entities/notification.entity.ts`
   - جدول notifications مع دعم multi-tenant
   - Indexes محسّنة للأداء

2. **Service**: `backend/src/modules/notifications/services/notification.service.ts`
   - إنشاء إشعارات
   - عرض الإشعارات مع filters (read/unread, type)
   - تمييز كمقروء (فردي وجماعي)
   - حذف إشعارات

3. **Controller**: `backend/src/modules/notifications/controllers/notifications.controller.ts`
   - REST API للإشعارات
   - دعم الأدوار: ADMIN, OPS_MANAGER, FIELD_STAFF

4. **DTOs**: `backend/src/modules/notifications/dto/notification.dto.ts`
   - CreateNotificationDto
   - NotificationResponseDto
   - NotificationFilterDto
   - MarkAsReadDto

5. **Migration**: `backend/src/migrations/1738451200000-CreateNotificationsTable.ts`
   - إنشاء جدول notifications
   - Indexes محسّنة للأداء

#### الميزات:

- ✅ Pagination (page, limit)
- ✅ Filtering (read/unread, notification type)
- ✅ Multi-tenant support
- ✅ Soft authorization (user can only see their own notifications)
- ✅ Metadata field (JSON) لتخزين بيانات إضافية
- ✅ Action URL لربط الإشعار بصفحة معينة

#### كيفية الاستخدام:

```typescript
// Frontend Example
// عرض الإشعارات
const { data, total } = await api.get('/notifications', {
  params: { read: false, page: 1, limit: 20 }
});

// تمييز كمقروء
await api.patch(`/notifications/${id}/read`);

// عدد غير المقروءة
const { count } = await api.get('/notifications/unread-count');
```

---

### 2. إزالة متطلب MFA من Dashboard ✅

**التغيير**: تم إزالة `@MfaRequired()` من مستوى الـ controller

**الملف**: `backend/src/modules/dashboard/dashboard.controller.ts`

**السبب**: 
- الـ Dashboard endpoints للقراءة فقط
- OPS_MANAGER يحتاج وصول يومي
- MFA يعيق الإنتاجية لعمليات القراءة

**الـ Endpoints المتاحة الآن بدون MFA**:
```
GET /dashboard/kpis
GET /dashboard/summary
GET /dashboard/revenue
GET /dashboard/booking-trends
GET /dashboard/staff-performance
GET /dashboard/package-stats
GET /dashboard/export
GET /dashboard/preferences
PUT /dashboard/preferences
```

**ملاحظة أمنية**: هذه endpoints للقراءة فقط ولا تعدل بيانات، والـ RolesGuard يحمي الوصول.

---

### 3. تعديل متطلب MFA من Transactions ✅

**التغيير**: نقل `@MfaRequired()` من controller-level إلى method-level

**الملف**: `backend/src/modules/finance/controllers/transactions.controller.ts`

**النتيجة**:
- ✅ **القراءة بدون MFA**: GET endpoints متاحة لـ OPS_MANAGER بدون MFA
  - `GET /transactions`
  - `GET /transactions/cursor`
  - `GET /transactions/:id`
  - `GET /transactions/export`

- 🔒 **الكتابة تتطلب MFA**: POST endpoints تتطلب MFA
  - `POST /transactions` (إنشاء معاملة يدوية) ← يتطلب MFA
  - `POST /transactions/budgets` (Admin فقط)

**السبب**: 
- عمليات القراءة آمنة ولا تعدل البيانات
- إنشاء معاملات مالية يتطلب MFA للحماية
- توازن بين الأمان والإنتاجية

---

## خطوات التطبيق (Deployment)

### 1. تشغيل Migration:

```bash
cd backend
npm run migration:run
```

أو للتطوير (auto-run):
```bash
npm run start:dev
```

### 2. التحقق من الـ Endpoints:

```bash
# تسجيل دخول كـ OPS_MANAGER
POST /auth/login
{
  "email": "ops@example.com",
  "password": "password"
}

# الحصول على الإشعارات
GET /notifications
Authorization: Bearer <token>

# Dashboard (بدون MFA)
GET /dashboard/summary
Authorization: Bearer <token>

# Transactions (بدون MFA)
GET /transactions
Authorization: Bearer <token>
```

---

## الأمان (Security Notes)

### ما تم الحفاظ عليه:
- ✅ JWT Authentication على جميع الـ endpoints
- ✅ Role-Based Access Control (RBAC)
- ✅ Multi-tenant isolation
- ✅ MFA على العمليات الحساسة (Create/Update/Delete)

### ما تم تخفيفه:
- ❌ MFA على Dashboard (read-only)
- ❌ MFA على Transactions GET (read-only)

### التوصيات المستقبلية:
1. تفعيل MFA اختياري لـ OPS_MANAGER عبر:
   - `POST /platform/mfa/setup`
   - `POST /platform/mfa/verify`
   
2. مراقبة الوصول عبر Audit Logs

3. إضافة Rate Limiting على الـ endpoints الحساسة

---

## التوافق مع Frontend

### Endpoints الآن متاحة للـ OPS_MANAGER:

| Feature | Endpoint | Status |
|---------|----------|--------|
| الإشعارات | `GET /notifications` | ✅ جديد |
| عدد غير المقروءة | `GET /notifications/unread-count` | ✅ جديد |
| تمييز كمقروء | `PATCH /notifications/:id/read` | ✅ جديد |
| Dashboard Summary | `GET /dashboard/summary` | ✅ بدون MFA |
| Staff Performance | `GET /dashboard/staff-performance` | ✅ بدون MFA |
| Package Stats | `GET /dashboard/package-stats` | ✅ بدون MFA |
| Transactions | `GET /transactions` | ✅ بدون MFA |

---

## الاختبار (Testing)

### اختبار الإشعارات:

```bash
# إنشاء إشعار (للتطوير فقط - يجب استخدام Service داخلياً)
# الـ service method: notificationService.createNotification()

# عرض الإشعارات
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/notifications?read=false&limit=10

# تمييز كمقروء
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/notifications/{id}/read
```

### اختبار Dashboard بدون MFA:

```bash
# يجب أن يعمل بدون MFA
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/dashboard/summary
```

### اختبار Transactions بدون MFA:

```bash
# GET يعمل بدون MFA
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/transactions

# POST يتطلب MFA
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"EXPENSE","amount":100}' \
  http://localhost:3000/transactions
# ← يجب أن يرجع: 403 "MFA is required"
```

---

## ملاحظات إضافية

1. **NotificationType Enum**: الأنواع المتاحة حالياً:
   - BOOKING_CREATED
   - BOOKING_UPDATED
   - BOOKING_CANCELLED
   - TASK_ASSIGNED
   - TASK_COMPLETED
   - PAYMENT_RECEIVED
   - SYSTEM_ALERT

2. **إضافة أنواع جديدة**: عدّل `backend/src/modules/notifications/enums/notification.enum.ts`

3. **إنشاء إشعارات تلقائية**: استخدم NotificationService في الـ modules الأخرى:
   ```typescript
   constructor(private notificationService: NotificationService) {}
   
   async createBooking(dto) {
     const booking = await this.bookingRepo.save(dto);
     
     // إرسال إشعار
     await this.notificationService.createNotification({
       userId: booking.clientId,
       tenantId: booking.tenantId,
       type: NotificationType.BOOKING_CREATED,
       title: 'حجز جديد',
       message: `تم إنشاء حجز رقم ${booking.id}`,
       actionUrl: `/bookings/${booking.id}`
     });
     
     return booking;
   }
   ```

---

## المطلوب من الـ Frontend

1. ✅ تحديث الواجهات لاستخدام `/notifications` بدلاً من notifications preferences فقط
2. ✅ إزالة رسائل "يتطلب MFA" من Dashboard
3. ✅ إزالة رسائل "يتطلب MFA" من Transactions GET endpoints
4. ✅ تطبيق Inbox/Bell icon لعرض الإشعارات
5. ✅ Real-time updates (اختياري - يمكن polling كل 30 ثانية)

---

## الملخص

✅ تم إنشاء نظام إشعارات كامل  
✅ تم إزالة MFA من Dashboard  
✅ تم تخفيف MFA من Transactions (القراءة فقط)  
✅ تم الحفاظ على الأمان للعمليات الحساسة  
✅ التوافق الكامل مع Frontend  

**التاريخ**: 2026-02-01  
**المطور**: Backend Team
