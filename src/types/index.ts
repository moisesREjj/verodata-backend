export interface Role {
  id: number
  nombre: string
  created_at: string
}

export interface Usuario {
  id: number
  email: string
  password: string
  nombre: string
  id_rol: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Categoria {
  id: number
  nombre: string
  descripcion?: string
  created_at: string
}

export interface Producto {
  id: number
  nombre: string
  descripcion?: string
  precio: number
  stock: number
  imagen_url?: string
  id_categoria: number
  created_at: string
  updated_at: string
}

export interface Pedido {
  id: number
  codigo: string
  fecha: string
  estado: 'Carrito' | 'Pagado' | 'Enviado' | 'Cancelado'
  total: number
  id_usuario: number
  nombre_envio?: string
  direccion_envio?: string
  ciudad_envio?: string
  codigo_postal?: string
  telefono_envio?: string
  created_at: string
  updated_at: string
}

export interface PedidoItem {
  id: number
  id_pedido: number
  id_producto: number
  cantidad: number
  precio_unitario: number
  created_at: string
}

export interface Pago {
  id: number
  id_pedido: number
  monto: number
  metodo_pago: 'Tarjeta' | 'Yape' | 'Plin' | 'PagoEfectivo' | 'Transferencia'
  estado: 'Pendiente' | 'Aprobado' | 'Fallido' | 'Reembolsado'
  transaccion_id?: string
  codigo_error?: string
  mensaje_error?: string
  fecha_pago?: string
  created_at: string
}

export interface AuditoriaStock {
  id: number
  id_producto: number
  cantidad_anterior: number
  cantidad_nueva: number
  cantidad_cambio: number
  motivo: string
  created_at: string
}

export interface ReporteRotacionStock {
  id_producto: number
  producto: string
  unidades_vendidas: number
  unidades_repuestas: number
  stock_actual: number
}

export interface VentaFallidaPorMotivo {
  codigo_error: string
  mensaje_error: string
  total_fallidos: number
}

export interface JwtPayload {
  sub: string
  user_id: number
  id_rol: number
  nombre: string
  rol: string
  iat?: number
  exp?: number
}

export interface KpiData {
  ticket_promedio: number
  ingresos_totales: number
  tasa_conversion: number
  tasa_rechazo: number
}
