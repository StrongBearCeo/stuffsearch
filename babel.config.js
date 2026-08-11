module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Path aliases (@/*, @app/*) resolve via experiments.tsconfigPaths in
      // app.config.ts + tsconfig paths — no babel module-resolver needed.
      // react-native-reanimated/plugin must remain LAST.
      'react-native-reanimated/plugin',
    ],
  };
};
