import { resolve } from 'path';
// vite.config.ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src/*'] })],

  build: {
    copyPublicDir: false,
    minify: false,
    sourcemap: 'inline',

    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@rljson/rljson',
        '@rljson/validate',
        '@rljson/json',
        '@rljson/hash',
        '@rljson/is-ready',
        'node:events',
      ],
      output: {
        globals: {},
      },
    },
  },
});
