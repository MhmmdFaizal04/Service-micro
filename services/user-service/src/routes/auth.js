import bcrypt from 'bcryptjs'
import sql from '../db.js'

export default async function authRoutes(fastify) {
  // POST /auth/register
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name:     { type: 'string', minLength: 2, maxLength: 100 },
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          phone:    { type: 'string', maxLength: 20 }
        }
      }
    }
  }, async (request, reply) => {
    const { name, email, password, phone } = request.body

    const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`
    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Email sudah terdaftar' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, phone)
      VALUES (${name}, ${email}, ${passwordHash}, ${phone ?? null})
      RETURNING id, name, email, phone, role, created_at
    `

    return reply.status(201).send({ message: 'Registrasi berhasil', user })
  })

  // POST /auth/login
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body

    const rows = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`
    if (rows.length === 0) {
      return reply.status(401).send({ error: 'Email atau password salah' })
    }

    const user = rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.status(401).send({ error: 'Email atau password salah' })
    }

    const token = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '7d' }
    )

    return reply.send({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }
    })
  })
}
