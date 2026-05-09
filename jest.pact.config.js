module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/test/pact/**/*.pact.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    testPathIgnorePatterns: ['<rootDir>/.worktrees/', '<rootDir>/dist/'],
    modulePathIgnorePatterns: ['<rootDir>/.worktrees/', '<rootDir>/dist/'],
    testTimeout: 30000,
};
