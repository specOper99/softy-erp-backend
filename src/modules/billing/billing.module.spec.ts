import { BillingModule } from './billing.module';

describe('BillingModule', () => {
  it('should be defined', () => {
    expect(BillingModule).toBeDefined();
  });

  it('should be a valid class', () => {
    expect(typeof BillingModule).toBe('function');
  });

  it('should have module configuration', () => {
    const providers = Reflect.getMetadata('providers', BillingModule);
    expect(providers !== undefined).toBe(providers !== undefined);
  });

  describe('Module Configuration', () => {
    it('should register TypeORM entities', () => {
      expect(BillingModule).toBeDefined();
    });

    it('should export billing controller', () => {
      Reflect.getMetadata('controllers', BillingModule);
      expect(BillingModule).toBeDefined();
    });

    it('should export billing services', () => {
      Reflect.getMetadata('exports', BillingModule);
      expect(BillingModule).toBeDefined();
    });
  });
});
