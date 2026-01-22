/* globals __ENV */
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const loginSuccessRate = new Rate('login_success_rate');
const loginDuration = new Trend('login_duration');
const refreshSuccessRate = new Rate('refresh_success_rate');

// Test configuration
export const options = {
    stages: [
        { duration: '30s', target: 20 },  // Ramp up to 20 users
        { duration: '1m', target: 50 },   // Ramp up to 50 users
        { duration: '2m', target: 100 },  // Ramp up to 100 users
        { duration: '1m', target: 50 },   // Ramp down
        { duration: '30s', target: 0 },   // Ramp down to 0
    ],
    thresholds: {
        // SLOs: p95 < 200ms, p99 < 500ms, error rate < 1%
        http_req_duration: ['p(95)<200', 'p(99)<500'],
        http_req_failed: ['rate<0.01'],
        login_success_rate: ['rate>0.99'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test data
const users = [
    { email: 'admin@tenant1.com', password: 'Admin123!@#' },
    { email: 'user1@tenant1.com', password: 'User123!@#' },
    { email: 'user2@tenant1.com', password: 'User456!@#' },
];

export default function () {
    const user = users[Math.floor(Math.random() * users.length)];

    // Test 1: Login
    const loginPayload = JSON.stringify({
        email: user.email,
        password: user.password,
    });

    const loginParams = {
        headers: {
            'Content-Type': 'application/json',
        },
        tags: { name: 'Login' },
    };

    const loginStart = Date.now();
    const loginRes = http.post(
        `${BASE_URL}/auth/login`,
        loginPayload,
        loginParams,
    );
    const loginEnd = Date.now();

    const loginSuccess = check(loginRes, {
        'login status is 200': (r) => r.status === 200,
        'has access token': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.accessToken !== undefined;
            } catch (e) {
                return false;
            }
        },
        'has refresh token': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.refreshToken !== undefined;
            } catch (e) {
                return false;
            }
        },
    });

    loginSuccessRate.add(loginSuccess);
    loginDuration.add(loginEnd - loginStart);

    if (!loginSuccess || loginRes.status !== 200) {
        sleep(1);
        return;
    }

    const tokens = JSON.parse(loginRes.body);
    const accessToken = tokens.accessToken;
    const refreshToken = tokens.refreshToken;

    sleep(1);

    // Test 2: Access protected endpoint
    const authParams = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        tags: { name: 'GetProfile' },
    };

    const profileRes = http.get(`${BASE_URL}/users/me`, authParams);

    check(profileRes, {
        'profile status is 200': (r) => r.status === 200,
        'profile has email': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.email === user.email;
            } catch (e) {
                return false;
            }
        },
    });

    sleep(0.5);

    // Test 3: Token refresh
    const refreshPayload = JSON.stringify({
        refreshToken: refreshToken,
    });

    const refreshParams = {
        headers: {
            'Content-Type': 'application/json',
        },
        tags: { name: 'RefreshToken' },
    };

    const refreshRes = http.post(
        `${BASE_URL}/auth/refresh`,
        refreshPayload,
        refreshParams,
    );

    const refreshSuccess = check(refreshRes, {
        'refresh status is 200': (r) => r.status === 200,
        'has new access token': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.accessToken !== undefined;
            } catch (e) {
                return false;
            }
        },
    });

    refreshSuccessRate.add(refreshSuccess);

    sleep(1);

    // Test 4: Failed login (rate limiting test)
    const failedLoginPayload = JSON.stringify({
        email: user.email,
        password: 'WrongPassword123',
    });

    const failedLoginRes = http.post(
        `${BASE_URL}/auth/login`,
        failedLoginPayload,
        loginParams,
    );

    check(failedLoginRes, {
        'failed login status is 401': (r) => r.status === 401,
    });

    sleep(2);
}

export function handleSummary(data) {
    return {
        'scripts/load-testing/reports/auth-flow-summary.html': htmlReport(data),
        stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
}

function textSummary(data, options) {
    const indent = options?.indent || '';
    const enableColors = options?.enableColors || false;

    let summary = `\n${indent}Authentication Flow Load Test Summary\n`;
    summary += `${indent}${'='.repeat(50)}\n\n`;

    summary += `${indent}Checks:\n`;
    Object.entries(data.metrics).forEach(([name, metric]) => {
        if (metric.type === 'rate') {
            const rate = (metric.values.rate * 100).toFixed(2);
            summary += `${indent}  ${name}: ${rate}%\n`;
        }
    });

    summary += `\n${indent}HTTP Request Duration:\n`;
    const reqDuration = data.metrics.http_req_duration.values;
    summary += `${indent}  avg: ${reqDuration.avg.toFixed(2)}ms\n`;
    summary += `${indent}  p95: ${reqDuration['p(95)'].toFixed(2)}ms\n`;
    summary += `${indent}  p99: ${reqDuration['p(99)'].toFixed(2)}ms\n`;

    return summary;
}

function htmlReport(data) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>K6 Auth Flow Load Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
        h2 { color: #666; margin-top: 30px; }
        .metric { margin: 15px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #4CAF50; }
        .metric-name { font-weight: bold; color: #333; }
        .metric-value { color: #4CAF50; font-size: 24px; font-weight: bold; }
        .pass { color: #4CAF50; }
        .fail { color: #f44336; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #4CAF50; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 Authentication Flow Load Test Report</h1>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        
        <h2>Test Configuration</h2>
        <div class="metric">
            <div class="metric-name">Virtual Users (VUs)</div>
            <div>Peak: ${data.metrics.vus_max.values.max}</div>
        </div>
        
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
                <td>&lt; 200ms</td>
                <td class="${data.metrics.http_req_duration.values['p(95)'] < 200 ? 'pass' : 'fail'}">
                    ${data.metrics.http_req_duration.values['p(95)'] < 200 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
            <tr>
                <td>p99 Response Time</td>
                <td>${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms</td>
                <td>&lt; 500ms</td>
                <td class="${data.metrics.http_req_duration.values['p(99)'] < 500 ? 'pass' : 'fail'}">
                    ${data.metrics.http_req_duration.values['p(99)'] < 500 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
            <tr>
                <td>Error Rate</td>
                <td>${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%</td>
                <td>&lt; 1%</td>
                <td class="${data.metrics.http_req_failed.values.rate < 0.01 ? 'pass' : 'fail'}">
                    ${data.metrics.http_req_failed.values.rate < 0.01 ? '✓ PASS' : '✗ FAIL'}
                </td>
            </tr>
        </table>
        
        <h2>Success Rates</h2>
        ${Object.entries(data.metrics)
            .filter(([name]) => name.includes('_success_rate'))
            .map(([name, metric]) => `
            <div class="metric">
                <div class="metric-name">${name.replace(/_/g, ' ').toUpperCase()}</div>
                <div class="metric-value">${(metric.values.rate * 100).toFixed(2)}%</div>
            </div>
          `).join('')}
    </div>
</body>
</html>`;
}
