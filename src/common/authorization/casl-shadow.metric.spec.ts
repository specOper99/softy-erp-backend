import type { MetricsFactory } from '../services/metrics.factory';
import { CaslShadowMetric } from './casl-shadow.metric';

describe('CaslShadowMetric', () => {
  it('increments disagreement counter with labels', () => {
    const inc = jest.fn();
    const metricsFactory = {
      getOrCreateCounter: jest.fn().mockReturnValue({ inc }),
    } as unknown as MetricsFactory;

    const metric = new CaslShadowMetric(metricsFactory);
    metric.recordDisagreement({
      role: 'CLIENT',
      action: 'read',
      subject: 'Invoice',
      decision_legacy: 'allow',
      decision_casl: 'deny',
    });

    expect(metricsFactory.getOrCreateCounter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'casl_authorization_disagreement_total' }),
    );
    expect(inc).toHaveBeenCalledWith({
      role: 'CLIENT',
      action: 'read',
      subject: 'Invoice',
      decision_legacy: 'allow',
      decision_casl: 'deny',
    });
  });
});
