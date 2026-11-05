import { defineConfig } from 'vite';

// A worker-only verification build; no application UI before design approval.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: '.tools/worker-build',
    lib: { entry: 'src/worker/simulation.worker.ts', formats: ['es'], fileName: () => 'simulation.worker.js' },
  },
});
