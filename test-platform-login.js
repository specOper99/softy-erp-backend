const request = require('supertest');

async function testLogin() {
  const response = await request('http://localhost:3001')
    .post('/api/v1/platform/auth/login')
    .send({
      email: 'admin@erp.soft-y.org',
      password: 'SecurePassword123!',
    });
  
  console.log('Status:', response.status);
  console.log('Body:', JSON.stringify(response.body, null, 2));
}

testLogin().catch(console.error);
