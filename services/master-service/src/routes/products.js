import sql from '../db.js'

export default async function productRoutes(fastify) {
  // GET /products — list semua produk
  fastify.get('/products', async (request, reply) => {
    const { is_active } = request.query

    const rows = is_active !== undefined
      ? await sql`SELECT * FROM token_products WHERE is_active = ${is_active === 'true'} ORDER BY denomination ASC`
      : await sql`SELECT * FROM token_products ORDER BY denomination ASC`

    return reply.send({ products: rows })
  })

  // GET /products/:id
  fastify.get('/products/:id', async (request, reply) => {
    const { id } = request.params
    const rows = await sql`SELECT * FROM token_products WHERE id = ${id} LIMIT 1`
    if (rows.length === 0) return reply.status(404).send({ error: 'Produk tidak ditemukan' })
    return reply.send({ product: rows[0] })
  })

  // POST /products — tambah produk baru
  fastify.post('/products', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'denomination', 'price'],
        properties: {
          name:         { type: 'string', minLength: 3 },
          denomination: { type: 'integer', minimum: 1 },
          price:        { type: 'number',  minimum: 0 },
          stock:        { type: 'integer', minimum: 0 }
        }
      }
    }
  }, async (request, reply) => {
    const { name, denomination, price, stock = 0 } = request.body
    const [product] = await sql`
      INSERT INTO token_products (name, denomination, price, stock)
      VALUES (${name}, ${denomination}, ${price}, ${stock})
      RETURNING *
    `
    return reply.status(201).send({ message: 'Produk berhasil dibuat', product })
  })

  // PUT /products/:id — update produk
  fastify.put('/products/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name:         { type: 'string' },
          denomination: { type: 'integer', minimum: 1 },
          price:        { type: 'number',  minimum: 0 },
          stock:        { type: 'integer', minimum: 0 },
          is_active:    { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    const { name, denomination, price, stock, is_active } = request.body

    const rows = await sql`
      UPDATE token_products
      SET
        name         = COALESCE(${name ?? null},         name),
        denomination = COALESCE(${denomination ?? null}, denomination),
        price        = COALESCE(${price ?? null},        price),
        stock        = COALESCE(${stock ?? null},        stock),
        is_active    = COALESCE(${is_active ?? null},    is_active),
        updated_at   = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    if (rows.length === 0) return reply.status(404).send({ error: 'Produk tidak ditemukan' })

    return reply.send({ message: 'Produk berhasil diupdate', product: rows[0] })
  })

  // ── Internal endpoints (dipanggil oleh transaction-service) ──────────────────

  // GET /internal/products/:id
  fastify.get('/internal/products/:id', async (request, reply) => {
    const { id } = request.params
    const rows = await sql`
      SELECT * FROM token_products
      WHERE id = ${id} AND is_active = true
      LIMIT 1
    `
    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Produk tidak ditemukan atau tidak aktif' })
    }
    return reply.send({ product: rows[0] })
  })

  // PATCH /internal/products/:id/stock — kurangi stok (atomic check)
  fastify.patch('/internal/products/:id/stock', {
    schema: {
      body: {
        type: 'object',
        required: ['quantity'],
        properties: { quantity: { type: 'integer', minimum: 1 } }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params
    const { quantity } = request.body

    const rows = await sql`
      UPDATE token_products
      SET stock = stock - ${quantity}, updated_at = NOW()
      WHERE id = ${id} AND stock >= ${quantity}
      RETURNING *
    `
    if (rows.length === 0) {
      return reply.status(400).send({ error: 'Stok tidak cukup atau produk tidak ditemukan' })
    }
    return reply.send({ message: 'Stok berhasil diperbarui', product: rows[0] })
  })
}
