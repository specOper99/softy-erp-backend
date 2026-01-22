const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testRegex: '.*\\.integration\\.spec\\.ts$',
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    transformIgnorePatterns: [
        'node_modules/(?!(uuid|p-limit|yocto-queue)/)',
    ],
    collectCoverageFrom: [
        'src/**/*.(t|j)s',
        '!src/**/*.spec.ts',
        '!src/**/*.e2e-spec.ts',
        '!src/main.ts',
        '!src/**/*.module.ts',
        '!src/**/*.interface.ts',
        '!src/**/*.dto.ts',
        '!src/**/*.entity.ts',
    ],
    coverageDirectory: './coverage/integration',
    testEnvironment: 'node',
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
        prefix: '<rootDir>/',
    }),
    testTimeout: 30000, // 30s for integration tests
    maxWorkers: 1, // Run integration tests sequentially
    globalSetup: '<rootDir>/test/integration/setup.ts',
    globalTeardown: '<rootDir>/test/integration/teardown.ts',
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },
};
