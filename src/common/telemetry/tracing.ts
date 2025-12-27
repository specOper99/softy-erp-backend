import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { NodeSDK } from '@opentelemetry/sdk-node';

const isTracingEnabled = process.env.OTEL_ENABLED === 'true';

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  if (!isTracingEnabled) {
    console.log('OpenTelemetry tracing is disabled');
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
  console.log('OpenTelemetry tracing started. Exporting to Zipkin:', zipkinUrl);

  process.on('SIGTERM', () => {
    sdk
      ?.shutdown()
      .then(() => console.log('OpenTelemetry SDK shut down'))
      .catch((error) =>
        console.error('Error shutting down OpenTelemetry', error),
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
