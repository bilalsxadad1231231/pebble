/** Pure-logic tests only. Component rendering needs a device or a native mock
 * layer; what is covered here is the arithmetic and parsing that can silently
 * drift away from the backend contract. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};
