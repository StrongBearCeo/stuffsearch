module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // NativeWind v2 does NOT use jsxImportSource (that's v3). Plain preset.
      'babel-preset-expo',
    ],
    plugins: [
      // nativewind/babel is a PLUGIN (exports a visitor fn), not a preset.
      // It must live under plugins, and reanimated/plugin must be last.
      'nativewind/babel',
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': './src',
            '@app': './app',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
