import { defineConfig } from 'drizzle-kit';
// Explicit offline generation only; deliberately outside Netlify migration discovery.
export default defineConfig({ dialect: 'postgresql', schema: './db/schema.ts', out: './db/quarantine/generated' });
