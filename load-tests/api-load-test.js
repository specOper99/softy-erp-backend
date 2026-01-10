import { check, group, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics per endpoint
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const healthDuration = new Trend('health_check_duration');
const catalogDuration = new Trend('catalog_duration');
const bookingsDuration = new Trend('bookings_duration');
const financeDuration = new Trend('finance_duration');
const tasksDuration = new Trend('tasks_duration');
const hrDuration = new Trend('hr_duration');
const mediaDuration = new Trend('media_duration');
const auditDuration = new Trend('audit_duration');
const metricsDuration = new Trend('metrics_duration');

// Test configuration - Heavy load test
export const options = {
    stages: [
        { duration: '30s', target: 10 },   // Warm up
        { duration: '1m', target: 25 },    // Moderate load
        { duration: '1m', target: 50 },    // High load
        { duration: '2m', target: 100 },   // Peak load
        { duration: '1m', target: 50 },    // Ramp down
        { duration: '30s', target: 0 },    // Cool down
    ],
    thresholds: {
        http_req_duration: ['p(95)<1000'],   // 95% < 1s
        http_req_duration: ['p(99)<2000'],   // 99% < 2s
        errors: ['rate<0.05'],               // Error rate < 5%
        login_duration: ['p(95)<1500'],      // Login < 1.5s
        catalog_duration: ['p(95)<500'],     // Catalog < 500ms
        bookings_duration: ['p(95)<800'],    // Bookings < 800ms
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const TENANT_ID = __ENV.TENANT_ID || 'test-tenant-id';

// Test user with complex password meeting requirements
const TEST_USER = {
    email: `loadtest_${__VU}_${Date.now()}@test.com`,
    password: 'LoadTest123!@',  // Meets complexity requirements
    companyName: `LoadTest Corp ${__VU}`,
};

let authToken = null;

export function setup() {
    console.log(`Starting load test against ${BASE_URL}`);

    // Register a test user
    const registerRes = http.post(
        `${BASE_URL}/auth/register`,
        JSON.stringify(TEST_USER),
        { headers: { 'Content-Type': 'application/json' } }
    );

    if (registerRes.status === 201) {
        const data = registerRes.json('data');
        return {
            token: data.accessToken,
            tenantId: data.user?.tenantId || TENANT_ID,
            user: TEST_USER
        };
    }

    // If registration fails, try login with seeded admin
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({
            email: 'admin@test.local',
            password: __ENV.SEED_ADMIN_PASSWORD || 'AdminPassword123!',
        }),
        {
            headers: {
                'Content-Type': 'application/json',
            }
        }
    );

    if (loginRes.status === 200) {
        return {
            token: loginRes.json('data.accessToken'),
            tenantId: TENANT_ID,
            user: { email: 'admin@test.local' }
        };
    }

    console.error('Setup failed - could not authenticate');
    return { token: null, tenantId: TENANT_ID, user: TEST_USER };
}

export default function (data) {
    // Tenant context is derived from JWT token - no X-Tenant-ID header needed
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': data.token ? `Bearer ${data.token}` : '',
    };

    // ============ Health Check ============
    group('Health Check', () => {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/health`);
        healthDuration.add(Date.now() - start);

        const passed = check(res, {
            'health status 200': (r) => r.status === 200,
            'health returns ok': (r) => r.json('data.status') === 'ok',
        });
        errorRate.add(!passed);
    });

    sleep(0.5);

    if (!data.token) {
        sleep(2);
        return;
    }

    // ============ Catalog - Service Packages ============
    group('Catalog - Service Packages', () => {
        const start = Date.now();

        // List packages
        const listRes = http.get(`${BASE_URL}/packages`, { headers });
        check(listRes, {
            'list packages 200': (r) => r.status === 200,
            'packages is array': (r) => Array.isArray(r.json('data')),
        });

        // Get single package (if any exist)
        if (listRes.status === 200) {
            const packages = listRes.json('data');
            if (packages && packages.length > 0) {
                const pkgRes = http.get(`${BASE_URL}/packages/${packages[0].id}`, { headers });
                check(pkgRes, {
                    'get package 200': (r) => r.status === 200,
                });
            }
        }

        catalogDuration.add(Date.now() - start);
    });

    sleep(0.5);

    // ============ Catalog - Task Types ============
    group('Catalog - Task Types', () => {
        const res = http.get(`${BASE_URL}/task-types`, { headers });
        const passed = check(res, {
            'list task types 200': (r) => r.status === 200,
        });
        errorRate.add(!passed);
    });

    sleep(0.5);

    // ============ Bookings ============
    group('Bookings', () => {
        const start = Date.now();

        const res = http.get(`${BASE_URL}/bookings`, { headers });
        const passed = check(res, {
            'list bookings 200': (r) => r.status === 200,
            'bookings is array': (r) => Array.isArray(r.json('data')),
        });
        errorRate.add(!passed);

        bookingsDuration.add(Date.now() - start);
    });

    sleep(0.5);

    // ============ Finance - Transactions ============
    group('Finance - Transactions', () => {
        const start = Date.now();

        const res = http.get(`${BASE_URL}/transactions`, { headers });
        check(res, {
            'list transactions 200': (r) => r.status === 200,
        });

        financeDuration.add(Date.now() - start);
    });

    sleep(0.5);

    // ============ Finance - Wallets ============
    group('Finance - Wallets', () => {
        const res = http.get(`${BASE_URL}/wallets`, { headers });
        check(res, {
            'list wallets 200': (r) => r.status === 200,
        });
    });

    sleep(0.5);

    // ============ Tasks ============
    group('Tasks', () => {
        const start = Date.now();

        const res = http.get(`${BASE_URL}/tasks`, { headers });
        check(res, {
            'list tasks 200': (r) => r.status === 200,
        });

        const myTasksRes = http.get(`${BASE_URL}/tasks/my-tasks`, { headers });
        check(myTasksRes, {
            'my tasks 200': (r) => r.status === 200,
        });

        tasksDuration.add(Date.now() - start);
    });

    sleep(0.5);

    // ============ HR - Profiles ============
    group('HR - Profiles', () => {
        const start = Date.now();

        const res = http.get(`${BASE_URL}/hr/profiles`, { headers });
        check(res, {
            'list profiles 200': (r) => r.status === 200,
        });

        hrDuration.add(Date.now() - start);
    });

    sleep(0.5);

    // ============ Media - Attachments ============
    group('Media - Attachments', () => {
        const start = Date.now();

        const res = http.get(`${BASE_URL}/media`, { headers });
        check(res, {
            'list attachments 200': (r) => r.status === 200,
        });

        mediaDuration.add(Date.now() - start);
    });

    sleep(0.5);

    // ============ Dashboard (Reporting) ============
    group('Dashboard', () => {
        const start = Date.now();

        // KPIs
        const kpisRes = http.get(`${BASE_URL}/dashboard/kpis`, { headers });
        check(kpisRes, {
            'dashboard kpis 200': (r) => r.status === 200,
            'has totalRevenue': (r) => r.json('data.totalRevenue') !== undefined,
        });

        // Revenue Stats
        const revenueRes = http.get(`${BASE_URL}/dashboard/revenue`, { headers });
        check(revenueRes, {
            'dashboard revenue 200': (r) => r.status === 200,
        });

        // Booking Trends
        const trendsRes = http.get(`${BASE_URL}/dashboard/booking-trends`, { headers });
        check(trendsRes, {
            'booking trends 200': (r) => r.status === 200,
        });

        // Staff Performance
        const staffRes = http.get(`${BASE_URL}/dashboard/staff-performance`, { headers });
        check(staffRes, {
            'staff performance 200': (r) => r.status === 200,
        });

        const duration = Date.now() - start;
        console.log(`Dashboard endpoints took ${duration}ms`);
    });

    sleep(1);

    // ============ Audit Logs ============
    group('Audit Logs', () => {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/audit`, { headers });
        check(res, {
            'list audit logs 200': (r) => r.status === 200,
        });
        auditDuration.add(Date.now() - start);
    });

    sleep(0.5);

    // ============ Metrics ============
    group('Metrics', () => {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/metrics`, { headers });
        check(res, {
            'get metrics 200': (r) => r.status === 200,
        });
        metricsDuration.add(Date.now() - start);
    });

    sleep(1);

    // ============ Auth - Current User ============
    group('Auth - Profile', () => {
        const res = http.get(`${BASE_URL}/auth/me`, { headers });
        check(res, {
            'auth me 200': (r) => r.status === 200,
            'returns email': (r) => r.json('data.email') !== undefined,
        });
    });

    sleep(2);
}

export function teardown(data) {
    console.log('=== Load Test Complete ===');
    console.log(`Tested against: ${BASE_URL}`);
    console.log(`User: ${data.user?.email}`);
    console.log('See results above for detailed metrics');
}

// Smoke test scenario (quick validation)
export function smoke() {
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'smoke test passed': (r) => r.status === 200 });
}
