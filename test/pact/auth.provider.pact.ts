import { Verifier } from '@pact-foundation/pact';
import fs from 'node:fs';
import path from 'path';

describe('Pact Verification', () => {
  const pactFilePath = path.resolve(process.cwd(), './pacts/auth_client-auth_provider.json');

  const maybeIt = fs.existsSync(pactFilePath) ? it : it.skip;

  maybeIt('validates the expectations of AuthServiceClient', () => {
    return new Verifier({
      providerBaseUrl: 'http://localhost:3000', // Provider running locally
      pactUrls: [pactFilePath],
      provider: 'AuthProvider',
    }).verifyProvider();
  });
});
