/* jshint esversion: 11 */
/* globals __ENV */
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const transactionCreationRate = new Rate('transaction_creation_success_rate');
const revenueCalculationDuration = new Trend('revenue_calculation_duration');

// Test configuration
export const options = {
    stages: [
        { duration: '30s', target: 25 },   // Ramp up to 25 users
        { duration: '2m', target: 60 },    // Ramp up to 60 users
        { duration: '2m', target: 120 },   // Ramp up to 120 users
        { duration: '1m', target: 60 },    // Ramp down
        { duration: '30s', target: 0 },    // Ramp down to 0
    ],
    thresholds: {
        // SLOs: p95 < 250ms, error rate < 0.5%, transaction accuracy 100%
        http_req_duration: ['p(95)<250', 'p(99)<700'],
        http_req_failed: ['rate<0.005'],
        transaction_creation_success_rate: ['rate>0.999'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const TEST_USER = {
    email: 'admin@tenant1.com',
    password: 'Admin123!@#',
};

let accessToken = '';
let bookingId = '';
let clientId = '';
let packageId = '';

export function setup() {
    // Authenticate
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify(TEST_USER),
        { headers: { 'Content-Type': 'application/json' } },
    );

    if (loginRes.status !== 200) {
        throw new Error('Authentication failed');
    }

    const tokens = JSON.parse(loginRes.body);
    accessToken = tokens.accessToken;

    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
    };

    // Create test client
    const clientRes = http.post(
        `${BASE_URL}/bookings/clients`,
        JSON.stringify({
            name: 'Finance Test Client',
            email: 'finance@example.com',
            phone: '+1234567890',
        }),
        authHeaders,
    );

    if (clientRes.status === 201) {
        clientId = JSON.parse(clientRes.body).id;
    }

    // Create test package
    const packageRes = http.post(
        `${BASE_URL}/catalog/packages`,
        JSON.stringify({
            name: 'Finance Test Package',
            description: 'Package for finance testing',
            price: 5000,
        }),
        authHeaders,
    );

    if (packageRes.status === 201) {
        packageId = JSON.parse(packageRes.body).id;
    }

    // Create test booking
    const bookingRes = http.post(
        `${BASE_URL}/bookings`,
        JSON.stringify({
            clientId: clientId,
            packageId: packageId,
            eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            notes: 'Finance test booking',
        }),
        authHeaders,
    );

    if (bookingRes.status === 201) {
        const booking = JSON.parse(bookingRes.body);
        bookingId = booking.id;

        // Confirm the booking
        http.patch(
            `${BASE_URL}/bookings/${bookingId}`,
            JSON.stringify({ status: 'CONFIRMED' }),
            authHeaders,
        );
    }

    return { accessToken, bookingId, clientId, packageId };
}

export default function (data) {
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.accessToken}`,
        },
        tags: { name: 'FinanceFlow' },
    };

    // Test 1: Create payment transaction
    const paymentAmount = Math.floor(Math.random() * 2000) + 500; // Random amount 500-2500

    const transactionPayload = JSON.stringify({
        bookingId: data.bookingId,
        amount: paymentAmount,
        description: `Load test payment ${__VU}-${__ITER}`,
        type: 'PAYMENT',
    });

    const createTransactionRes = http.post(
        `${BASE_URL}/finance/transactions`,
        transactionPayload,
        authHeaders,
    );

    const transactionCreated = check(createTransactionRes, {
        'transaction created status is 201': (r) => r.status === 201,
        'transaction has id': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.id !== undefined;
            } catch (e) {
                return false;
            }
        },
        'transaction amount is correct': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.amount === paymentAmount;
            } catch (e) {
                return false;
            }
        },
    });

    transactionCreationRate.add(transactionCreated);

    sleep(0.5);

    // Test 2: Get booking transactions
    const getTransactionsRes = http.get(
        `${BASE_URL}/finance/transactions?bookingId=${data.bookingId}`,
        authHeaders,
    );

    check(getTransactionsRes, {
        'get transactions status is 200': (r) => r.status === 200,
        'transactions is array': (r) => {
            try {
                const body = JSON.parse(r.body);
                return Array.isArray(body);
            } catch (e) {
                return false;
            }
        },
    });

    sleep(0.5);

    // Test 3: Calculate revenue (performance-sensitive operation)
    const revenueStart = Date.now();

    const revenueRes = http.get(
        `${BASE_URL}/finance/revenue?startDate=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}&endDate=${new Date().toISOString()}`,
        authHeaders,
    );

    const revenueEnd = Date.now();
    revenueCalculationDuration.add(revenueEnd - revenueStart);

    check(revenueRes, {
        'revenue calculation status is 200': (r) => r.status === 200,
        'revenue has total': (r) => {
            try {
                const body = JSON.parse(r.body);
                return typeof body.total === 'number';
            } catch (e) {
                return false;
            }
        },
    });

    sleep(0.5);

    // Test 4: Get booking balance
    const balanceRes = http.get(
        `${BASE_URL}/finance/bookings/${data.bookingId}/balance`,
        authHeaders,
    );

    check(balanceRes, {
        'balance status is 200': (r) => r.status === 200,
        'balance has totalPaid': (r) => {
            try {
                const body = JSON.parse(r.body);
                return typeof body.totalPaid === 'number';
            } catch (e) {
                return false;
            }
        },
        'balance has outstanding': (r) => {
            try {
                const body = JSON.parse(r.body);
                return typeof body.outstanding === 'number';
            } catch (e) {
                return false;
            }
        },
    });

    sleep(0.5);

    // Test 5: List all transactions (pagination test)
    const listTransactionsRes = http.get(
        `${BASE_URL}/finance/transactions?page=1&limit=20`,
        authHeaders,
    );

    check(listTransactionsRes, {
        'list transactions status is 200': (r) => r.status === 200,
        'list returns array': (r) => {
            try {
                const body = JSON.parse(r.body);
                return Array.isArray(body);
            } catch (e) {
                return false;
            }
        },
    });

    sleep(1);
}

export function teardown(data) {
    // Optional: Clean up test data
    console.log('Finance flow load test completed');
}

export function handleSummary(data) {
    return {
        'scripts/load-testing/reports/finance-flow-summary.html': htmlReport(data),
        stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
}

function textSummary(data, options) {
    const indent = options?.indent || '';

    let summary = `\n${indent}Finance Flow Load Test Summary\n`;
    summary += `${indent}${'='.repeat(50)}\n\n`;

    summary += `${indent}Performance:\n`;
    const reqDuration = data.metrics.http_req_duration.values;
    summary += `${indent}  avg: ${reqDuration.avg.toFixed(2)}ms\n`;
    summary += `${indent}  p95: ${reqDuration['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  p99: ${reqDuration['p(99)'].toFixed(2)}ms\n`;

    if (data.metrics.revenue_calculation_duration) {
        const revDuration = data.metrics.revenue_calculation_duration.values;
        summary += `\n${indent}Revenue Calculation:\n`;
        summary += `${indent}  avg: ${revDuration.avg.toFixed(2)}ms\n`;
        summary += `${indent}  p95: ${revDuration['p(95)'].toFixed(2)}ms\n`;
    }

    return summary;
}

function htmlReport(data) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>K6 Finance Flow Load Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #FF9800; padding-bottom: 10px; }
        h2 { color: #666; margin-top: 30px; }
        .metric { margin: 15px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #FF9800; }
        .metric-value { color: #FF9800; font-size: 24px; font-weight: bold; }
        .pass { color: #4CAF50; }
        .fail { color: #f44336; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #FF9800; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>💰 Finance Flow Load Test Report</h1>
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
                <td>&lt; 250ms</td>
                <td class="${data.metrics.http_req_duration.values['p(95)'] < 250 ? 'pass' : 'fail'}">
                    ${data.metrics.http_req_duration.values['p(95)'] < 250 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
            <tr>
                <td>Transaction Accuracy</td>
                <td>${data.metrics.transaction_creation_success_rate ? (data.metrics.transaction_creation_success_rate.values.rate * 100).toFixed(3) : 'N/A'}%</td>
                <td>99.9%</td>
                <td class="${data.metrics.transaction_creation_success_rate && data.metrics.transaction_creation_success_rate.values.rate > 0.999 ? 'pass' : 'fail'}">
                    ${data.metrics.transaction_creation_success_rate && data.metrics.transaction_creation_success_rate.values.rate > 0.999 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
        </table>
        
        <h2>Critical Operations</h2>
        ${data.metrics.revenue_calculation_duration ? `
          <div class="metric">
              <div>Revenue Calculation Duration (avg)</div>
              <div class="metric-value">${data.metrics.revenue_calculation_duration.values.avg.toFixed(2)}ms</div>
          </div>
        ` : ''}
    </div>
</body>
</html>`;
}
