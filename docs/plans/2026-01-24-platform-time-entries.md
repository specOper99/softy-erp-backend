# Platform Time Entries Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add platform-only endpoints to list and update tenant time entries, gated by a new platform permission and audited.

**Architecture:** Create a `PlatformTimeEntriesController` and `PlatformTimeEntriesService` under the platform module, using explicit `tenantId` parameters and TypeORM repositories (no tenant context). Add a new platform permission for access and a new audit action for updates.

**Tech Stack:** NestJS 11, TypeORM, Jest

### Task 1: Add platform permission + guard test coverage

**Files:**
- Modify: `src/modules/platform/enums/platform-permission.enum.ts`
- Modify: `src/modules/platform/guards/platform-permissions.guard.spec.ts`

**Step 1: Write the failing test**

```ts
it('should allow access to SUPPORT_TIME_ENTRIES permission', () => {
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([PlatformPermission.SUPPORT_TIME_ENTRIES]);
  const context = createMockExecutionContext({ platformRole: PlatformRole.SUPER_ADMIN });

  expect(guard.canActivate(context)).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- platform-permissions.guard.spec.ts`
Expected: FAIL with `PlatformPermission.SUPPORT_TIME_ENTRIES` missing.

**Step 3: Write minimal implementation**

```ts
// src/modules/platform/enums/platform-permission.enum.ts
SUPPORT_TIME_ENTRIES = 'platform:support:time_entries',
```

**Step 4: Run test to verify it passes**

Run: `npm test -- platform-permissions.guard.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/modules/platform/enums/platform-permission.enum.ts src/modules/platform/guards/platform-permissions.guard.spec.ts
git commit -m "feat(platform): add support time entry permission"
```

### Task 2: Add platform time entry DTOs + failing service tests

**Files:**
- Create: `src/modules/platform/dto/platform-time-entries.dto.ts`
- Create: `src/modules/platform/services/platform-time-entries.service.spec.ts`

**Step 1: Write the failing test**

```ts
it('updates time entry and recomputes duration for STOPPED entries', async () => {
  repo.findOne.mockResolvedValue({
    id: 'entry-1',
    tenantId: 'tenant-1',
    status: 'STOPPED',
    startTime: new Date('2026-01-01T10:00:00Z'),
    endTime: new Date('2026-01-01T11:00:00Z'),
    durationMinutes: 60,
  });

  const result = await service.update('tenant-1', 'entry-1', {
    endTime: '2026-01-01T12:00:00Z',
  }, 'platform-user-1', '127.0.0.1', 'test-agent');

  expect(result.durationMinutes).toBe(120);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- platform-time-entries.service.spec.ts`
Expected: FAIL (service not implemented).

**Step 3: Write minimal DTOs**

```ts
export class PlatformTimeEntryQueryDto {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() taskId?: string;
  @IsOptional() @IsEnum(TimeEntryStatus) status?: TimeEntryStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) limit?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
}

export class PlatformTimeEntryUpdateDto {
  @IsUUID() tenantId: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() billable?: boolean;
  @IsOptional() @IsDateString() startTime?: string;
  @IsOptional() @IsDateString() endTime?: string;
}
```

**Step 4: Run test to verify it still fails**

Run: `npm test -- platform-time-entries.service.spec.ts`
Expected: FAIL (service missing).

**Step 5: Commit**

```bash
git add src/modules/platform/dto/platform-time-entries.dto.ts src/modules/platform/services/platform-time-entries.service.spec.ts
git commit -m "test(platform): add time entry dto and service spec"
```

### Task 3: Implement PlatformTimeEntriesService + audit action

**Files:**
- Create: `src/modules/platform/services/platform-time-entries.service.ts`
- Modify: `src/modules/platform/enums/platform-action.enum.ts`
- Modify: `src/modules/platform/platform.module.ts`

**Step 1: Write minimal implementation**

```ts
@Injectable()
export class PlatformTimeEntriesService {
  constructor(
    @InjectRepository(TimeEntry) private readonly timeEntryRepository: Repository<TimeEntry>,
    @InjectRepository(Task) private readonly taskRepository: Repository<Task>,
    private readonly auditService: PlatformAuditService,
  ) {}

  async list(tenantId: string, query: PlatformTimeEntryQueryDto) {
    if (query.taskId) {
      const task = await this.taskRepository.findOne({ where: { id: query.taskId, tenantId } });
      if (!task) throw new NotFoundException('Task not found');
    }
    const qb = this.timeEntryRepository.createQueryBuilder('entry').where('entry.tenantId = :tenantId', { tenantId });
    if (query.userId) qb.andWhere('entry.userId = :userId', { userId: query.userId });
    if (query.taskId) qb.andWhere('entry.taskId = :taskId', { taskId: query.taskId });
    if (query.status) qb.andWhere('entry.status = :status', { status: query.status });
    if (query.from) qb.andWhere('entry.startTime >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('entry.endTime <= :to', { to: new Date(query.to) });
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    qb.orderBy('entry.startTime', 'DESC').skip(offset).take(limit);
    return qb.getMany();
  }

  async findOne(tenantId: string, id: string) {
    const entry = await this.timeEntryRepository.findOne({ where: { id, tenantId }, relations: ['user', 'task'] });
    if (!entry) throw new NotFoundException('Time entry not found');
    return entry;
  }

async update(
  tenantId: string,
  id: string,
  dto: PlatformTimeEntryUpdateDto,
  platformUserId: string,
  ipAddress: string,
  userAgent?: string,
) {
    const entry = await this.timeEntryRepository.findOne({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException('Time entry not found');

    if (dto.notes !== undefined) entry.notes = dto.notes;
    if (dto.billable !== undefined) entry.billable = dto.billable;
    if (dto.startTime) entry.startTime = new Date(dto.startTime);
    if (dto.endTime) entry.endTime = new Date(dto.endTime);

    if ((dto.startTime || dto.endTime) && entry.status === TimeEntryStatus.STOPPED && entry.endTime) {
      entry.durationMinutes = Math.round((entry.endTime.getTime() - entry.startTime.getTime()) / 60000);
    }

    const saved = await this.timeEntryRepository.save(entry);

    await this.auditService.log({
      platformUserId,
      action: PlatformAction.TIME_ENTRY_UPDATED,
      targetTenantId: tenantId,
      targetEntityType: 'time_entry',
      targetEntityId: id,
      ipAddress,
      userAgent,
    });

    return saved;
  }
}
```

```ts
// src/modules/platform/enums/platform-action.enum.ts
TIME_ENTRY_UPDATED = 'TIME_ENTRY_UPDATED',
```

```ts
// src/modules/platform/platform.module.ts
TypeOrmModule.forFeature([
  PlatformUser,
  PlatformSession,
  PlatformAuditLog,
  ImpersonationSession,
  TenantLifecycleEvent,
  Tenant,
  TimeEntry,
  Task,
])
```

**Step 2: Run test to verify it passes**

Run: `npm test -- platform-time-entries.service.spec.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/modules/platform/services/platform-time-entries.service.ts src/modules/platform/enums/platform-action.enum.ts src/modules/platform/platform.module.ts
git commit -m "feat(platform): add platform time entry service"
```

### Task 4: Add platform controller tests

**Files:**
- Create: `src/modules/platform/controllers/platform-time-entries.controller.spec.ts`

**Step 1: Write the failing test**

```ts
it('delegates list to service', async () => {
  service.list.mockResolvedValue([]);
  await controller.list('tenant-1', {} as PlatformTimeEntryQueryDto);
  expect(service.list).toHaveBeenCalledWith('tenant-1', {});
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- platform-time-entries.controller.spec.ts`
Expected: FAIL (controller missing).

**Step 3: Commit**

```bash
git add src/modules/platform/controllers/platform-time-entries.controller.spec.ts
git commit -m "test(platform): add platform time entry controller spec"
```

### Task 5: Implement PlatformTimeEntriesController + wire module + audit logging

**Files:**
- Create: `src/modules/platform/controllers/platform-time-entries.controller.ts`
- Modify: `src/modules/platform/platform.module.ts`
- Modify: `src/modules/platform/services/platform-time-entries.service.ts`

**Step 1: Write minimal implementation**

```ts
@ApiTags('Platform - Time Entries')
@ApiBearerAuth('platform-auth')
@SkipTenant()
@Controller('platform/time-entries')
@UseGuards(PlatformJwtAuthGuard, PlatformContextGuard, PlatformPermissionsGuard)
@RequireContext(ContextType.PLATFORM)
export class PlatformTimeEntriesController {
  constructor(private readonly service: PlatformTimeEntriesService) {}

  @Get('tenant/:tenantId')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_TIME_ENTRIES)
  list(@Param('tenantId') tenantId: string, @Query() query: PlatformTimeEntryQueryDto) {
    return this.service.list(tenantId, query);
  }

  @Get(':id')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_TIME_ENTRIES)
  findOne(@Param('id', ParseUUIDPipe) id: string, @Query('tenantId') tenantId: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  @RequirePlatformPermissions(PlatformPermission.SUPPORT_TIME_ENTRIES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlatformTimeEntryUpdateDto,
    @Req() req: { user: { userId: string }; ip: string; headers: { 'user-agent'?: string } },
  ) {
    return this.service.update(dto.tenantId, id, dto, req.user.userId, req.ip, req.headers['user-agent']);
  }
}
```

```ts
// src/modules/platform/services/platform-time-entries.service.ts (inside update)
await this.auditService.log({
  platformUserId,
  action: PlatformAction.TIME_ENTRY_UPDATED,
  targetTenantId: tenantId,
  targetEntityType: 'time_entry',
  targetEntityId: id,
  ipAddress,
  userAgent,
  changesBefore,
  changesAfter,
});
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- platform-time-entries.controller.spec.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/modules/platform/controllers/platform-time-entries.controller.ts src/modules/platform/platform.module.ts src/modules/platform/services/platform-time-entries.service.ts
git commit -m "feat(platform): add platform time entry controller"
```
