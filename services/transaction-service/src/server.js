import 'dotenv/config'
import { getApp } from './app.js'

const app = await getApp()
const port = parseInt(process.env.PORT || '3003', 10)
await app.listen({ port, host: '0.0.0.0' })
console.log(`✅ Transaction Service berjalan di http://localhost:${port}`)
