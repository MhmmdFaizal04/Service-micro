import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import transactionRoutes from './routes/transactions.js'

let instance = null

export async function getApp() {
  if (instance) return instance

  const app = Fastify({ logger: process.env.NODE_ENV !== 'production' })

  await app.register(fastifyCors, { origin: true })
  await app.register(transactionRoutes)

  app.get('/health', async () => ({
    status: 'ok',
    service: 'transaction-service',
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
