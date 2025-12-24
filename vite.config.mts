import { resolve } from 'path';
// vite.config.ts
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';


export default defineConfig({
  plugins: [dts({ include: ['src/**/*'] })],

  build: {
    copyPublicDir: false,
    minify: false,
    sourcemap: true,

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
      ],
      output: {
        globals: {},
        sourcemapPathTransform: (relativeSourcePath) => {
          // Make paths absolute so VS Code can find them
          return relativeSourcePath.replace(
            '../src/',
            resolve(__dirname, 'src') + '/',
          );
        },
      },
    },
  },
});
