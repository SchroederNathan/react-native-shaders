// Local mirror of ../../plugin/src/withReactNativeShaders.ts. The example
// doesn't install `react-native-shaders` from `file:..` (that would require
// `bob` to be installed at the workspace root for the prepare hook), so
// Expo's plugin resolver can't locate the package via node_modules. Pointing
// app.json at this relative file keeps the example runnable standalone.
const { createRunOncePlugin, withInfoPlist } = require('@expo/config-plugins');

const pkg = {
  name: 'react-native-shaders',
  version: '0.1.0',
};

const withReactNativeShaders = (config) =>
  withInfoPlist(config, (cfg) => {
    const required = cfg.modResults.UIRequiredDeviceCapabilities ?? [];
    if (!required.includes('metal')) {
      cfg.modResults.UIRequiredDeviceCapabilities = [...required, 'metal'];
    }
    return cfg;
  });

module.exports = createRunOncePlugin(
  withReactNativeShaders,
  pkg.name,
  pkg.version
);
