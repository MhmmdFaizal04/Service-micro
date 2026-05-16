import 'dotenv/config'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'

let instance = null

export async function getApp() {
  if (instance) return instance

  const app = Fastify({ logger: process.env.NODE_ENV !== 'production' })

  await app.register(fastifyCors, { origin: true })
  await app.register(fastifyJwt, { secret: process.env.JWT_SECRET })
  await app.register(authRoutes)
  await app.register(userRoutes)

  app.get('/health', async () => ({
    status: 'ok',
    service: 'user-service',
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
