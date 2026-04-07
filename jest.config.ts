import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages/', '<rootDir>/apps/'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '@nugen/error-handler': '<rootDir>/packages/error-handler/src',
    '@nugen/validator': '<rootDir>/packages/validator/src',
    '@nugen/rate-limiter': '<rootDir>/packages/rate-limiter/src',
    '@nugen/auth': '<rootDir>/packages/auth/src',
    '@nugen/rbac': '<rootDir>/packages/rbac/src',
    '@nugen/audit-log': '<rootDir>/packages/audit-log/src',
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    'apps/*/src/**/*.ts',
    '!**/index.ts',
    '!**/types.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  clearMocks: true,
  restoreMocks: true,
};

export default config;
