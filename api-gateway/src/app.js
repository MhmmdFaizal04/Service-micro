import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import replyFrom from '@fastify/reply-from'

let instance = null

export async function getApp() {
  if (instance) return instance

  const {
    JWT_SECRET,
    USER_SERVICE_URL,
    MASTER_SERVICE_URL,
    TRANSACTION_SERVICE_URL
  } = process.env

  const app = Fastify({ logger: process.env.NODE_ENV !== 'production' })

  await app.register(fastifyCors, { origin: true })
  await app.register(fastifyJwt, { secret: JWT_SECRET })
  await app.register(replyFrom)

  // Pertahankan raw body sebagai Buffer agar bisa di-forward langsung
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body)
  })

  // Blokir akses langsung ke internal endpoints dari luar
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.includes('/internal/')) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  })

  // Helper: verifikasi JWT dan inject user info ke header
  const authenticate = async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      return reply.status(401).send({ error: err.message || 'Token tidak valid' })
    }
  }

  // Helper: buat rewriteRequestHeaders dengan user context
  const withUser = (req) => ({
    rewriteRequestHeaders: (_origReq, headers) => ({
      ...headers,
      'x-user-id':    req.user?.id,
      'x-user-email': req.user?.email,
      'x-user-role':  req.user?.role
    })
  })

  // ── AUTH (tidak butuh JWT) ───────────────────────────────────────────────────
  app.post('/api/auth/register', async (req, reply) =>
    reply.from(`${USER_SERVICE_URL}/auth/register`))

  app.post('/api/auth/login', async (req, reply) =>
    reply.from(`${USER_SERVICE_URL}/auth/login`))

  // ── USER (JWT wajib) ─────────────────────────────────────────────────────────
  app.get('/api/users/profile',
    { preHandler: [authenticate] },
    async (req, reply) => reply.from(`${USER_SERVICE_URL}/users/profile`, withUser(req))
  )

  app.put('/api/users/profile',
    { preHandler: [authenticate] },
    async (req, reply) => reply.from(`${USER_SERVICE_URL}/users/profile`, withUser(req))
  )

  // ── PRODUK (GET bebas, POST/PUT butuh JWT) ───────────────────────────────────
  app.get('/api/products', async (req, reply) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    return reply.from(`${MASTER_SERVICE_URL}/products${qs}`)
  })

  app.get('/api/products/:id', async (req, reply) =>
    reply.from(`${MASTER_SERVICE_URL}/products/${req.params.id}`))

  app.post('/api/products',
    { preHandler: [authenticate] },
    async (req, reply) => reply.from(`${MASTER_SERVICE_URL}/products`, withUser(req))
  )

  app.put('/api/products/:id',
    { preHandler: [authenticate] },
    async (req, reply) => reply.from(`${MASTER_SERVICE_URL}/products/${req.params.id}`, withUser(req))
  )

  // ── TRANSAKSI (JWT wajib) ────────────────────────────────────────────────────
  app.post('/api/transactions',
    { preHandler: [authenticate] },
    async (req, reply) => reply.from(`${TRANSACTION_SERVICE_URL}/transactions`, withUser(req))
  )

  app.get('/api/transactions/user/:userId',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
      return reply.from(
        `${TRANSACTION_SERVICE_URL}/transactions/user/${req.params.userId}${qs}`,
        withUser(req)
      )
    }
  )

  app.get('/api/transactions/:id',
    { preHandler: [authenticate] },
    async (req, reply) =>
      reply.from(`${TRANSACTION_SERVICE_URL}/transactions/${req.params.id}`, withUser(req))
  )

  // ── HEALTH ───────────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    service: 'api-gateway',
    upstream: {
      user:        USER_SERVICE_URL,
      master:      MASTER_SERVICE_URL,
      transaction: TRANSACTION_SERVICE_URL
    },
    timestamp: new Date().toISOString()
  }))

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Terjadi kesalahan server'
    })
  })

  await app.ready()
  instance = app
  return app
}
