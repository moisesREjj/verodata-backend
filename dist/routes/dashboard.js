"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.use((0, auth_1.authorize)('ROLE_ADMIN', 'ROLE_ANALISTA'));
router.get('/resumen', async (_req, res) => {
    try {
        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        const { data: ventasMes } = await supabase_1.supabase
            .from('pedidos')
            .select('total, fecha')
            .gte('fecha', firstOfMonth)
            .eq('estado', 'Pagado');
        const ventasTotales = ventasMes?.reduce((s, p) => s + Number(p.total), 0) || 0;
        const totalPagados = ventasMes?.length || 0;
        const ticketPromedio = totalPagados > 0 ? ventasTotales / totalPagados : 0;
        const { data: ventasMesAnterior } = await supabase_1.supabase
            .from('pedidos')
            .select('total')
            .gte('fecha', firstOfPrevMonth)
            .lt('fecha', firstOfMonth)
            .eq('estado', 'Pagado');
        const ventasPrevias = ventasMesAnterior?.reduce((s, p) => s + Number(p.total), 0) || 0;
        const variacionVentas = ventasPrevias > 0 ? ((ventasTotales - ventasPrevias) / ventasPrevias) * 100 : 0;
        const { count: clientesNuevos } = await supabase_1.supabase
            .from('usuarios')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', firstOfMonth);
        const { count: clientesPrevios } = await supabase_1.supabase
            .from('usuarios')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', firstOfPrevMonth)
            .lt('created_at', firstOfMonth);
        const variacionClientes = clientesPrevios && clientesPrevios > 0
            ? (((clientesNuevos || 0) - clientesPrevios) / clientesPrevios) * 100
            : 0;
        const { data: ventas7Dias } = await supabase_1.supabase
            .from('pedidos')
            .select('total, fecha')
            .gte('fecha', sevenDaysAgo)
            .eq('estado', 'Pagado')
            .order('fecha', { ascending: true });
        const ventasPorDia = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            ventasPorDia[d.toISOString().slice(0, 10)] = 0;
        }
        for (const p of ventas7Dias || []) {
            const dia = p.fecha.slice(0, 10);
            if (ventasPorDia[dia] !== undefined)
                ventasPorDia[dia] += Number(p.total);
        }
        const promedio7Dias = Object.values(ventasPorDia).reduce((s, v) => s + v, 0) / 7;
        const ventasDiarias = Object.entries(ventasPorDia).map(([fecha, total]) => ({
            fecha,
            total: Math.round(total * 100) / 100,
            proyeccion: Math.round(promedio7Dias * 100) / 100,
        }));
        const { data: productos } = await supabase_1.supabase
            .from('productos')
            .select('id, nombre, stock')
            .lt('stock', 5)
            .order('stock', { ascending: true });
        const alertasStock = (productos || []).map((p) => ({
            ...p,
            nivel: p.stock === 0 ? 'sin_stock' : p.stock <= 2 ? 'critico' : 'bajo',
        }));
        const { data: itemsConCategoria } = await supabase_1.supabase
            .from('pedido_items')
            .select('id_producto, cantidad, productos!inner(id_categoria, categorias!inner(nombre))');
        const catVentas = {};
        for (const item of itemsConCategoria || []) {
            const prod = item.productos;
            const catNombre = prod.categorias?.nombre || 'Sin categoria';
            catVentas[catNombre] = (catVentas[catNombre] || 0) + item.cantidad;
        }
        const categoriasMasVendidas = Object.entries(catVentas)
            .map(([nombre, unidades]) => ({ nombre, unidades }))
            .sort((a, b) => b.unidades - a.unidades);
        const { count: carrito } = await supabase_1.supabase
            .from('pedidos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'Carrito');
        const { count: pagado } = await supabase_1.supabase
            .from('pedidos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'Pagado');
        const { count: enviado } = await supabase_1.supabase
            .from('pedidos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'Enviado');
        const { count: cancelado } = await supabase_1.supabase
            .from('pedidos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'Cancelado');
        res.json({
            ventas_totales: Math.round(ventasTotales * 100) / 100,
            variacion_ventas: Math.round(variacionVentas * 100) / 100,
            ticket_promedio: Math.round(ticketPromedio * 100) / 100,
            clientes_nuevos: clientesNuevos || 0,
            variacion_clientes: Math.round(variacionClientes * 100) / 100,
            ventas_diarias: ventasDiarias,
            alertas_stock: alertasStock,
            categorias_mas_vendidas: categoriasMasVendidas,
            pedidos_por_estado: [
                { estado: 'Carrito', cantidad: carrito || 0 },
                { estado: 'Pagado', cantidad: pagado || 0 },
                { estado: 'Enviado', cantidad: enviado || 0 },
                { estado: 'Cancelado', cantidad: cancelado || 0 },
            ],
        });
    }
    catch (err) {
        console.error('Error en dashboard/resumen:', err);
        res.status(500).json({ mensaje: 'Error al obtener datos del dashboard.' });
    }
});
router.get('/notificaciones', async (_req, res) => {
    try {
        const now = new Date();
        const { data: stockBajo } = await supabase_1.supabase
            .from('productos')
            .select('id, nombre, stock')
            .lt('stock', 5)
            .order('stock', { ascending: true })
            .limit(5);
        const { data: usuariosRecientes } = await supabase_1.supabase
            .from('usuarios')
            .select('id, nombre, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
        const { data: pedidosRecientes } = await supabase_1.supabase
            .from('pedidos')
            .select('id, codigo, total, estado, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
        const notificaciones = [];
        let id = 1;
        for (const p of stockBajo || []) {
            const minsAgo = Math.floor(Math.random() * 60);
            const texto = p.stock === 0
                ? `${p.nombre} sin stock`
                : `${p.nombre} con stock crítico (${p.stock} restantes)`;
            notificaciones.push({
                id: id++,
                tipo: 'stock',
                texto,
                tiempo: `Hace ${minsAgo} min`,
            });
        }
        for (const u of usuariosRecientes || []) {
            const diff = Math.floor((now.getTime() - new Date(u.created_at).getTime()) / 3600000);
            if (diff > 48)
                break;
            const tiempo = diff < 1 ? 'Hace unos minutos' : diff < 24 ? `Hace ${diff} horas` : 'Hace 1 día';
            notificaciones.push({
                id: id++,
                tipo: 'usuario',
                texto: `Nuevo usuario registrado: ${u.nombre}`,
                tiempo,
            });
        }
        for (const p of pedidosRecientes || []) {
            if (p.estado !== 'Pagado')
                continue;
            const diff = Math.floor((now.getTime() - new Date(p.created_at).getTime()) / 3600000);
            if (diff > 48)
                break;
            const tiempo = diff < 1 ? 'Hace unos minutos' : diff < 24 ? `Hace ${diff} horas` : 'Hace 1 día';
            notificaciones.push({
                id: id++,
                tipo: 'pedido',
                texto: `Pedido ${p.codigo} pagado - S/${Number(p.total).toFixed(2)}`,
                tiempo,
            });
        }
        res.json(notificaciones.slice(0, 10));
    }
    catch (err) {
        console.error('Error en notificaciones:', err);
        res.status(500).json({ mensaje: 'Error al obtener notificaciones.' });
    }
});
exports.default = router;
//# sourceMappingURL=dashboard.js.map