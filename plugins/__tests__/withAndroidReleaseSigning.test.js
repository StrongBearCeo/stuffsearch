const { applyReleaseSigning } = require('../withAndroidReleaseSigning');

/**
 * Minimal but faithful excerpt of the Expo/RN `android/app/build.gradle`
 * template. The two `signingConfig signingConfigs.debug` lines are deliberate:
 * the plugin must rewrite only the one in the `release` build type.
 */
const TEMPLATE = `android {
    namespace 'com.stuffsearch.app'
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`;

describe('applyReleaseSigning', () => {
  it('adds a release signingConfig that reads keystore.properties', () => {
    const out = applyReleaseSigning(TEMPLATE);
    expect(out).toContain('release {');
    expect(out).toContain("rootProject.file('../keystore.properties')");
    expect(out).toContain("keystoreProps['STUFFSEARCH_UPLOAD_STORE_FILE']");
    expect(out).toContain("keystoreProps['STUFFSEARCH_UPLOAD_STORE_PASSWORD']");
    expect(out).toContain("keystoreProps['STUFFSEARCH_UPLOAD_KEY_ALIAS']");
    expect(out).toContain("keystoreProps['STUFFSEARCH_UPLOAD_KEY_PASSWORD']");
  });

  it('points the release build type at the release config, falling back to debug', () => {
    const out = applyReleaseSigning(TEMPLATE);
    expect(out).toContain(
      "signingConfig rootProject.file('../keystore.properties').exists() ? signingConfigs.release : signingConfigs.debug"
    );
  });

  it('leaves the debug build type signing untouched', () => {
    const out = applyReleaseSigning(TEMPLATE);
    // The debug build type keeps its plain `signingConfig signingConfigs.debug`;
    // the release one no longer has it, so exactly one bare occurrence remains.
    const bare = out.match(/^\s+signingConfig signingConfigs\.debug$/gm) || [];
    expect(bare).toHaveLength(1);
    expect(out).toContain("storeFile file('debug.keystore')");
  });

  it('preserves the rest of the file', () => {
    const out = applyReleaseSigning(TEMPLATE);
    expect(out).toContain("namespace 'com.stuffsearch.app'");
    expect(out).toContain('minifyEnabled enableMinifyInReleaseBuilds');
  });

  it('is idempotent — a second prebuild does not duplicate the block', () => {
    const once = applyReleaseSigning(TEMPLATE);
    expect(applyReleaseSigning(once)).toBe(once);
  });

  it('throws if the template loses its signingConfigs block', () => {
    const broken = TEMPLATE.replace('    signingConfigs {\n        debug {', '    signingConfigs {\n        dbg {');
    expect(() => applyReleaseSigning(broken)).toThrow(/signingConfigs block not found/);
  });

  it('throws if the template loses the release signingConfig anchor', () => {
    const broken = TEMPLATE.replace(
      '            // Caution! In production, you need to generate your own keystore file.\n',
      ''
    );
    expect(() => applyReleaseSigning(broken)).toThrow(/release signingConfig not found/);
  });

  it('never silently produces a debug-signed release build', () => {
    // Both failure modes must throw rather than return unmodified contents.
    const noAnchors = 'android { buildTypes { release { } } }';
    expect(() => applyReleaseSigning(noAnchors)).toThrow();
  });
});
