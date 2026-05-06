module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'unplugin-typegpu/babel',
      // Worklets plugin must come last (Reanimated/Worklets requirement).
      'react-native-worklets/plugin',
    ],
  };
};
