import { Verifier } from '@pact-foundation/pact';
import path from 'path';

describe('Pact Verification', () => {
  it('validates the expectations of AuthServiceClient', () => {
    return new Verifier({
      providerBaseUrl: 'http://localhost:3000', // Provider running locally
      pactUrls: [path.resolve(process.cwd(), './pacts/auth_client-auth_provider.json')],
      provider: 'AuthProvider',
    }).verifyProvider();
  });
});
