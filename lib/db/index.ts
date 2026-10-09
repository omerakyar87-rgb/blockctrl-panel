import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'
import { pool } from './postgres'

export { pool }
export const db = drizzle(pool, { schema })

/**
 * Database schema is provisioned by the deployment migration pipeline.
 * Runtime requests must never execute DDL or acquire migration locks.
 */
export async function ensurePanelSchema() {
  return undefined
}
