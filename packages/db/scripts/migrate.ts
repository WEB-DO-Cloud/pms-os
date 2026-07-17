import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')
const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

await migrate(db, { migrationsFolder })
await client.end()
console.log('Migrations applied from', migrationsFolder)
