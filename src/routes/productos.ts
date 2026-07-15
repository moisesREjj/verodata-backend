import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*, categorias(nombre)')
      .order('id')

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener productos.' })
      return
    }

    res.json(data || [])
  } catch (err) {
    console.error('Error en GET /productos:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/categorias', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('categorias')
      .select('*')
      .order('id')

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener categorías.' })
      return
    }

    res.json(data || [])
  } catch (err) {
    console.error('Error en GET /categorias:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.post('/categorias', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { nombre, descripcion } = req.body

    if (!nombre) {
      res.status(400).json({ mensaje: 'nombre es requerido.' })
      return
    }

    const { data, error } = await supabase
      .from('categorias')
      .insert({ nombre, descripcion })
      .select()
      .single()

    if (error) {
      res.status(500).json({ mensaje: 'Error al crear categoría.' })
      return
    }

    res.status(201).json(data)
  } catch (err) {
    console.error('Error en POST /categorias:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.put('/categorias/:id', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { nombre, descripcion } = req.body
    const updates: Record<string, any> = {}
    if (nombre !== undefined) updates.nombre = nombre
    if (descripcion !== undefined) updates.descripcion = descripcion

    const { data, error } = await supabase
      .from('categorias')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error || !data) {
      res.status(404).json({ mensaje: 'Categoría no encontrada.' })
      return
    }

    res.json(data)
  } catch (err) {
    console.error('Error en PUT /categorias/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.delete('/categorias/:id', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('categorias')
      .delete()
      .eq('id', req.params.id)

    if (error) {
      res.status(500).json({ mensaje: 'Error al eliminar categoría.' })
      return
    }

    res.json({ mensaje: 'Categoría eliminada correctamente.' })
  } catch (err) {
    console.error('Error en DELETE /categorias/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.put('/:id/stock', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { stock, motivo } = req.body

    if (stock === undefined || stock === null) {
      res.status(400).json({ mensaje: 'stock es requerido.' })
      return
    }

    if (!motivo) {
      res.status(400).json({ mensaje: 'motivo es requerido.' })
      return
    }

    const { data: producto, error: findError } = await supabase
      .from('productos')
      .select('id, nombre, stock')
      .eq('id', req.params.id)
      .single()

    if (findError || !producto) {
      res.status(404).json({ mensaje: 'Producto no encontrado.' })
      return
    }

    const cantidadAnterior = producto.stock
    const cantidadNueva = Number(stock)
    const cantidadCambio = cantidadNueva - cantidadAnterior

    const { data, error } = await supabase
      .from('productos')
      .update({ stock: cantidadNueva, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*, categorias(nombre)')
      .single()

    if (error || !data) {
      res.status(500).json({ mensaje: 'Error al actualizar stock.' })
      return
    }

    await supabase.from('auditoria_stock').insert({
      id_producto: Number(req.params.id),
      cantidad_anterior: cantidadAnterior,
      cantidad_nueva: cantidadNueva,
      cantidad_cambio: cantidadCambio,
      motivo: `Ajuste manual: ${motivo}`,
    })

    res.json(data)
  } catch (err) {
    console.error('Error en PUT /productos/:id/stock:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('*, categorias(nombre)')
      .eq('id', req.params.id)
      .single()

    if (error || !data) {
      res.status(404).json({ mensaje: 'Producto no encontrado.' })
      return
    }

    res.json(data)
  } catch (err) {
    console.error('Error en GET /productos/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.post('/', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { nombre, descripcion, precio, stock, imagen_url, id_categoria } = req.body

    if (!nombre || !precio || !id_categoria) {
      res.status(400).json({ mensaje: 'nombre, precio e id_categoria son requeridos.' })
      return
    }

    const { data, error } = await supabase
      .from('productos')
      .insert({ nombre, descripcion, precio, stock: stock || 0, imagen_url, id_categoria })
      .select('*, categorias(nombre)')
      .single()

    if (error) {
      res.status(500).json({ mensaje: 'Error al crear producto.' })
      return
    }

    res.status(201).json(data)
  } catch (err) {
    console.error('Error en POST /productos:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.put('/:id', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { nombre, descripcion, precio, stock, imagen_url, id_categoria } = req.body

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (nombre !== undefined) updates.nombre = nombre
    if (descripcion !== undefined) updates.descripcion = descripcion
    if (precio !== undefined) updates.precio = precio
    if (stock !== undefined) updates.stock = stock
    if (imagen_url !== undefined) updates.imagen_url = imagen_url
    if (id_categoria !== undefined) updates.id_categoria = id_categoria

    const { data, error } = await supabase
      .from('productos')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, categorias(nombre)')
      .single()

    if (error || !data) {
      res.status(404).json({ mensaje: 'Producto no encontrado.' })
      return
    }

    res.json(data)
  } catch (err) {
    console.error('Error en PUT /productos/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.delete('/:id', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', req.params.id)

    if (error) {
      res.status(500).json({ mensaje: 'Error al eliminar producto.' })
      return
    }

    res.json({ mensaje: 'Producto eliminado correctamente.' })
  } catch (err) {
    console.error('Error en DELETE /productos/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

export default router
