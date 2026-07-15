import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { authenticate, authorize } from '../middleware/auth'

const router = Router()

router.use(authenticate)
router.use(authorize('ROLE_ADMIN', 'ROLE_ANALISTA'))

function dateFilter(req: Request, defaultDias: number = 30) {
  const desde = req.query.desde as string | undefined
  const hasta = req.query.hasta as string | undefined
  return {
    desde: desde ? new Date(desde).toISOString() : new Date(Date.now() - defaultDias * 24 * 60 * 60 * 1000).toISOString(),
    hasta: hasta ? new Date(hasta + 'T23:59:59').toISOString() : new Date().toISOString(),
  }
}

async function pedidosEnRango(req: Request, res: Response, defaultDias?: number) {
  const { desde, hasta } = dateFilter(req, defaultDias)
  const { data, error } = await supabase
    .from('pedidos')
    .select('id')
    .eq('estado', 'Pagado')
    .gte('fecha', desde)
    .lte('fecha', hasta)

  if (error) {
    console.error('Error en pedidosEnRango:', error)
    return null
  }
  return data || []
}

router.get('/kpi', async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = dateFilter(req)

    const { data: ingresosDelPeriodo } = await supabase
      .from('pedidos')
      .select('total')
      .eq('estado', 'Pagado')
      .gte('fecha', desde)
      .lte('fecha', hasta)

    const ingresosTotales = ingresosDelPeriodo?.reduce((sum, p) => sum + Number(p.total), 0) || 0
    const totalPagados = ingresosDelPeriodo?.length || 0
    const ticketPromedio = totalPagados > 0 ? ingresosTotales / totalPagados : 0

    const { count: totalCarritos } = await supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'Carrito')

    const { count: totalPagadosTodo } = await supabase
      .from('pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'Pagado')

    const totalPedidos = (totalCarritos || 0) + (totalPagadosTodo || 0)
    const tasaConversion = totalPedidos > 0 ? ((totalPagadosTodo || 0) / totalPedidos) * 100 : 0

    const { data: pagosPeriodo } = await supabase
      .from('pagos')
      .select('estado')
      .gte('created_at', desde)
      .lte('created_at', hasta)

    const totalPagosPeriodo = pagosPeriodo?.length || 0
    const fallidosPeriodo = pagosPeriodo?.filter(p => p.estado === 'Fallido').length || 0
    const tasaRechazo = totalPagosPeriodo > 0 ? (fallidosPeriodo / totalPagosPeriodo) * 100 : 0

    res.json({
      ticket_promedio: Math.round(ticketPromedio * 100) / 100,
      ingresos_totales: Math.round(ingresosTotales * 100) / 100,
      tasa_conversion: Math.round(tasaConversion * 100) / 100,
      tasa_rechazo: Math.round(tasaRechazo * 100) / 100,
    })
  } catch (err) {
    console.error('Error en KPI:', err)
    res.status(500).json({ mensaje: 'Error al obtener KPIs.' })
  }
})

router.get('/errores-pago', async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = dateFilter(req)

    let query = supabase
      .from('pagos')
      .select('codigo_error, mensaje_error')
      .eq('estado', 'Fallido')

    query = query.gte('created_at', desde).lte('created_at', hasta)

    const { data, error } = await query

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener errores de pago.' })
      return
    }

    const agrupados: Record<string, { codigo_error: string; mensaje_error: string; total_fallidos: number }> = {}
    for (const p of data || []) {
      const key = p.codigo_error || 'DESCONOCIDO'
      if (!agrupados[key]) {
        agrupados[key] = { codigo_error: key, mensaje_error: p.mensaje_error || 'Error desconocido', total_fallidos: 0 }
      }
      agrupados[key].total_fallidos++
    }

    res.json(Object.values(agrupados))
  } catch (err) {
    console.error('Error en errores-pago:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/rotacion-stock', async (req: Request, res: Response) => {
  try {
    const ids = await pedidosEnRango(req, res)
    if (ids === null) { res.status(500).json({ mensaje: 'Error al obtener rotación de stock.' }); return }
    if (ids.length === 0) { res.json([]); return }

    const idList = ids.map(p => p.id)

    const { data: items, error } = await supabase
      .from('pedido_items')
      .select('id_producto, cantidad, productos!inner(nombre, stock)')
      .in('id_pedido', idList)

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener rotación de stock.' })
      return
    }

    const agrupados: Record<number, any> = {}
    for (const item of items || []) {
      const prod = item.productos as any
      if (!agrupados[item.id_producto]) {
        agrupados[item.id_producto] = {
          id_producto: item.id_producto,
          producto: prod.nombre,
          unidades_vendidas: 0,
          stock_actual: prod.stock,
        }
      }
      agrupados[item.id_producto].unidades_vendidas += item.cantidad
    }

    res.json(Object.values(agrupados).sort((a, b) => b.unidades_vendidas - a.unidades_vendidas))
  } catch (err) {
    console.error('Error en rotacion-stock:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/auditoria-stock', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 15
    const offset = (page - 1) * limit

    let query = supabase
      .from('auditoria_stock')
      .select('*, productos!inner(nombre)', { count: 'exact' })

    const { desde, hasta } = dateFilter(req, 90)
    query = query.gte('created_at', desde).lte('created_at', hasta)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener auditoría de stock.' })
      return
    }

    res.json({
      data: data || [],
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    })
  } catch (err) {
    console.error('Error en auditoria-stock:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/tendencia-ventas', async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = dateFilter(req)
    const desdeDate = new Date(desde)
    const hastaDate = new Date(hasta)
    const diffDias = Math.ceil((hastaDate.getTime() - desdeDate.getTime()) / (24 * 60 * 60 * 1000))

    const { data, error } = await supabase
      .from('pedidos')
      .select('fecha, total')
      .eq('estado', 'Pagado')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener tendencia de ventas.' })
      return
    }

    const ventasPorDia: Record<string, number> = {}
    for (let i = diffDias; i >= 0; i--) {
      const d = new Date(hastaDate.getTime() - i * 24 * 60 * 60 * 1000)
      ventasPorDia[d.toISOString().slice(0, 10)] = 0
    }
    for (const p of data || []) {
      const dia = new Date(p.fecha).toISOString().slice(0, 10)
      if (ventasPorDia[dia] !== undefined) ventasPorDia[dia] += Number(p.total)
    }

    res.json(Object.entries(ventasPorDia).map(([fecha, total]) => ({
      fecha,
      total: Math.round(total * 100) / 100,
    })))
  } catch (err) {
    console.error('Error en tendencia-ventas:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/ventas-por-categoria', async (req: Request, res: Response) => {
  try {
    const ids = await pedidosEnRango(req, res)
    if (ids === null) { res.status(500).json({ mensaje: 'Error al obtener ventas por categoría.' }); return }

    let query = supabase
      .from('pedido_items')
      .select('cantidad, precio_unitario, productos!inner(id_categoria, categorias!inner(nombre))')

    if (ids.length > 0) {
      query = query.in('id_pedido', ids.map(p => p.id))
    }

    const { data, error } = await query

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener ventas por categoría.' })
      return
    }

    const categorias: Record<string, { categoria: string; ingresos: number; unidades: number }> = {}
    for (const item of data || []) {
      const prod = item.productos as any
      const catNombre = prod.categorias?.nombre || 'Sin categoría'
      if (!categorias[catNombre]) {
        categorias[catNombre] = { categoria: catNombre, ingresos: 0, unidades: 0 }
      }
      categorias[catNombre].ingresos += Number(item.precio_unitario) * item.cantidad
      categorias[catNombre].unidades += item.cantidad
    }

    res.json(Object.values(categorias).sort((a, b) => b.ingresos - a.ingresos))
  } catch (err) {
    console.error('Error en ventas-por-categoria:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/tendencia-clientes', async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = dateFilter(req)
    const desdeDate = new Date(desde)
    const hastaDate = new Date(hasta)
    const diffDias = Math.ceil((hastaDate.getTime() - desdeDate.getTime()) / (24 * 60 * 60 * 1000))

    const { data, error } = await supabase
      .from('usuarios')
      .select('created_at')
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .order('created_at', { ascending: true })

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener tendencia de clientes.' })
      return
    }

    const clientesPorDia: Record<string, number> = {}
    for (let i = diffDias; i >= 0; i--) {
      const d = new Date(hastaDate.getTime() - i * 24 * 60 * 60 * 1000)
      clientesPorDia[d.toISOString().slice(0, 10)] = 0
    }
    for (const u of data || []) {
      const dia = new Date(u.created_at).toISOString().slice(0, 10)
      if (clientesPorDia[dia] !== undefined) clientesPorDia[dia]++
    }

    res.json(Object.entries(clientesPorDia).map(([fecha, nuevos]) => ({ fecha, nuevos })))
  } catch (err) {
    console.error('Error en tendencia-clientes:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/metodos-pago', async (req: Request, res: Response) => {
  try {
    const { desde, hasta } = dateFilter(req)

    const { data, error } = await supabase
      .from('pagos')
      .select('metodo_pago, monto')
      .eq('estado', 'Aprobado')
      .gte('created_at', desde)
      .lte('created_at', hasta)

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener métodos de pago.' })
      return
    }

    const metodos: Record<string, { metodo: string; total: number; cantidad: number }> = {}
    for (const p of data || []) {
      if (!metodos[p.metodo_pago]) {
        metodos[p.metodo_pago] = { metodo: p.metodo_pago, total: 0, cantidad: 0 }
      }
      metodos[p.metodo_pago].total += Number(p.monto)
      metodos[p.metodo_pago].cantidad++
    }

    res.json(Object.values(metodos).sort((a, b) => b.total - a.total))
  } catch (err) {
    console.error('Error en metodos-pago:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/productos-top', async (req: Request, res: Response) => {
  try {
    const ids = await pedidosEnRango(req, res)
    if (ids === null) { res.status(500).json({ mensaje: 'Error al obtener top productos.' }); return }

    let query = supabase
      .from('pedido_items')
      .select('id_producto, cantidad, precio_unitario, productos!inner(nombre, stock, precio)')

    if (ids.length > 0) {
      query = query.in('id_pedido', ids.map(p => p.id))
    }

    const { data, error } = await query

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener top productos.' })
      return
    }

    const productos: Record<number, any> = {}
    for (const item of data || []) {
      const prod = item.productos as any
      if (!productos[item.id_producto]) {
        productos[item.id_producto] = {
          id: item.id_producto,
          nombre: prod.nombre,
          unidades_vendidas: 0,
          ingresos: 0,
          stock: prod.stock,
          precio: Number(prod.precio),
        }
      }
      productos[item.id_producto].unidades_vendidas += item.cantidad
      productos[item.id_producto].ingresos += Number(item.precio_unitario) * item.cantidad
    }

    const lista = Object.values(productos)
    res.json({
      top: lista.sort((a, b) => b.ingresos - a.ingresos).slice(0, 10),
      bottom: lista.sort((a, b) => a.ingresos - b.ingresos).slice(0, 10),
    })
  } catch (err) {
    console.error('Error en productos-top:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

export default router
