/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'PepperedApronWidgets',
  bundleIdentifier: '.PepperedApronWidgets',
  displayName: 'PepperedApron',
  deploymentTarget: '17.0',
  colors: {
    $accent: { light: '#1F4D3A', dark: '#86C1A2' },
    $widgetBackground: { light: '#F7F1E6', dark: '#121814' },
    background: { light: '#F7F1E6', dark: '#121814' },
    forest: { light: '#1F4D3A', dark: '#86C1A2' },
    paprika: { light: '#D2642A', dark: '#E8894F' },
    ink: { light: '#1F2A24', dark: '#F2ECE1' },
    muted: { light: '#5E655F', dark: '#B3AC9F' },
  },
  images: { glyph: './assets/glyph.png' },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
