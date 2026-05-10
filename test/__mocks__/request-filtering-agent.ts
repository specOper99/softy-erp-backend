/**
 * CJS-friendly stub for tests. The real `request-filtering-agent` is ESM-only,
 * which trips Jest's `--experimental-vm-modules` runner when paired with
 * `ts-jest`. Tests do not exercise the agent's filtering — outbound HTTPS
 * calls are mocked at the `https.request` level — so a no-op subclass of the
 * built-in `https.Agent` is sufficient for runtime compatibility.
 */
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

export class RequestFilteringHttpAgent extends HttpAgent {}
export class RequestFilteringHttpsAgent extends HttpsAgent {}

export const globalHttpAgent = new RequestFilteringHttpAgent();
export const globalHttpsAgent = new RequestFilteringHttpsAgent();
export const DefaultRequestFilteringAgentOptions = {
  allowPrivateIPAddress: false,
  allowMetaIPAddress: false,
  allowIPAddressList: [],
  denyIPAddressList: [],
};

export function useAgent(url: string): HttpAgent | HttpsAgent {
  return url.startsWith('https:') ? globalHttpsAgent : globalHttpAgent;
}
