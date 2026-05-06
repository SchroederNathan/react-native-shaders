// Expo loads this file when an app lists "react-native-shaders" in its
// app.json `plugins`. It re-exports the compiled config plugin so we can
// keep the source in TypeScript.
module.exports = require('./plugin/build/withReactNativeShaders').default;
