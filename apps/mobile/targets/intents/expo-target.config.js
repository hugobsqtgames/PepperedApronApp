/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  // Siri and Shortcuts: "What's for dinner tonight?", "Add … to my groceries", "A random recipe".
  type: 'app-intent',
  name: 'PepperedApronIntents',
  bundleIdentifier: '.PepperedApronIntents',
  displayName: 'PepperedApron',
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
