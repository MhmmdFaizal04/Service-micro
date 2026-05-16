import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'

let instance = null

/**
 * Forward request ke upstream service menggunakan native fetch (Node 18+).
 * @param {object} request  - Fastify request
 * @param {object} reply    - Fastify reply
 * @param {string} url      - URL upstream lengkap
 * @param {object} [user]   - Decoded JWT payload (opsional)
 */
async function forward(request, reply, url, user = null) {
  const headers = { 'content-type': 'application/json', accept: 'application/json' }

  if (user) {
    if (user.id)    headers['x-user-id']    = String(user.id)
    if (user.email) headers['x-user-email'] = String(user.email)
    if (user.role)  headers['x-user-role']  = String(user.role)
  }

  const init = { method: request.method, headers }

  if (request.body !== undefined && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    init.body = JSON.stringify(request.body)
  }

  let response
  try {
    response = await fetch(url, init)
  } catch (err) {
    return reply.status(502).send({ error: 'Upstream service tidak dapat dihubungi' })
  }

  let data
  try {
    data = await response.json()
  } catch {
    data = { error: 'Upstream mengembalikan response tidak valid' }
  }

  return reply.status(response.status).send(data)
}

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

  // Blokir akses ke internal endpoints dari luar gateway
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.includes('/internal/')) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  })

  const authenticate = async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      return reply.status(401).send({ error: err.message || 'Token tidak valid' })
    }
  }

  // Ambil query string dari URL asli
  const qs = (req) => {
    const idx = req.url.indexOf('?')
    return idx !== -1 ? req.url.slice(idx) : ''
  }

  // ── AUTH (tanpa JWT) ─────────────────────────────────────────────────────────
  app.post('/api/auth/register', async (req, reply) =>
    forward(req, reply, `${USER_SERVICE_URL}/auth/register`))

  app.post('/api/auth/login', async (req, reply) =>
    forward(req, reply, `${USER_SERVICE_URL}/auth/login`))

  // ── USER (JWT wajib) ─────────────────────────────────────────────────────────
  app.get('/api/users/profile', { preHandler: [authenticate] }, async (req, reply) =>
    forward(req, reply, `${USER_SERVICE_URL}/users/profile`, req.user))

  app.put('/api/users/profile', { preHandler: [authenticate] }, async (req, reply) =>
    forward(req, reply, `${USER_SERVICE_URL}/users/profile`, req.user))

  // ── PRODUK (GET bebas, POST/PUT JWT wajib) ───────────────────────────────────
  app.get('/api/products', async (req, reply) =>
    forward(req, reply, `${MASTER_SERVICE_URL}/products${qs(req)}`))

  app.get('/api/products/:id', async (req, reply) =>
    forward(req, reply, `${MASTER_SERVICE_URL}/products/${req.params.id}`))

  app.post('/api/products', { preHandler: [authenticate] }, async (req, reply) =>
    forward(req, reply, `${MASTER_SERVICE_URL}/products`, req.user))

  app.put('/api/products/:id', { preHandler: [authenticate] }, async (req, reply) =>
    forward(req, reply, `${MASTER_SERVICE_URL}/products/${req.params.id}`, req.user))

  // ── TRANSAKSI (JWT wajib) ────────────────────────────────────────────────────
  app.post('/api/transactions', { preHandler: [authenticate] }, async (req, reply) =>
    forward(req, reply, `${TRANSACTION_SERVICE_URL}/transactions`, req.user))

  app.get('/api/transactions/user/:userId', { preHandler: [authenticate] }, async (req, reply) =>
    forward(req, reply, `${TRANSACTION_SERVICE_URL}/transactions/user/${req.params.userId}${qs(req)}`, req.user))

  app.get('/api/transactions/:id', { preHandler: [authenticate] }, async (req, reply) =>
    forward(req, reply, `${TRANSACTION_SERVICE_URL}/transactions/${req.params.id}`, req.user))

  // ── HEALTH ───────────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    service: 'api-gateway',
    upstream: { user: USER_SERVICE_URL, master: MASTER_SERVICE_URL, transaction: TRANSACTION_SERVICE_URL },
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
