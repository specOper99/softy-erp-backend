import { asyncLocalStorage, getCorrelationId, getRequestContext } from './request-context';

describe('RequestContext', () => {
    it('should set and get correlation ID using asyncLocalStorage', (done) => {
        asyncLocalStorage.run({ correlationId: 'test-id' }, () => {
            expect(getCorrelationId()).toBe('test-id');
            expect(getRequestContext()?.correlationId).toBe('test-id');
            done();
        });
    });

    it('should return undefined when outside context', () => {
        expect(getCorrelationId()).toBeUndefined();
        expect(getRequestContext()).toBeUndefined();
    });

    it('should maintain independent context for different runs', (done) => {
        asyncLocalStorage.run({ correlationId: 'id-1' }, () => {
            expect(getCorrelationId()).toBe('id-1');

            asyncLocalStorage.run({ correlationId: 'id-2' }, () => {
                expect(getCorrelationId()).toBe('id-2');
            });

            expect(getCorrelationId()).toBe('id-1');
            done();
        });
    });
});
