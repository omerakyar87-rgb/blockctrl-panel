import { Pool, type PoolConfig } from 'pg'

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.NEON_DATABASE_URL

function normalizeConnectionString(value: string | undefined) {
  if (!value) return undefined

  try {
    const url = new URL(value)
    const sslMode = url.searchParams.get('sslmode')?.toLowerCase()

    if (sslMode === 'require') {
      url.searchParams.set('uselibpqcompat', 'true')
    }

    return url.toString()
  } catch {
    return value
  }
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(raw)))
}

export function createPostgresPool(overrides: PoolConfig = {}) {
  const { connectionString: overrideConnectionString, ...poolOverrides } = overrides
  const connectionString = normalizeConnectionString(overrideConnectionString ?? databaseUrl)

  return new Pool({
    ...(connectionString ? { connectionString } : {}),
    max: integerEnv('PG_POOL_MAX', 5, 1, 50),
    idleTimeoutMillis: integerEnv('PG_POOL_IDLE_TIMEOUT_MS', 10_000, 1_000, 300_000),
    connectionTimeoutMillis: integerEnv('PG_POOL_CONNECTION_TIMEOUT_MS', 5_000, 500, 60_000),
    maxLifetimeSeconds: integerEnv('PG_POOL_MAX_LIFETIME_SECONDS', 300, 0, 3_600),
    ...poolOverrides,
  })
}

export const pool = createPostgresPool()
