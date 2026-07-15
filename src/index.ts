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

// 🌐 Configuración dinámica de CORS para Producción y Local
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL // 👈 Esta variable la configuraremos en Render con tu URL de Vercel
].filter(Boolean) as string[]; // Filtra valores undefined si la variable no está seteada en local

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (como herramientas Postman, llamadas móviles o del mismo servidor)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado por políticas de CORS de VeroData'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
  console.log(`VeroData Retail API corriendo en el puerto: ${PORT}`)
})

export default app