/** Stub for react-native in pure-logic Jest tests (avoids loading the RN runtime).
 * Only the APIs actually touched by tested source modules are stubbed. */
module.exports = {
  Platform: { OS: 'ios', select: (o) => o.ios },
};
