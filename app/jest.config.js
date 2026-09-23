/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          module: 'commonjs',
          moduleResolution: 'node',
          strict: true,
          skipLibCheck: true,
          paths: {
            '@/*': ['./*'],
          },
        },
        diagnostics: false,
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^react-native$': '<rootDir>/__tests__/mocks/react-native.ts',
    '^expo-router$': '<rootDir>/__tests__/mocks/expo-router.ts',
    '^expo-linking$': '<rootDir>/__tests__/mocks/expo-linking.ts',
    '^expo-web-browser$': '<rootDir>/__tests__/mocks/expo-web-browser.ts',
    '^expo-constants$': '<rootDir>/__tests__/mocks/expo-constants.ts',
    '^expo-asset$': '<rootDir>/__tests__/mocks/expo-asset.ts',
    '^expo-location$': '<rootDir>/__tests__/mocks/expo-location.ts',
    '^\\./devHost$': '<rootDir>/__tests__/mocks/devHost.ts',
    '^.*/services/devHost$': '<rootDir>/__tests__/mocks/devHost.ts',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__tests__/mocks/assetFile.js',
  },
  globals: {
    __DEV__: false,
  },
  collectCoverageFrom: [
    'lib/listingSort.ts',
    'services/paymentCheckout.ts',
    'services/subscriptionPlans.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  testTimeout: 20000,
  forceExit: true,
  maxWorkers: 2,
};
