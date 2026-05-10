// Jest setup file
import { initializeTransactionalContext } from 'typeorm-transactional';

// Bootstrap typeorm-transactional CLS storage so `@Transactional()`-decorated
// methods (added in future per-service migrations) can resolve their context
// inside Jest workers. The production equivalent runs from `main.ts`.
initializeTransactionalContext();

jest.setTimeout(30000); // Increase timeout
