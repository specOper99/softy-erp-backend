/* globals __ENV */
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');

// Stress test configuration
export const options = {
    stages: [
        // Ramp-up phase
        { duration: '2m', target: 50 },    // Warm up to 50 users
        { duration: '3m', target: 100 },   // Gradual increase to 100
        { duration: '3m', target: 200 },   // Increase to 200
        { duration: '3m', target: 300 },   // Increase to 300
        { duration: '3m', target: 400 },   // Increase to 400
        { duration: '2m', target: 500 },   // Push to 500 (breaking point test)

        // Sustained load at peak
        { duration: '10m', target: 500 },  // Sustain peak load

        // Ramp-down phase
        { duration: '3m', target: 300 },   // Gradual decrease
        { duration: '2m', target: 100 },   // Continue decrease
        { duration: '1m', target: 0 },     // Return to 0
    ],
    thresholds: {
        // More relaxed during stress test to identify breaking points
        http_req_duration: ['p(95)<1000', 'p(99)<3000'],
        http_req_failed: ['rate<0.05'], // Allow up to 5% errors to find limits
        errors: ['rate<0.05'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const TEST_USERS = [
    { email: 'admin@tenant1.com', password: 'Admin123!@#' },
    { email: 'user1@tenant1.com', password: 'User123!@#' },
    { email: 'user2@tenant1.com', password: 'User456!@#' },
];

export function setup() {
    console.log('🔥 Starting Stress Test - Finding System Breaking Points');
    console.log('Target: 500 concurrent users');
    console.log('Duration: ~30 minutes');

    return {
        startTime: Date.now(),
    };
}

export default function (data) {
    const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];

    // Scenario 1: Authentication stress (20% of traffic)
    if (Math.random() < 0.2) {
        authStressScenario(user);
    }
    // Scenario 2: Booking operations (40% of traffic)
    else if (Math.random() < 0.6) {
        bookingStressScenario();
    }
    // Scenario 3: Finance operations (30% of traffic)
    else if (Math.random() < 0.9) {
        financeStressScenario();
    }
    // Scenario 4: Mixed complex operations (10% of traffic)
    else {
        mixedComplexScenario();
    }

    // Variable think time (1-3 seconds)
    sleep(Math.random() * 2 + 1);
}

function authStressScenario(user) {
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify(user),
        {
            headers: { 'Content-Type': 'application/json' },
            tags: { scenario: 'auth_stress' },
        },
    );

    const success = check(loginRes, {
        'auth: login successful': (r) => r.status === 200,
    });

    if (success) {
        successfulRequests.add(1);

        const tokens = JSON.parse(loginRes.body);

        // Immediate profile fetch
        http.get(`${BASE_URL}/users/me`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
            tags: { scenario: 'auth_stress' },
        });
    } else {
        failedRequests.add(1);
        errorRate.add(1);
    }
}

function bookingStressScenario() {
    // Simplified auth for speed
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify(TEST_USERS[0]),
        { headers: { 'Content-Type': 'application/json' } },
    );

    if (loginRes.status !== 200) {
        errorRate.add(1);
        failedRequests.add(1);
        return;
    }

    const tokens = JSON.parse(loginRes.body);
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
        },
        tags: { scenario: 'booking_stress' },
    };

    // High-frequency booking list requests
    const listRes = http.get(
        `${BASE_URL}/bookings?page=1&limit=20`,
        authHeaders,
    );

    check(listRes, {
        'booking: list successful': (r) => r.status === 200,
    }) ? successfulRequests.add(1) : (failedRequests.add(1), errorRate.add(1));
}

function financeStressScenario() {
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify(TEST_USERS[0]),
        { headers: { 'Content-Type': 'application/json' } },
    );

    if (loginRes.status !== 200) {
        errorRate.add(1);
        failedRequests.add(1);
        return;
    }

    const tokens = JSON.parse(loginRes.body);
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
        },
        tags: { scenario: 'finance_stress' },
    };

    // Heavy revenue calculation requests
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();

    const revenueRes = http.get(
        `${BASE_URL}/finance/revenue?startDate=${startDate}&endDate=${endDate}`,
        authHeaders,
    );

    check(revenueRes, {
        'finance: revenue calc successful': (r) => r.status === 200,
    }) ? successfulRequests.add(1) : (failedRequests.add(1), errorRate.add(1));
}

function mixedComplexScenario() {
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify(TEST_USERS[0]),
        { headers: { 'Content-Type': 'application/json' } },
    );

    if (loginRes.status !== 200) {
        errorRate.add(1);
        failedRequests.add(1);
        return;
    }

    const tokens = JSON.parse(loginRes.body);
    const authHeaders = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
        },
        tags: { scenario: 'complex_stress' },
    };

    // Multiple rapid-fire requests
    const batch = http.batch([
        ['GET', `${BASE_URL}/bookings`, null, authHeaders],
        ['GET', `${BASE_URL}/tasks`, null, authHeaders],
        ['GET', `${BASE_URL}/users/me`, null, authHeaders],
        ['GET', `${BASE_URL}/finance/transactions?page=1&limit=10`, null, authHeaders],
    ]);

    let passed = 0;
    batch.forEach((res) => {
        if (res.status === 200) {
            passed++;
        }
    });

    if (passed === batch.length) {
        successfulRequests.add(batch.length);
    } else {
        failedRequests.add(batch.length - passed);
        errorRate.add(1);
    }
}

export function teardown(data) {
    const duration = (Date.now() - data.startTime) / 1000 / 60;
    console.log(`\n🏁 Stress Test Complete`);
    console.log(`Total Duration: ${duration.toFixed(2)} minutes`);
    console.log(`Check reports for breaking points and degradation patterns`);
}

export function handleSummary(data) {
    return {
        'scripts/load-testing/reports/stress-test-summary.html': htmlReport(data),
        stdout: textSummary(data),
    };
}

function textSummary(data) {
    let summary = `\n${'='.repeat(60)}\n`;
    summary += `🔥 STRESS TEST RESULTS\n`;
    summary += `${'='.repeat(60)}\n\n`;

    summary += `Max Virtual Users: ${data.metrics.vus_max.values.max}\n`;
    summary += `Total Requests: ${data.metrics.http_reqs.values.count}\n`;
    summary += `Failed Requests: ${data.metrics.http_req_failed.values.passes}\n`;
    summary += `Error Rate: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n\n`;

    summary += `Response Time Percentiles:\n`;
    summary += `  avg: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
    summary += `  p50: ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}ms\n`;
    summary += `  p95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
    summary += `  p99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;
    summary += `  max: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms\n\n`;

    summary += `Throughput: ${(data.metrics.http_reqs.values.rate).toFixed(2)} req/s\n`;
    summary += `Data Received: ${(data.metrics.data_received.values.count / 1024 / 1024).toFixed(2)} MB\n`;

    summary += `\n${'='.repeat(60)}\n`;

    return summary;
}

function htmlReport(data) {
    const maxVUs = data.metrics.vus_max.values.max;
    const totalRequests = data.metrics.http_reqs.values.count;
    const errorRate = data.metrics.http_req_failed.values.rate;
    const p95 = data.metrics.http_req_duration.values['p(95)'];
    const p99 = data.metrics.http_req_duration.values['p(99)'];

    return `<!DOCTYPE html>
<html>
<head>
    <title>K6 Stress Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a1a; color: #fff; }
        .container { max-width: 1400px; margin: 0 auto; background: #2a2a2a; padding: 30px; border-radius: 8px; }
        h1 { color: #ff6b6b; border-bottom: 3px solid #ff6b6b; padding-bottom: 10px; }
        h2 { color: #ffa500; margin-top: 30px; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric-card { background: #3a3a3a; padding: 20px; border-radius: 8px; border-left: 4px solid #ff6b6b; }
        .metric-label { font-size: 12px; color: #999; text-transform: uppercase; }
        .metric-value { font-size: 32px; font-weight: bold; color: #ff6b6b; margin: 10px 0; }
        .metric-unit { font-size: 16px; color: #ccc; }
        .warning { color: #ffa500; }
        .critical { color: #ff6b6b; }
        .success { color: #4CAF50; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #3a3a3a; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #4a4a4a; }
        th { background-color: #ff6b6b; color: white; }
        .analysis { background: #3a3a3a; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #ffa500; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔥 Stress Test - System Breaking Point Analysis</h1>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        <p><strong>Objective:</strong> Identify maximum sustainable load and degradation patterns</p>
        
        <div class="metric-grid">
            <div class="metric-card">
                <div class="metric-label">Peak Virtual Users</div>
                <div class="metric-value">${maxVUs}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Total Requests</div>
                <div class="metric-value">${totalRequests.toLocaleString()}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Error Rate</div>
                <div class="metric-value ${errorRate > 0.05 ? 'critical' : errorRate > 0.01 ? 'warning' : 'success'}">
                    ${(errorRate * 100).toFixed(2)}%
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Throughput</div>
                <div class="metric-value">${data.metrics.http_reqs.values.rate.toFixed(1)}</div>
                <div class="metric-unit">req/s</div>
            </div>
        </div>
        
        <h2>Response Time Distribution</h2>
        <table>
            <tr>
                <th>Percentile</th>
                <th>Response Time</th>
                <th>Assessment</th>
            </tr>
            <tr>
                <td>Average</td>
                <td>${data.metrics.http_req_duration.values.avg.toFixed(2)}ms</td>
                <td class="${data.metrics.http_req_duration.values.avg < 200 ? 'success' : 'warning'}">
                    ${data.metrics.http_req_duration.values.avg < 200 ? '✓ Good' : '⚠ Degraded'}
                </td>
            </tr>
            <tr>
                <td>p95</td>
                <td>${p95.toFixed(2)}ms</td>
                <td class="${p95 < 500 ? 'success' : p95 < 1000 ? 'warning' : 'critical'}">
                    ${p95 < 500 ? '✓ Excellent' : p95 < 1000 ? '⚠ Acceptable' : '✗ Poor'}
                </td>
            </tr>
            <tr>
                <td>p99</td>
                <td>${p99.toFixed(2)}ms</td>
                <td class="${p99 < 1000 ? 'success' : p99 < 3000 ? 'warning' : 'critical'}">
                    ${p99 < 1000 ? '✓ Excellent' : p99 < 3000 ? '⚠ Acceptable' : '✗ Poor'}
                </td>
            </tr>
            <tr>
                <td>Max</td>
                <td>${data.metrics.http_req_duration.values.max.toFixed(2)}ms</td>
                <td class="${data.metrics.http_req_duration.values.max < 5000 ? 'warning' : 'critical'}">
                    ${data.metrics.http_req_duration.values.max < 5000 ? '⚠ Spike detected' : '✗ Timeout risk'}
                </td>
            </tr>
        </table>
        
        <h2>Performance Analysis</h2>
        <div class="analysis">
            <h3>System Capacity Assessment</h3>
            <ul>
                <li><strong>Maximum Sustainable VUs:</strong> ${errorRate < 0.01 ? maxVUs : Math.floor(maxVUs * 0.8)}</li>
                <li><strong>Recommended Production Limit:</strong> ${Math.floor(maxVUs * 0.7)} concurrent users (70% of max)</li>
                <li><strong>Breaking Point:</strong> ${errorRate > 0.05 ? `Reached at ~${maxVUs} VUs` : 'Not reached during test'}</li>
            </ul>
            
            <h3>Resource Bottlenecks</h3>
            <p>${errorRate > 0.05 ? '⚠ System showed degradation under peak load. Review:' : '✓ System handled peak load well.'}</p>
            <ul>
                ${errorRate > 0.05 ? `
                    <li>Database connection pool saturation</li>
                    <li>Memory usage and garbage collection</li>
                    <li>CPU utilization patterns</li>
                    <li>Network bandwidth constraints</li>
                ` : `
                    <li>Current configuration supports tested load</li>
                    <li>Monitor for sustained production usage</li>
                `}
            </ul>
        </div>
        
        <h2>Recommendations</h2>
        <div class="analysis">
            ${p95 > 1000 || p99 > 3000 ? `
                <p class="critical">🚨 Critical Performance Issues Detected</p>
                <ul>
                    <li>Response times exceed acceptable thresholds under load</li>
                    <li>Consider horizontal scaling or performance optimization</li>
                    <li>Review database query performance and caching strategy</li>
                </ul>
            ` : errorRate > 0.01 ? `
                <p class="warning">⚠ Warning: Elevated Error Rates</p>
                <ul>
                    <li>System approaching capacity limits</li>
                    <li>Increase connection pools and worker threads</li>
                    <li>Implement circuit breakers for external dependencies</li>
                </ul>
            ` : `
                <p class="success">✓ System Performance: Acceptable</p>
                <ul>
                    <li>Current infrastructure handles tested load well</li>
                    <li>Monitor production metrics continuously</li>
                    <li>Plan for 2x capacity growth</li>
                </ul>
            `}
        </div>
    </div>
</body>
</html>`;
}
