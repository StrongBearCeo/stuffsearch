const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// NativeWind v2 hooks in via its babel plugin (see babel.config.js), so no
// metro wrapper is needed here. We just ensure the default Expo metro config.
module.exports = config;
