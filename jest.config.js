/** Jest config for pure-logic unit tests. Avoids the full RN babel config
 * (babel.config.js pulls NativeWind + reanimated which need a RN environment).
 * Tests run as plain TypeScript with no RN runtime. */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    // Expo config plugins (CommonJS, build-time) are unit-tested too.
    '<rootDir>/plugins/**/*.test.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Prevent any incidental RN import from exploding in pure-logic tests.
    '^react-native$': '<rootDir>/jest.stubs.js',
  },
  transform: {
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
  },
};
