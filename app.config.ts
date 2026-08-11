import type { ExpoConfig, ConfigContext } from '@expo/config';
import { version } from './package.json';

// Docs: https://docs.expo.dev/guides/environment-variables/
const APP_SCHEME = 'stuffsearch';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'StuffSearch',
  slug: 'stuffsearch',
  version,
  orientation: 'default',
  icon: './assets/icon.png',
  scheme: APP_SCHEME,
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0f172a',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.stuffsearch.app',
    infoPlist: {
      NSCameraUsageDescription:
        'StuffSearch uses the camera to scan QR and barcodes so you can find your things later.',
      NSMicrophoneUsageDescription:
        'StuffSearch uses the microphone for voice search.',
      NSSpeechRecognitionUsageDescription:
        'StuffSearch uses speech recognition for voice search.',
      NSPhotoLibraryUsageDescription:
        'StuffSearch adds photos of your items and places.',
      CFBundleLocalizations: ['en', 'vi'],
    },
    associatedDomains: [
      // Replace with your real universal-link domain before shipping.
      // 'applinks:stuffsearch.app',
    ],
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f172a',
    },
    package: 'com.stuffsearch.app',
    permissions: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: APP_SCHEME }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    // 'single' = client-side rendering only (no SSR). Avoids window/SecureStore
    // not being available during server-side static rendering.
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-localization',
    [
      'expo-camera',
      {
        cameraPermissionText:
          'StuffSearch uses the camera to scan QR and barcodes so you can find your things later.',
        microphonePermission: false,
      },
    ],
    [
      'expo-build-properties',
      {
        ios: { newArchEnabled: false },
        android: { newArchEnabled: false },
      },
    ],
  ],
  experiments: {
    tsconfigPaths: true,
  },
  extra: {
    eas: { projectId: '58fa9a60-853e-4061-805d-f9baf4edeee4' },
  },
});
