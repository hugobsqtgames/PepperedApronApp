// Bundles the API: npm dependencies stay external (installed in the image), workspace packages
// (TypeScript sources such as @pepperedapron/core) are compiled into the bundle.
import { build } from 'esbuild';

const externalNpm = {
  name: 'external-npm',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith('@pepperedapron/') ? undefined : { path: args.path, external: true },
    );
  },
};

for (const entry of ['server', 'migrate']) {
  await build({
    entryPoints: [`src/${entry}.ts`],
    outfile: `dist/${entry}.js`,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    sourcemap: true,
    plugins: [externalNpm],
    logLevel: 'warning',
  });
}
console.info('API built to dist/');
