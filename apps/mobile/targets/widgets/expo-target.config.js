/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'PepperedApronWidgets',
  bundleIdentifier: '.PepperedApronWidgets',
  displayName: 'PepperedApron',
  deploymentTarget: '17.0',
  colors: {
    $accent: { color: '#1F4D3A', darkColor: '#86C1A2' },
    $widgetBackground: { color: '#F7F1E6', darkColor: '#121814' },
    background: { color: '#F7F1E6', darkColor: '#121814' },
    forest: { color: '#1F4D3A', darkColor: '#86C1A2' },
    paprika: { color: '#D2642A', darkColor: '#E8894F' },
    ink: { color: '#1F2A24', darkColor: '#F2ECE1' },
    muted: { color: '#5E655F', darkColor: '#B3AC9F' },
  },
  images: { glyph: './assets/glyph.png' },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
