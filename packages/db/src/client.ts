import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as authSchema from '@pms/auth'
import * as appSchema from './schema'

export const schema = { ...appSchema, ...authSchema }

export function createDb(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required')
  }
  const client = postgres(connectionString, { max: 10 })
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>
