import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests create/migrate/drop a private schema each; give the
    // first connection + migrations some headroom on a cold CI database.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  plugins: [
    // Vitest's default esbuild transform does not emit `design:paramtypes`
    // decorator metadata, which Nest's constructor injection depends on. SWC
    // does (it reads experimentalDecorators/emitDecoratorMetadata from tsconfig).
    swc.vite({ module: { type: 'es6' } }),
  ],
});
