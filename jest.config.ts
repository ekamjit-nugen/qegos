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
    '@nugen/broadcast-engine': '<rootDir>/packages/broadcast-engine/src',
    '@nugen/file-storage': '<rootDir>/packages/file-storage/src',
    '@nugen/chat-engine': '<rootDir>/packages/chat-engine/src',
    '@nugen/support-tickets': '<rootDir>/packages/support-tickets/src',
    '@nugen/whatsapp-connector': '<rootDir>/packages/whatsapp-connector/src',
    '@nugen/data-lifecycle': '<rootDir>/packages/data-lifecycle/src',
    '@nugen/xero-connector': '<rootDir>/packages/xero-connector/src',
    '@nugen/notification-engine': '<rootDir>/packages/notification-engine/src',
    '@nugen/analytics-engine': '<rootDir>/packages/analytics-engine/src',
    '@nugen/payment-gateway': '<rootDir>/packages/payment-gateway/src',
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
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
        tsconfig: '<rootDir>/tsconfig.base.json',
      },
    ],
  },
};

export default config;
