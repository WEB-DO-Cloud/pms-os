import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/schema.ts', '../auth/src/auth-schema.ts'],
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/pms_os',
  },
})
