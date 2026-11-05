import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({ base: '/', plugins: [react()], worker: { format: 'es' }, test: { exclude: ['tests/e2e*/**', 'node_modules/**'] } });
