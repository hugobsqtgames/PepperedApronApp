/** The app sees the configuration of the variant it was built for (dev, staging, prod). */
import { ENV } from '../src/services/env';

const variant = process.env.APP_VARIANT ?? 'development';
const suffix = { development: '.dev', staging: '.staging', production: '' }[variant]!;

describe(`variant ${variant}`, () => {
  it('runs with its own identifiers', () => {
    expect(ENV.variant).toBe(variant);
    expect(ENV.appGroup).toBe(`group.app.pepperedapron${suffix}`);
    expect(ENV.siteUrl).toMatch(/^https:\/\//);
  });
});
