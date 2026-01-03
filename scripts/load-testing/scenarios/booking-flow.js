import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const bookingCreationRate = new Rate('booking_creation_success_rate');
const taskAssignmentRate = new Rate('task_assignment_success_rate');
const bookingUpdateDuration = new Trend('booking_update_duration');

// Test configuration
export const options = {
    stages: [
        { duration: '30s', target: 30 },   // Ramp up to 30 users
        { duration: '2m', target: 80 },    // Ramp up to 80 users
        { duration: '2m', target: 150 },   // Ramp up to 150 users
        { duration: '1m', target: 80 },    // Ramp down
        { duration: '30s', target: 0 },    // Ramp down to 0
    ],
    thresholds: {
        // SLOs: p95 < 300ms, p99 < 800ms, error rate < 1%
        http_req_duration: ['p(95)<300', 'p(99)<800'],
        http_req_failed: ['rate<0.01'],
        booking_creation_success_rate: ['rate>0.99'],
        task_assignment_success_rate: ['rate>0.98'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test user credentials
const TEST_USER = {
    email: 'admin@tenant1.com',
    password: 'Admin123!@#',
};

let accessToken = '';
let clientId = '';
let packageId = '';

export function setup() {
    // Authenticate once for setup
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify(TEST_USER),
        { headers: { 'Content-Type': 'application/json' } },
    );

    if (loginRes.status !== 200) {
        throw new Error('Authentication failed in setup');
    }

    const tokens = JSON.parse(loginRes.body);
    accessToken = tokens.accessToken;

    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
    };

    // Create a test client
    const clientRes = http.post(
        `${BASE_URL}/bookings/clients`,
        JSON.stringify({
            name: 'Load Test Client',
            email: 'loadtest@example.com',
            phone: '+1234567890',
        }),
        authHeaders,
    );

    if (clientRes.status === 201) {
        clientId = JSON.parse(clientRes.body).id;
    }

    // Create a test package
    const packageRes = http.post(
        `${BASE_URL}/catalog/packages`,
        JSON.stringify({
            name: 'Load Test Package',
            description: 'Package for load testing',
            price: 1000,
        }),
        authHeaders,
    );

    if (packageRes.status === 201) {
        packageId = JSON.parse(packageRes.body).id;
    }

    return { accessToken, clientId, packageId };
}

export default function (data) {
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.accessToken}`,
        },
        tags: { name: 'BookingFlow' },
    };

    // Test 1: Create booking
    const bookingPayload = JSON.stringify({
        clientId: data.clientId,
        packageId: data.packageId,
        eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        notes: `Load test booking ${__VU}-${__ITER}`,
    });

    const createBookingRes = http.post(
        `${BASE_URL}/bookings`,
        bookingPayload,
        authHeaders,
    );

    const bookingCreated = check(createBookingRes, {
        'booking created status is 201': (r) => r.status === 201,
        'booking has id': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.id !== undefined;
            } catch (e) {
                return false;
            }
        },
        'booking has DRAFT status': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.status === 'DRAFT';
            } catch (e) {
                return false;
            }
        },
    });

    bookingCreationRate.add(bookingCreated);

    if (!bookingCreated || createBookingRes.status !== 201) {
        sleep(1);
        return;
    }

    const booking = JSON.parse(createBookingRes.body);
    const bookingId = booking.id;

    sleep(0.5);

    // Test 2: Update booking to CONFIRMED
    const updateStart = Date.now();
    const updatePayload = JSON.stringify({
        status: 'CONFIRMED',
    });

    const updateRes = http.patch(
        `${BASE_URL}/bookings/${bookingId}`,
        updatePayload,
        authHeaders,
    );

    const updateEnd = Date.now();
    bookingUpdateDuration.add(updateEnd - updateStart);

    check(updateRes, {
        'booking updated to CONFIRMED': (r) => {
            if (r.status !== 200) return false;
            try {
                const body = JSON.parse(r.body);
                return body.status === 'CONFIRMED';
            } catch (e) {
                return false;
            }
        },
    });

    sleep(0.5);

    // Test 3: Get booking details
    const getBookingRes = http.get(
        `${BASE_URL}/bookings/${bookingId}`,
        authHeaders,
    );

    check(getBookingRes, {
        'get booking status is 200': (r) => r.status === 200,
        'booking has tasks': (r) => {
            try {
                const body = JSON.parse(r.body);
                return Array.isArray(body.tasks);
            } catch (e) {
                return false;
            }
        },
    });

    sleep(0.5);

    // Test 4: List all bookings (pagination test)
    const listRes = http.get(
        `${BASE_URL}/bookings?page=1&limit=10`,
        authHeaders,
    );

    check(listRes, {
        'list bookings status is 200': (r) => r.status === 200,
        'list returns array': (r) => {
            try {
                const body = JSON.parse(r.body);
                return Array.isArray(body);
            } catch (e) {
                return false;
            }
        },
    });

    sleep(0.5);

    // Test 5: Assign tasks (if any exist)
    const bookingDetails = JSON.parse(getBookingRes.body);
    if (bookingDetails.tasks && bookingDetails.tasks.length > 0) {
        const taskId = bookingDetails.tasks[0].id;

        // Get current user to assign task
        const meRes = http.get(`${BASE_URL}/users/me`, authHeaders);
        if (meRes.status === 200) {
            const currentUser = JSON.parse(meRes.body);

            const assignPayload = JSON.stringify({
                assignedUserId: currentUser.id,
            });

            const assignRes = http.patch(
                `${BASE_URL}/tasks/${taskId}/assign`,
                assignPayload,
                authHeaders,
            );

            const taskAssigned = check(assignRes, {
                'task assigned status is 200': (r) => r.status === 200,
                'task has assignedUserId': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.assignedUserId === currentUser.id;
                    } catch (e) {
                        return false;
                    }
                },
            });

            taskAssignmentRate.add(taskAssigned);
        }
    }

    sleep(1);

    // Test 6: Cancel booking (cleanup)
    const cancelRes = http.post(
        `${BASE_URL}/bookings/${bookingId}/cancel`,
        null,
        authHeaders,
    );

    check(cancelRes, {
        'booking cancelled status is 200': (r) => r.status === 200,
    });

    sleep(2);
}

export function handleSummary(data) {
    return {
        'scripts/load-testing/reports/booking-flow-summary.html': htmlReport(data),
        stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
}

function textSummary(data, options) {
    const indent = options?.indent || '';

    let summary = `\n${indent}Booking Flow Load Test Summary\n`;
    summary += `${indent}${'='.repeat(50)}\n\n`;

    summary += `${indent}Performance:\n`;
    const reqDuration = data.metrics.http_req_duration.values;
    summary += `${indent}  avg: ${reqDuration.avg.toFixed(2)}ms\n`;
    summary += `${indent}  p95: ${reqDuration['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  p99: ${reqDuration['p(99)'].toFixed(2)}ms\n`;

    summary += `\n${indent}Success Rates:\n`;
    if (data.metrics.booking_creation_success_rate) {
        summary += `${indent}  Booking Creation: ${(data.metrics.booking_creation_success_rate.values.rate * 100).toFixed(2)}%\n`;
    }
    if (data.metrics.task_assignment_success_rate) {
        summary += `${indent}  Task Assignment: ${(data.metrics.task_assignment_success_rate.values.rate * 100).toFixed(2)}%\n`;
    }

    return summary;
}

function htmlReport(data) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>K6 Booking Flow Load Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #2196F3; padding-bottom: 10px; }
        h2 { color: #666; margin-top: 30px; }
        .metric { margin: 15px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #2196F3; }
        .metric-value { color: #2196F3; font-size: 24px; font-weight: bold; }
        .pass { color: #4CAF50; }
        .fail { color: #f44336; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #2196F3; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📅 Booking Flow Load Test Report</h1>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        
        <h2>Performance Metrics</h2>
        <table>
            <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>SLO</th>
                <th>Status</th>
            </tr>
            <tr>
                <td>p95 Response Time</td>
                <td>${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms</td>
                <td>&lt; 300ms</td>
                <td class="${data.metrics.http_req_duration.values['p(95)'] < 300 ? 'pass' : 'fail'}">
                    ${data.metrics.http_req_duration.values['p(95)'] < 300 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
            <tr>
                <td>p99 Response Time</td>
                <td>${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms</td>
                <td>&lt; 800ms</td>
                <td class="${data.metrics.http_req_duration.values['p(99)'] < 800 ? 'pass' : 'fail'}">
                    ${data.metrics.http_req_duration.values['p(99)'] < 800 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
        </table>
        
        <h2>Success Rates</h2>
        ${Object.entries(data.metrics)
            .filter(([name]) => name.includes('success_rate'))
            .map(([name, metric]) => `
            <div class="metric">
                <div>${name.replace(/_/g, ' ').toUpperCase()}</div>
                <div class="metric-value">${(metric.values.rate * 100).toFixed(2)}%</div>
            </div>
          `).join('')}
    </div>
</body>
</html>`;
}
