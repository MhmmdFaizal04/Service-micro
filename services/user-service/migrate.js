import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

async function migrate() {
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(255)  NOT NULL,
        email       VARCHAR(255)  UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone       VARCHAR(20),
        role        VARCHAR(20)   NOT NULL DEFAULT 'customer',
        created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `

    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`

    console.log('✅ Migration user-service berhasil')
  } catch (err) {
    console.error('❌ Migration gagal:', err.message)
    process.exit(1)
  }
}

migrate()
