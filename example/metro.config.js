// Expo Metro config that resolves react-native-shaders directly from ../src
// during local development, so example app changes pick up shader source
// edits without needing a build step.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
// Files imported from outside example/ (notably ../src/**) must NOT walk up
// into the workspace root's node_modules — that copy is pinned to RN 0.81.4
// (the library's dev RN), and its TurboModuleRegistry skips the bridgeless
// legacy fallback, so any TurboModule throws "could not be found" on RN 0.83.
// We can't fully disable hierarchical lookup (Metro needs it for nested
// transitive deps), so blockList the parent's duplicate node_modules tree.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.blockList = [
  // Match anything under <workspaceRoot>/node_modules but NOT under
  // <workspaceRoot>/example/node_modules.
  new RegExp(`^${path.resolve(workspaceRoot, 'node_modules')}/.*`),
];

config.resolver.extraNodeModules = {
  'react-native-shaders': workspaceRoot,
};

module.exports = config;
