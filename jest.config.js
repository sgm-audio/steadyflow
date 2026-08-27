/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'packages/core/src/experimental/shopify-app-readiness/**/*.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/index.test.ts'
  ]
};