"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const pagos_1 = __importDefault(require("./routes/pagos"));
const analista_1 = __importDefault(require("./routes/analista"));
const productos_1 = __importDefault(require("./routes/productos"));
const pedidos_1 = __importDefault(require("./routes/pedidos"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true,
}));
app.use(express_1.default.json());
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'VeroData Retail API', version: '1.0.0' });
});
app.use('/api/auth', auth_1.default);
app.use('/api/pagos', pagos_1.default);
app.use('/api/analista', analista_1.default);
app.use('/api/productos', productos_1.default);
app.use('/api/pedidos', pedidos_1.default);
app.use('/api/dashboard', dashboard_1.default);
app.use((_req, res) => {
    res.status(404).json({ mensaje: 'Ruta no encontrada.' });
});
app.listen(PORT, () => {
    console.log(`VeroData Retail API corriendo en http://localhost:${PORT}`);
});
exports.default = app;
//# sourceMappingURL=index.js.map