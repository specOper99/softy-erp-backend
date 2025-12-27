import { check, group, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const healthDuration = new Trend('health_check_duration');

// Test configuration
export const options = {
    stages: [
        { duration: '30s', target: 10 },  // Ramp up to 10 users
        { duration: '1m', target: 10 },   // Stay at 10 users
        { duration: '30s', target: 50 },  // Ramp up to 50 users
        { duration: '1m', target: 50 },   // Stay at 50 users
        { duration: '30s', target: 0 },   // Ramp down to 0
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],   // 95% of requests should be < 500ms
        errors: ['rate<0.1'],               // Error rate should be < 10%
        login_duration: ['p(95)<1000'],     // Login should be < 1s at p95
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';

// Test user credentials
const TEST_USER = {
    email: `loadtest_${__VU}@test.com`,
    password: 'password123',
};

export function setup() {
    // Register test user
    const registerRes = http.post(
        `${BASE_URL}/auth/register`,
        JSON.stringify(TEST_USER),
        { headers: { 'Content-Type': 'application/json' } }
    );

    if (registerRes.status !== 201 && registerRes.status !== 400) {
        console.error('Setup failed:', registerRes.body);
    }

    return { user: TEST_USER };
}

export default function (data) {
    let token = null;

    group('Health Check', () => {
        const start = Date.now();
        const res = http.get(`${BASE_URL}/health`);
        healthDuration.add(Date.now() - start);

        const passed = check(res, {
            'health check status is 200': (r) => r.status === 200,
            'health check returns ok': (r) => r.json('data.status') === 'ok',
        });
        errorRate.add(!passed);
    });

    sleep(1);

    group('Authentication', () => {
        // Login
        const start = Date.now();
        const loginRes = http.post(
            `${BASE_URL}/auth/login`,
            JSON.stringify(data.user),
            { headers: { 'Content-Type': 'application/json' } }
        );
        loginDuration.add(Date.now() - start);

        const loginPassed = check(loginRes, {
            'login status is 200': (r) => r.status === 200,
            'login returns token': (r) => r.json('data.accessToken') !== undefined,
        });
        errorRate.add(!loginPassed);

        if (loginPassed) {
            token = loginRes.json('data.accessToken');
        }
    });

    sleep(1);

    if (token) {
        group('Protected Endpoints', () => {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            };

            // Get current user
            const meRes = http.get(`${BASE_URL}/auth/me`, { headers });
            const mePassed = check(meRes, {
                'get me status is 200': (r) => r.status === 200,
                'get me returns user': (r) => r.json('data.email') !== undefined,
            });
            errorRate.add(!mePassed);

            sleep(0.5);

            // List bookings
            const bookingsRes = http.get(`${BASE_URL}/bookings`, { headers });
            check(bookingsRes, {
                'list bookings returns array': (r) => Array.isArray(r.json('data')),
            });
        });
    }

    sleep(2);
}

export function teardown(data) {
    console.log('Load test completed');
}
