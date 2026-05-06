// Expo Metro config that resolves react-native-shaders directly from ../src
// during local development, so example app changes pick up shader source
// edits without needing a build step.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
// Files imported from outside example/ (notably ../src/**) won't find
// react/react-native by walking up — the workspace root has no node_modules.
// Pin Metro to the example's node_modules so all resolutions land here.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

config.resolver.extraNodeModules = {
  'react-native-shaders': workspaceRoot,
};

module.exports = config;
