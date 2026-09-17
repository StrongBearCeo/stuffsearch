/**
 * Two test projects, split by what they need to run.
 *
 *   logic       — `*.test.ts`. Pure functions from src/lib and the build-time
 *                 Expo config plugins. Node environment, react-native stubbed,
 *                 no RN runtime: fast, and the overwhelming majority of tests.
 *   components  — `*.test.tsx`. Renders real components and hooks through
 *                 jest-expo + React Native Testing Library.
 *
 * The second project exists because three shipped bugs lived in a blind spot
 * the first can't reach: a scanner that latched after one scan, a pan gesture
 * that never started, and a filter chip whose dismissal outlived the screen.
 * None of them were logic errors — they were component state and framework
 * wiring, which a node-only suite cannot observe. "Needs device testing" was
 * the honest note at the time; this is the fix for needing to write it.
 */
const path = require('path');

/** Babel used by the node-only project: no RN preset, no reanimated plugin. */
const logicTransform = {
  '^.+\\.(t|j)sx?$': [
    'babel-jest',
    {
      configFile: false,
      babelrc: false,
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
        ['@babel/preset-react', { runtime: 'automatic' }],
      ],
    },
  ],
};

module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/**/*.test.ts',
        // Expo config plugins (CommonJS, build-time) are unit-tested too.
        '<rootDir>/plugins/**/*.test.js',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        // Prevent any incidental RN import from exploding in pure-logic tests.
        '^react-native$': '<rootDir>/jest.stubs.js',
      },
      transform: logicTransform,
    },
    {
      displayName: 'components',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/app/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.components.tsx'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      // jest-expo ships its own transform; node_modules that publish untranspiled
      // ESM (expo, RN, and friends) must be transformed rather than ignored.
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@testing-library/react-native)',
      ],
    },
  ],
};
