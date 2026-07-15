import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.use(authenticate)

router.get('/mis-pedidos', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, pedido_items(*, productos(nombre, imagen_url))')
      .eq('id_usuario', req.user!.user_id)
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener pedidos.' })
      return
    }

    res.json(data || [])
  } catch (err) {
    console.error('Error en mis-pedidos:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/', authorize('ROLE_ADMIN', 'ROLE_ANALISTA'), async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, usuarios(nombre, email), pedido_items(*, productos(nombre))')
      .order('created_at', { ascending: false })

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener pedidos.' })
      return
    }

    res.json(data || [])
  } catch (err) {
    console.error('Error en GET /pedidos:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select('*, pedido_items(*, productos(nombre, imagen_url, precio))')
      .eq('id', req.params.id)
      .single()

    if (error || !data) {
      res.status(404).json({ mensaje: 'Pedido no encontrado.' })
      return
    }

    if (data.id_usuario !== req.user!.user_id && ![1, 3].includes(req.user!.id_rol)) {
      res.status(403).json({ mensaje: 'No tienes acceso a este pedido.' })
      return
    }

    res.json(data)
  } catch (err) {
    console.error('Error en GET /pedidos/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const { items, nombre_envio, direccion_envio, ciudad_envio, codigo_postal, telefono_envio } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ mensaje: 'Se requiere al menos un item en el pedido.' })
      return
    }

    let total = 0
    for (const item of items) {
      const { data: producto } = await supabase
        .from('productos')
        .select('precio, stock')
        .eq('id', item.id_producto)
        .single()

      if (!producto) {
        res.status(404).json({ mensaje: `Producto ID ${item.id_producto} no encontrado.` })
        return
      }

      if (producto.stock < (item.cantidad || 1)) {
        res.status(400).json({ mensaje: `Stock insuficiente para producto ID ${item.id_producto}.` })
        return
      }

      total += Number(producto.precio) * (item.cantidad || 1)
    }

    const codigo = `ORD-${String(Date.now()).slice(-6)}`

    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        codigo,
        estado: 'Carrito',
        total,
        id_usuario: req.user!.user_id,
        nombre_envio,
        direccion_envio,
        ciudad_envio,
        codigo_postal,
        telefono_envio,
      })
      .select()
      .single()

    if (pedidoError) {
      res.status(500).json({ mensaje: 'Error al crear pedido.' })
      return
    }

    const pedidoItems = items.map((item: any) => ({
      id_pedido: pedido.id,
      id_producto: item.id_producto,
      cantidad: item.cantidad || 1,
      precio_unitario: item.precio_unitario || 0,
    }))

    const { error: itemsError } = await supabase
      .from('pedido_items')
      .insert(pedidoItems)

    if (itemsError) {
      await supabase.from('pedidos').delete().eq('id', pedido.id)
      res.status(500).json({ mensaje: 'Error al agregar items al pedido.' })
      return
    }

    res.status(201).json(pedido)
  } catch (err) {
    console.error('Error en POST /pedidos:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.put('/:id/estado', authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { estado } = req.body
    const estadosValidos = ['Carrito', 'Pagado', 'Enviado', 'Cancelado']

    if (!estadosValidos.includes(estado)) {
      res.status(400).json({ mensaje: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` })
      return
    }

    const { data, error } = await supabase
      .from('pedidos')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error || !data) {
      res.status(404).json({ mensaje: 'Pedido no encontrado.' })
      return
    }

    res.json(data)
  } catch (err) {
    console.error('Error en PUT /pedidos/:id/estado:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

export default router
