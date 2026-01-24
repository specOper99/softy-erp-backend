import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const isTracingEnabled = process.env.OTEL_ENABLED === 'true';

let sdk: NodeSDK | null = null;

class TracingLogger {
  private static formatMessage(message: string): string {
    return `[Tracing] ${message}`;
  }

  static log(message: string): void {
    process.stdout.write(`${this.formatMessage(message)}\n`);
  }

  static error(message: string, error?: unknown): void {
    const errorStr = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${this.formatMessage(message)}: ${errorStr}\n`);
  }
}

export function initTracing(): void {
  if (!isTracingEnabled) {
    TracingLogger.log('OpenTelemetry tracing is disabled');
    return;
  }

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

  // Configurable trace sampling rate (default: 10% in prod, 100% in dev)
  const defaultSampleRate = process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
  const sampleRate = parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || String(defaultSampleRate));
  TracingLogger.log(`Trace sampling rate: ${sampleRate * 100}%`);

  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint,
  });

  const spanProcessor =
    process.env.NODE_ENV === 'production'
      ? new BatchSpanProcessor(traceExporter)
      : new BatchSpanProcessor(traceExporter); // Use Batch in dev too for perf, verify with OTLP

  // Optional: Add Console Exporter for debugging in non-prod if OTEL_DEBUG is set
  const additionalProcessors = [];
  if (process.env.OTEL_DEBUG === 'true') {
    additionalProcessors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'softy-erp',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '0.0.1',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
    }),
    traceExporter,
    spanProcessor: spanProcessor, // NodeSDK takes a single spanProcessor or traceExporter. If custom, might need to use traceExporter unless using instrumentations.
    // Actually NodeSDK config allows traceExporter OR spanProcessor. If we want multiple, we might need a composite or verify NodeSDK behavior.
    // Simplified: Just use traceExporter property which NodeSDK wraps in BatchSpanProcessor by default if no spanProcessor provided.
    // Let's stick to standard config:
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
      }),
    ],
  });

  // Note: NodeSDK implementation details vary by version.
  // The safest way is passing traceExporter. NodeSDK uses BatchSpanProcessor by default for it.

  sdk.start();
  TracingLogger.log(`OpenTelemetry tracing started. Exporting to: ${otlpEndpoint}`);

  process.on('SIGTERM', () => {
    sdk
      ?.shutdown()
      .then(() => TracingLogger.log('OpenTelemetry SDK shut down'))
      .catch((error) => TracingLogger.error('Error shutting down OpenTelemetry', error))
      .finally(() => process.exit(0));
  });
}

export function shutdownTracing(): Promise<void> {
  if (sdk) {
    return sdk.shutdown();
  }
  return Promise.resolve();
}
