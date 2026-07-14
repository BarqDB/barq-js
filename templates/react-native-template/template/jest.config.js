module.exports = {
  preset: 'react-native',
  // @barqdb packages ship an ES module react-native build, which the default
  // preset's transformIgnorePatterns (react-native/@react-native only) skips.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@barqdb)/)',
  ],
};
