/**
 * Apple Watch app: the shopping list to tick off and the running kitchen timers, sent by the
 * phone (src/services/watch.ts). APPLE_WATCH=0 leaves it out of a build (app.config.ts).
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'watch',
  name: 'PepperedApronWatch',
  bundleIdentifier: '.watchkitapp',
  displayName: 'PepperedApron',
  deploymentTarget: '10.0',
  icon: '../../assets/icon.png',
  colors: {
    $accent: '#86C1A2',
    paprika: '#E8894F',
  },
});
