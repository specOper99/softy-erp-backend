import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { NodeSDK } from '@opentelemetry/sdk-node';

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

  const zipkinUrl =
    process.env.ZIPKIN_ENDPOINT || 'http://localhost:9411/api/v2/spans';

  sdk = new NodeSDK({
    serviceName: 'chapters-studio-erp',
    traceExporter: new ZipkinExporter({
      url: zipkinUrl,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  TracingLogger.log(
    `OpenTelemetry tracing started. Exporting to Zipkin: ${zipkinUrl}`,
  );

  process.on('SIGTERM', () => {
    sdk
      ?.shutdown()
      .then(() => TracingLogger.log('OpenTelemetry SDK shut down'))
      .catch((error) =>
        TracingLogger.error('Error shutting down OpenTelemetry', error),
      )
      .finally(() => process.exit(0));
  });
}

export function shutdownTracing(): Promise<void> {
  if (sdk) {
    return sdk.shutdown();
  }
  return Promise.resolve();
}
