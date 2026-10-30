/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/ios',
  roots: ['<rootDir>/__tests__'],
  // The configuration of the variant under test (APP_VARIANT).
  setupFiles: ['<rootDir>/test-setup/variant.js'],
  // Workspace packages ship TypeScript sources; let babel transform them and the RN ecosystem.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|i18next|react-i18next))',
  ],
};
