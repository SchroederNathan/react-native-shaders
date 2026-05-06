import type { ConfigPlugin } from '@expo/config-plugins';
import { createRunOncePlugin, withInfoPlist } from '@expo/config-plugins';

const pkg = {
  name: 'react-native-shaders',
  // Keep in sync with package.json. Bumping this string forces re-run.
  version: '0.1.0',
};

/**
 * `react-native-shaders` requires Metal-class GPU access via WebGPU/Dawn,
 * which `react-native-wgpu` provides. This plugin nudges the iOS Info.plist
 * with the GPU capability hint so the build stays self-documenting; the
 * actual native bridge is owned by `react-native-wgpu`.
 */
const withReactNativeShaders: ConfigPlugin = (config) => {
  return withInfoPlist(config, (cfg) => {
    const required = (cfg.modResults.UIRequiredDeviceCapabilities ??
      []) as string[];
    if (!required.includes('metal')) {
      cfg.modResults.UIRequiredDeviceCapabilities = [...required, 'metal'];
    }
    return cfg;
  });
};

export default createRunOncePlugin(withReactNativeShaders, pkg.name, pkg.version);
