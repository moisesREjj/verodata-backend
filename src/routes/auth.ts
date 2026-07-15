import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabase } from '../config/supabase'
import { authenticate, authorize } from '../middleware/auth'
import { Usuario } from '../types'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'VeroData_Super_Secret_JWT_Key_2026'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ mensaje: 'Email y contraseña son requeridos.' })
      return
    }

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id, email, password, nombre, id_rol, activo, roles(nombre)') // <- Quitamo s el !inner
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    if (error) {
      console.error('Error en login query:', JSON.stringify(error, null, 2))
      res.status(500).json({ mensaje: 'Error del servidor.', detalle: error.message })
      return
    }

    if (!usuario) {
      res.status(404).json({ mensaje: 'El usuario con ese correo no está registrado.' })
      return
    }

    if (!usuario.activo) {
      res.status(403).json({ mensaje: 'La cuenta está desactivada.' })
      return
    }

    const passwordValida = await bcrypt.compare(password, usuario.password)
    if (!passwordValida) {
      res.status(401).json({ mensaje: 'Contraseña incorrecta.' })
      return
    }

    const rolNombre = (usuario as any).roles?.nombre || 'ROLE_CLIENTE'

    const token = jwt.sign(
      {
        sub: usuario.email,
        user_id: usuario.id,
        id_rol: usuario.id_rol,
        nombre: usuario.nombre,
        rol: rolNombre,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as any }
    )

    res.json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.nombre,
        rol: rolNombre,
      },
    })
  } catch (err) {
    console.error('Error en login:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.post('/registrar', async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, id_rol } = req.body

    if (!email || !password || !nombre) {
      res.status(400).json({ mensaje: 'Email, contraseña y nombre son requeridos.' })
      return
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const rolId = id_rol || 2

    const { data: usuario, error: insertError } = await supabase
      .from('usuarios')
      .insert({
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        nombre,
        id_rol: rolId,
      })
      .select('id, email, nombre, id_rol')
      .single()

    if (insertError) {
      console.error('Error al registrar en Supabase:', JSON.stringify(insertError, null, 2))

      if (insertError.code === '23505') {
        res.status(400).json({ mensaje: 'El email ya está registrado.' })
        return
      }

      res.status(500).json({
        mensaje: 'Error al registrar usuario.',
        detalle: insertError.message,
        code: insertError.code,
      })
      return
    }

    res.status(201).json({
      mensaje: 'Usuario registrado exitosamente',
      usuario,
    })
  } catch (err) {
    console.error('Error en registro:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/perfil', authenticate, async (req: Request, res: Response) => {
  try {
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id, email, nombre, id_rol, activo, created_at')
      .eq('id', req.user!.user_id)
      .single()

    if (error || !usuario) {
      res.status(404).json({ mensaje: 'Usuario no encontrado.' })
      return
    }

    res.json(usuario)
  } catch (err) {
    console.error('Error en perfil:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/usuarios', authenticate, authorize('ROLE_ADMIN'), async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, email, nombre, id_rol, activo, created_at, roles(nombre)')
      .order('id')

    if (error) {
      res.status(500).json({ mensaje: 'Error al obtener usuarios.' })
      return
    }

    res.json(data || [])
  } catch (err) {
    console.error('Error en GET /usuarios:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.get('/usuarios/:id', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, email, nombre, id_rol, activo, created_at, roles(nombre)')
      .eq('id', req.params.id)
      .single()

    if (error || !data) {
      res.status(404).json({ mensaje: 'Usuario no encontrado.' })
      return
    }

    res.json(data)
  } catch (err) {
    console.error('Error en GET /usuarios/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.put('/usuarios/:id', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { nombre, email, id_rol, activo } = req.body

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (nombre !== undefined) updates.nombre = nombre
    if (email !== undefined) updates.email = email
    if (id_rol !== undefined) updates.id_rol = id_rol
    if (activo !== undefined) updates.activo = activo

    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, email, nombre, id_rol, activo')
      .single()

    if (error || !data) {
      res.status(404).json({ mensaje: 'Usuario no encontrado.' })
      return
    }

    res.json(data)
  } catch (err) {
    console.error('Error en PUT /usuarios/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.delete('/usuarios/:id', authenticate, authorize('ROLE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', req.params.id)

    if (error) {
      res.status(500).json({ mensaje: 'Error al eliminar usuario.' })
      return
    }

    res.json({ mensaje: 'Usuario eliminado correctamente.' })
  } catch (err) {
    console.error('Error en DELETE /usuarios/:id:', err)
    res.status(500).json({ mensaje: 'Error interno del servidor.' })
  }
})

router.post('/fix-passwords', async (_req: Request, res: Response) => {
  try {
    const usuariosFix = [
      { email: 'admin@verodata2.com', password: 'admin123' },
      { email: 'carlos@cliente.com', password: 'cliente123' },
      { email: 'maria@cliente.com', password: 'cliente123' },
      { email: 'pedro@admin.com', password: 'admin123' },
      { email: 'analista@verodata.com', password: 'analista123' },
    ]

    const results: any[] = []
    for (const u of usuariosFix) {
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(u.password, salt)

      const { data, error } = await supabase
        .from('usuarios')
        .update({ password: hashedPassword })
        .eq('email', u.email)
        .select('id, email, nombre')

      if (error) {
        results.push({ email: u.email, success: false, error: error.message })
      } else {
        results.push({ email: u.email, success: true })
      }
    }

    res.json({ mensaje: 'Contraseñas actualizadas', results })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/debug', async (_req: Request, res: Response) => {
  try {
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id, email, nombre, id_rol, password')
      .limit(20)

    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('*')

    res.json({
      conexion_ok: !usuariosError && !rolesError,
      usuarios_muestra: usuarios ? usuarios.map((u: any) => ({ ...u, password: u.password ? u.password.substring(0, 30) + '...' : null })) : [],
      error_usuarios: usuariosError ? { code: usuariosError.code, message: usuariosError.message, details: usuariosError.details } : null,
      roles,
      error_roles: rolesError ? { code: rolesError.code, message: rolesError.message, details: rolesError.details } : null,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message, stack: err.stack })
  }
})

export default router
