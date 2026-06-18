import { Injectable } from '@nestjs/common';
import type { Counter } from 'prom-client';
import { MetricsFactory } from '../services/metrics.factory';

export interface CaslDisagreementLabels {
  role: string;
  action: string;
  subject: string;
  decision_legacy: string;
  decision_casl: string;
}

type CaslDisagreementLabelNames = keyof CaslDisagreementLabels;

@Injectable()
export class CaslShadowMetric {
  private readonly disagreementCounter: Counter<CaslDisagreementLabelNames>;

  constructor(metricsFactory: MetricsFactory) {
    this.disagreementCounter = metricsFactory.getOrCreateCounter({
      name: 'casl_authorization_disagreement_total',
      help: 'CASL vs legacy ResourceOwnershipGuard authorization disagreements',
      labelNames: ['role', 'action', 'subject', 'decision_legacy', 'decision_casl'],
    });
  }

  recordDisagreement(labels: CaslDisagreementLabels): void {
    this.disagreementCounter.inc(labels);
  }
}
