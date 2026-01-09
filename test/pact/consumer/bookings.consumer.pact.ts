import { MatchersV3, PactV3 } from '@pact-foundation/pact';
import axios from 'axios';
import path from 'path';

const { eachLike, like, regex } = MatchersV3;

const provider = new PactV3({
  consumer: 'ERPFrontend',
  provider: 'BookingsAPI',
  dir: path.resolve(__dirname, '../pacts'),
  logLevel: 'warn',
});

describe('Bookings API Consumer Pact', () => {
  describe('GET /bookings', () => {
    it('should return a list of bookings', async () => {
      await provider
        .given('bookings exist for the tenant')
        .uponReceiving('a request to list bookings')
        .withRequest({
          method: 'GET',
          path: '/bookings',
          headers: {
            Authorization: like(
              'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            ),
          },
        })
        .willRespondWith({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            data: eachLike({
              id: like('uuid-booking-1'),
              clientName: like('Client A'),
              eventDate: like('2026-01-15T10:00:00.000Z'),
              status: regex(
                'confirmed|cancelled|completed|pending',
                'confirmed',
              ),
              totalPrice: like(1500),
            }),
            total: like(1),
            page: like(1),
            limit: like(10),
          },
        })
        .executeTest(async (mockServer) => {
          const response = await axios.get(`${mockServer.url}/bookings`, {
            headers: { Authorization: 'Bearer test-token' },
          });

          expect(response.status).toBe(200);
          expect(response.data.data).toBeDefined();
          expect(Array.isArray(response.data.data)).toBe(true);
        });
    });
  });

  describe('POST /bookings', () => {
    it('should create a new booking', async () => {
      await provider
        .given('a client exists for the tenant')
        .uponReceiving('a request to create a booking')
        .withRequest({
          method: 'POST',
          path: '/bookings',
          headers: {
            Authorization: like(
              'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            ),
            'Content-Type': 'application/json',
          },
          body: {
            clientId: like('uuid-client-1'),
            eventDate: like('2026-02-20T14:00:00.000Z'),
            packageName: like('Wedding Package'),
            totalPrice: like(2500),
          },
        })
        .willRespondWith({
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: like('uuid-booking-new'),
            clientId: like('uuid-client-1'),
            eventDate: like('2026-02-20T14:00:00.000Z'),
            packageName: like('Wedding Package'),
            totalPrice: like(2500),
            status: like('pending'),
          },
        })
        .executeTest(async (mockServer) => {
          const response = await axios.post(
            `${mockServer.url}/bookings`,
            {
              clientId: 'uuid-client-1',
              eventDate: '2026-02-20T14:00:00.000Z',
              packageName: 'Wedding Package',
              totalPrice: 2500,
            },
            {
              headers: {
                Authorization: 'Bearer test-token',
                'Content-Type': 'application/json',
              },
            },
          );

          expect(response.status).toBe(201);
          expect(response.data.id).toBeDefined();
        });
    });
  });
});
