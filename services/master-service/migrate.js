import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

async function migrate() {
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`

    await sql`
      CREATE TABLE IF NOT EXISTS token_products (
        id           UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
        name         VARCHAR(255)   NOT NULL,
        denomination INTEGER        NOT NULL,
        price        DECIMAL(12, 2) NOT NULL,
        stock        INTEGER        NOT NULL DEFAULT 0,
        is_active    BOOLEAN        NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_stock CHECK (stock >= 0)
      )
    `

    await sql`CREATE INDEX IF NOT EXISTS idx_products_is_active ON token_products(is_active)`

    await sql`
      INSERT INTO token_products (name, denomination, price, stock) VALUES
        ('Token Listrik 20.000',     20000,    22000.00,  100),
        ('Token Listrik 50.000',     50000,    52500.00,  100),
        ('Token Listrik 100.000',   100000,   103000.00,  100),
        ('Token Listrik 200.000',   200000,   204000.00,   50),
        ('Token Listrik 500.000',   500000,   506000.00,   50),
        ('Token Listrik 1.000.000', 1000000, 1010000.00,   20)
      ON CONFLICT DO NOTHING
    `

    console.log('✅ Migration master-service berhasil')
  } catch (err) {
    console.error('❌ Migration gagal:', err.message)
    process.exit(1)
  }
}

migrate()
