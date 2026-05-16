import sql from '../db.js'

export default async function userRoutes(fastify) {
  // GET /users/profile — header X-User-Id dikirim oleh API Gateway setelah verifikasi JWT
  fastify.get('/users/profile', async (request, reply) => {
    const userId = request.headers['x-user-id']
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' })

    const rows = await sql`
      SELECT id, name, email, phone, role, created_at, updated_at
      FROM users WHERE id = ${userId} LIMIT 1
    `
    if (rows.length === 0) return reply.status(404).send({ error: 'User tidak ditemukan' })

    return reply.send({ user: rows[0] })
  })

  // PUT /users/profile
  fastify.put('/users/profile', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name:  { type: 'string', minLength: 2, maxLength: 100 },
          phone: { type: 'string', maxLength: 20 }
        }
      }
    }
  }, async (request, reply) => {
    const userId = request.headers['x-user-id']
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' })

    const { name, phone } = request.body
    const rows = await sql`
      UPDATE users
      SET
        name       = COALESCE(${name ?? null}, name),
        phone      = COALESCE(${phone ?? null}, phone),
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, name, email, phone, role, updated_at
    `
    if (rows.length === 0) return reply.status(404).send({ error: 'User tidak ditemukan' })

    return reply.send({ message: 'Profil berhasil diupdate', user: rows[0] })
  })

  // GET /internal/users/:id — hanya dipanggil antar service (via internal network)
  fastify.get('/internal/users/:id', async (request, reply) => {
    const { id } = request.params
    const rows = await sql`
      SELECT id, name, email, phone, role
      FROM users WHERE id = ${id} LIMIT 1
    `
    if (rows.length === 0) return reply.status(404).send({ error: 'User tidak ditemukan' })

    return reply.send({ user: rows[0] })
  })
}
