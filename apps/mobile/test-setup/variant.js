/**
 * Tests run against the real app configuration of one variant (APP_VARIANT = development,
 * staging or production, default development): what expo-constants gives the app at runtime.
 */
/* global jest */
jest.mock('expo-constants', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = require('../app.config.ts').default;
  const config = load({ config: {} });
  const constants = { expoConfig: config, manifest: config, appOwnership: null };
  return { __esModule: true, default: constants, ...constants };
});
