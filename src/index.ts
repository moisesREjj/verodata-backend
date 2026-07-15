import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

import authRoutes from './routes/auth'
import pagoRoutes from './routes/pagos'
import analistaRoutes from './routes/analista'
import productRoutes from './routes/productos'
import pedidoRoutes from './routes/pedidos'
import dashboardRoutes from './routes/dashboard'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
}))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'VeroData Retail API', version: '1.0.0' })
})

app.use('/api/auth', authRoutes)
app.use('/api/pagos', pagoRoutes)
app.use('/api/analista', analistaRoutes)
app.use('/api/productos', productRoutes)
app.use('/api/pedidos', pedidoRoutes)
app.use('/api/dashboard', dashboardRoutes)

app.use((_req, res) => {
  res.status(404).json({ mensaje: 'Ruta no encontrada.' })
})

app.listen(PORT, () => {
  console.log(`VeroData Retail API corriendo en http://localhost:${PORT}`)
})

export default app
