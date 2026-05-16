import sql from '../db.js'

/**
 * Generate nomor token PLN: format XXXX-XXXX-XXXX-XXXX-XXXX (20 digit)
 */
function generateTokenNumber() {
  let result = ''
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 4 === 0) result += '-'
    result += Math.floor(Math.random() * 10).toString()
  }
  return result
}

export default async function transactionRoutes(fastify) {
  const USER_SERVICE_URL    = process.env.USER_SERVICE_URL
  const MASTER_SERVICE_URL  = process.env.MASTER_SERVICE_URL

  // POST /transactions — beli token listrik
  fastify.post('/transactions', {
    schema: {
      body: {
        type: 'object',
        required: ['product_id'],
        properties: {
          product_id: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.headers['x-user-id']
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' })

    const { product_id } = request.body

    // 1. Verifikasi user
    const userRes = await fetch(`${USER_SERVICE_URL}/internal/users/${userId}`)
    if (!userRes.ok) return reply.status(404).send({ error: 'User tidak ditemukan' })
    const { user } = await userRes.json()

    // 2. Cek produk & stok
    const productRes = await fetch(`${MASTER_SERVICE_URL}/internal/products/${product_id}`)
    if (!productRes.ok) return reply.status(404).send({ error: 'Produk tidak ditemukan' })
    const { product } = await productRes.json()

    if (product.stock < 1) {
      return reply.status(400).send({ error: 'Stok tidak cukup' })
    }

    // 3. Generate token number
    const tokenNumber = generateTokenNumber()

    // 4. Simpan transaksi (status: pending)
    const [transaction] = await sql`
      INSERT INTO transactions (user_id, product_id, token_number, amount, status)
      VALUES (${userId}, ${product_id}, ${tokenNumber}, ${product.price}, 'pending')
      RETURNING *
    `

    // 5. Kurangi stok di master-service
    const stockRes = await fetch(`${MASTER_SERVICE_URL}/internal/products/${product_id}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 1 })
    })

    if (!stockRes.ok) {
      await sql`
        UPDATE transactions SET status = 'failed', updated_at = NOW()
        WHERE id = ${transaction.id}
      `
      return reply.status(400).send({ error: 'Gagal memperbarui stok, transaksi dibatalkan' })
    }

    // 6. Update status → success
    const [updated] = await sql`
      UPDATE transactions SET status = 'success', updated_at = NOW()
      WHERE id = ${transaction.id}
      RETURNING *
    `

    return reply.status(201).send({
      message: 'Pembelian token berhasil',
      transaction: {
        id:           updated.id,
        token_number: updated.token_number,
        amount:       updated.amount,
        status:       updated.status,
        product: {
          name:         product.name,
          denomination: product.denomination
        },
        user: {
          name:  user.name,
          email: user.email
        },
        created_at: updated.created_at
      }
    })
  })

  // GET /transactions/user/:userId — history pembelian
  fastify.get('/transactions/user/:userId', async (request, reply) => {
    const { userId } = request.params
    const page   = parseInt(request.query.page  || '1',  10)
    const limit  = parseInt(request.query.limit || '10', 10)
    const offset = (page - 1) * limit

    const rows = await sql`
      SELECT * FROM transactions
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    const [{ total }] = await sql`
      SELECT COUNT(*)::int AS total FROM transactions WHERE user_id = ${userId}
    `

    return reply.send({
      transactions: rows,
      pagination: { page, limit, total }
    })
  })

  // GET /transactions/:id — detail transaksi
  fastify.get('/transactions/:id', async (request, reply) => {
    const { id } = request.params
    const rows = await sql`SELECT * FROM transactions WHERE id = ${id} LIMIT 1`
    if (rows.length === 0) return reply.status(404).send({ error: 'Transaksi tidak ditemukan' })
    return reply.send({ transaction: rows[0] })
  })
}
