"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.authorize = authorize;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'VeroData_Super_Secret_JWT_Key_2026';
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ mensaje: 'Token no proporcionado.' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch {
        res.status(401).json({ mensaje: 'Token inválido o expirado.' });
    }
}
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ mensaje: 'No autenticado.' });
            return;
        }
        if (!roles.includes(req.user.rol)) {
            res.status(403).json({
                mensaje: `Acceso denegado. Se requiere uno de los roles: ${roles.join(', ')}`,
            });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map