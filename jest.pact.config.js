module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/test/pact/**/*.pact.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    testPathIgnorePatterns: ['<rootDir>/.worktrees/'],
    modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
    testTimeout: 30000,
};
