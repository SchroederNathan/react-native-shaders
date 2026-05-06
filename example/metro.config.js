// Expo Metro config that resolves react-native-shaders directly from ../src
// during local development, so example app changes pick up shader source
// edits without needing a build step.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

config.resolver.extraNodeModules = {
  'react-native-shaders': workspaceRoot,
};

module.exports = config;
