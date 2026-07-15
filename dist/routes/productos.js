"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('productos')
            .select('*, categorias(nombre)')
            .order('id');
        if (error) {
            res.status(500).json({ mensaje: 'Error al obtener productos.' });
            return;
        }
        res.json(data || []);
    }
    catch (err) {
        console.error('Error en GET /productos:', err);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
});
router.get('/categorias', async (_req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('categorias')
            .select('*')
            .order('id');
        if (error) {
            res.status(500).json({ mensaje: 'Error al obtener categorías.' });
            return;
        }
        res.json(data || []);
    }
    catch (err) {
        console.error('Error en GET /categorias:', err);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('productos')
            .select('*, categorias(nombre)')
            .eq('id', req.params.id)
            .single();
        if (error || !data) {
            res.status(404).json({ mensaje: 'Producto no encontrado.' });
            return;
        }
        res.json(data);
    }
    catch (err) {
        console.error('Error en GET /productos/:id:', err);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
});
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('ROLE_ADMIN'), async (req, res) => {
    try {
        const { nombre, descripcion, precio, stock, imagen_url, id_categoria } = req.body;
        if (!nombre || !precio || !id_categoria) {
            res.status(400).json({ mensaje: 'nombre, precio e id_categoria son requeridos.' });
            return;
        }
        const { data, error } = await supabase_1.supabase
            .from('productos')
            .insert({ nombre, descripcion, precio, stock: stock || 0, imagen_url, id_categoria })
            .select('*, categorias(nombre)')
            .single();
        if (error) {
            res.status(500).json({ mensaje: 'Error al crear producto.' });
            return;
        }
        res.status(201).json(data);
    }
    catch (err) {
        console.error('Error en POST /productos:', err);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
});
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('ROLE_ADMIN'), async (req, res) => {
    try {
        const { nombre, descripcion, precio, stock, imagen_url, id_categoria } = req.body;
        const updates = { updated_at: new Date().toISOString() };
        if (nombre !== undefined)
            updates.nombre = nombre;
        if (descripcion !== undefined)
            updates.descripcion = descripcion;
        if (precio !== undefined)
            updates.precio = precio;
        if (stock !== undefined)
            updates.stock = stock;
        if (imagen_url !== undefined)
            updates.imagen_url = imagen_url;
        if (id_categoria !== undefined)
            updates.id_categoria = id_categoria;
        const { data, error } = await supabase_1.supabase
            .from('productos')
            .update(updates)
            .eq('id', req.params.id)
            .select('*, categorias(nombre)')
            .single();
        if (error || !data) {
            res.status(404).json({ mensaje: 'Producto no encontrado.' });
            return;
        }
        res.json(data);
    }
    catch (err) {
        console.error('Error en PUT /productos/:id:', err);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
});
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('ROLE_ADMIN'), async (req, res) => {
    try {
        const { error } = await supabase_1.supabase
            .from('productos')
            .delete()
            .eq('id', req.params.id);
        if (error) {
            res.status(500).json({ mensaje: 'Error al eliminar producto.' });
            return;
        }
        res.json({ mensaje: 'Producto eliminado correctamente.' });
    }
    catch (err) {
        console.error('Error en DELETE /productos/:id:', err);
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
});
exports.default = router;
//# sourceMappingURL=productos.js.map