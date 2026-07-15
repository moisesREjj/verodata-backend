"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const supabase_1 = require("../config/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const ERRORES_SIMULADOS = {
    '4000000000000002': { codigo: 'FNDS_INSUF', mensaje: 'Fondos insuficientes en la cuenta' },
    '4000000000000003': { codigo: 'TARJETA_VENC', mensaje: 'La tarjeta ha vencido' },
    '4000000000000004': { codigo: 'RECHAZADA', mensaje: 'Transacción rechazada por el banco emisor' },
    '4000000000000005': { codigo: 'LIMITE_EXCED', mensaje: 'Límite de crédito excedido' },
};
function simularPago(metodoPago, datosPago) {
    if (metodoPago === 'Yape' || metodoPago === 'Plin') {
        const telefono = datosPago?.telefono || '';
        if (telefono.length < 9) {
            return {
                exitoso: false,
                error: { codigo: 'TELF_INVAL', mensaje: 'Número de teléfono inválido' },
            };
        }
        return {
            exitoso: true,
            transaccionId: `TXN-${(0, uuid_1.v4)().slice(0, 8).toUpperCase()}`,
        };
    }
    if (metodoPago === 'Tarjeta') {
        const numeroTarjeta = datosPago?.numeroTarjeta?.replace(/\s/g, '') || '';
        const errorSimulado = ERRORES_SIMULADOS[numeroTarjeta];
        if (errorSimulado) {
            return { exitoso: false, error: errorSimulado };
        }
        return {
            exitoso: true,
            transaccionId: `TXN-${(0, uuid_1.v4)().slice(0, 8).toUpperCase()}`,
        };
    }
    if (metodoPago === 'PagoEfectivo' || metodoPago === 'Transferencia') {
        return {
            exitoso: true,
            transaccionId: `TXN-${(0, uuid_1.v4)().slice(0, 8).toUpperCase()}`,
            error: undefined,
        };
    }
    return {
        exitoso: false,
        error: { codigo: 'METODO_INVAL', mensaje: 'Método de pago no soportado' },
    };
}
router.post('/procesar', auth_1.authenticate, async (req, res) => {
    try {
        const { pedido_id, metodo_pago, datos_pago } = req.body;
        if (!pedido_id || !metodo_pago) {
            res.status(400).json({ mensaje: 'pedido_id y metodo_pago son requeridos.' });
            return;
        }
        const metodosValidos = ['Tarjeta', 'Yape', 'Plin', 'PagoEfectivo', 'Transferencia'];
        if (!metodosValidos.includes(metodo_pago)) {
            res.status(400).json({
                mensaje: `Método de pago inválido. Válidos: ${metodosValidos.join(', ')}`,
            });
            return;
        }
        const { data: pedido, error: pedidoError } = await supabase_1.supabase
            .from('pedidos')
            .select('id, codigo, estado, total, id_usuario')
            .eq('id', pedido_id)
            .single();
        if (pedidoError || !pedido) {
            res.status(404).json({ mensaje: 'Pedido no encontrado.' });
            return;
        }
        if (pedido.id_usuario !== req.user.user_id) {
            res.status(403).json({ mensaje: 'Este pedido no te pertenece.' });
            return;
        }
        if (pedido.estado !== 'Carrito') {
            res.status(400).json({
                mensaje: `El pedido ya está en estado "${pedido.estado}". No se puede procesar el pago.`,
            });
            return;
        }
        const resultado = simularPago(metodo_pago, datos_pago);
        if (resultado.exitoso) {
            const { data: items, error: itemsError } = await supabase_1.supabase
                .from('pedido_items')
                .select('id_producto, cantidad')
                .eq('id_pedido', pedido_id);
            if (itemsError) {
                res.status(500).json({ mensaje: 'Error al obtener items del pedido.' });
                return;
            }
            const erroresStock = [];
            for (const item of items || []) {
                const { data: producto } = await supabase_1.supabase
                    .from('productos')
                    .select('id, nombre, stock')
                    .eq('id', item.id_producto)
                    .single();
                if (!producto) {
                    erroresStock.push(`Producto ID ${item.id_producto} no encontrado`);
                    continue;
                }
                if (producto.stock < item.cantidad) {
                    erroresStock.push(`Stock insuficiente para "${producto.nombre}": disponible ${producto.stock}, requerido ${item.cantidad}`);
                }
            }
            if (erroresStock.length > 0) {
                res.status(400).json({
                    mensaje: 'Error de stock',
                    errores: erroresStock,
                });
                return;
            }
            for (const item of items || []) {
                const { data: producto } = await supabase_1.supabase
                    .from('productos')
                    .select('stock')
                    .eq('id', item.id_producto)
                    .single();
                if (!producto)
                    continue;
                const cantidadAnterior = producto.stock;
                const cantidadNueva = cantidadAnterior - item.cantidad;
                await supabase_1.supabase
                    .from('productos')
                    .update({ stock: cantidadNueva, updated_at: new Date().toISOString() })
                    .eq('id', item.id_producto);
                await supabase_1.supabase.from('auditoria_stock').insert({
                    id_producto: item.id_producto,
                    cantidad_anterior: cantidadAnterior,
                    cantidad_nueva: cantidadNueva,
                    cantidad_cambio: -item.cantidad,
                    motivo: `Venta - Pedido ${pedido.codigo}`,
                });
            }
            await supabase_1.supabase
                .from('pedidos')
                .update({
                estado: 'Pagado',
                updated_at: new Date().toISOString(),
            })
                .eq('id', pedido_id);
            await supabase_1.supabase.from('pagos').insert({
                id_pedido: pedido_id,
                monto: pedido.total,
                metodo_pago,
                estado: 'Aprobado',
                transaccion_id: resultado.transaccionId,
                fecha_pago: new Date().toISOString(),
            });
            res.json({
                mensaje: 'Pago procesado exitosamente',
                transaccion_id: resultado.transaccionId,
                pedido_estado: 'Pagado',
            });
        }
        else {
            const errorData = resultado.error;
            await supabase_1.supabase.from('pagos').insert({
                id_pedido: pedido_id,
                monto: pedido.total,
                metodo_pago,
                estado: 'Fallido',
                codigo_error: errorData.codigo,
                mensaje_error: errorData.mensaje,
            });
            res.status(402).json({
                mensaje: 'Pago rechazado',
                error: errorData,
            });
        }
    }
    catch (err) {
        console.error('Error en procesar pago:', err);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
});
exports.default = router;
//# sourceMappingURL=pagos.js.map