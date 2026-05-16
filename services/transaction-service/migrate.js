import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

async function migrate() {
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`

    await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id           UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id      UUID           NOT NULL,
        product_id   UUID           NOT NULL,
        token_number VARCHAR(30)    NOT NULL,
        amount       DECIMAL(12, 2) NOT NULL,
        status       VARCHAR(20)    NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'success', 'failed')),
        created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `

    await sql`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_transactions_status   ON transactions(status)`

    console.log('✅ Migration transaction-service berhasil')
  } catch (err) {
    console.error('❌ Migration gagal:', err.message)
    process.exit(1)
  }
}

migrate()
