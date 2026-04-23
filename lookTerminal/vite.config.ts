import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'FruitCatch',
      fileName: () => `app.js`,
      formats: ['es']
    },
    rollupOptions: {
      external: ['three', '@mekou/engine-api'], // エンジン側が持っているものは含めない
    }
  }
});