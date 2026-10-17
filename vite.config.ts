import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], test: { environment: 'node', include: ['src/**/*.test.ts', 'db/tests/**/*.test.ts', 'server/**/*.test.ts'] } });
