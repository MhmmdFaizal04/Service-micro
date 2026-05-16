import { getApp } from '../src/app.js'

export default async function handler(req, res) {
  const app = await getApp()
  app.server.emit('request', req, res)
}
