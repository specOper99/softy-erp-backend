import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const controllerPath = join(root, 'src/modules/platform/controllers/platform-tenants.controller.ts');
const servicePath = join(root, 'src/modules/platform/services/platform-tenant.service.ts');

const LIFECYCLE_MUTATION_METHODS: ReadonlyArray<{ controllerMethod: string; serviceMethod: string }> = [
  { controllerMethod: 'createTenant', serviceMethod: 'createTenant' },
  { controllerMethod: 'updateTenant', serviceMethod: 'updateTenant' },
  { controllerMethod: 'suspendTenant', serviceMethod: 'suspendTenant' },
  { controllerMethod: 'reactivateTenant', serviceMethod: 'reactivateTenant' },
  { controllerMethod: 'lockTenant', serviceMethod: 'lockTenant' },
  { controllerMethod: 'deleteTenant', serviceMethod: 'deleteTenant' },
  { controllerMethod: 'cancelScheduledDeletion', serviceMethod: 'cancelScheduledDeletion' },
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function extractServiceMethodBody(serviceContents: string, methodName: string): string | null {
  const signature = `async ${methodName}(`;
  const start = serviceContents.indexOf(signature);
  if (start === -1) {
    return null;
  }

  const nextMethod = serviceContents.indexOf('\n  async ', start + signature.length);
  return nextMethod === -1 ? serviceContents.slice(start) : serviceContents.slice(start, nextMethod);
}

const controllerContents = readFileSync(controllerPath, 'utf8');
const serviceContents = readFileSync(servicePath, 'utf8');
const violations: string[] = [];

for (const { controllerMethod, serviceMethod } of LIFECYCLE_MUTATION_METHODS) {
  const controllerPattern = new RegExp(`async\\s+${controllerMethod}\\s*\\(`, 'u');
  if (!controllerPattern.test(controllerContents)) {
    continue;
  }

  const serviceMethodBody = extractServiceMethodBody(serviceContents, serviceMethod);
  if (!serviceMethodBody) {
    violations.push(
      `Platform tenant service is missing ${serviceMethod}() for controller mutation ${controllerMethod}.`,
    );
    continue;
  }

  const recordsLifecycle =
    serviceMethodBody.includes('recordLifecycleEvent') || serviceMethodBody.includes('lifecycleEventRepository.save');

  if (!recordsLifecycle) {
    violations.push(
      `Platform tenant mutation ${serviceMethod}() must record a TenantLifecycleEvent via recordLifecycleEvent() or lifecycleEventRepository.save().`,
    );
  }
}

if (violations.length > 0) {
  fail(`Lifecycle completeness violations:\n${violations.map((violation) => `- ${violation}`).join('\n')}`);
}

console.info('Platform tenant lifecycle completeness check passed.');
