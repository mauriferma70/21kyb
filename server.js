// server.js — Punto de entrada principal
const express = require('express');
const session = require('express-session');
const path    = require('path');

const apiRoutes   = require('./server/routes/api');
const adminRoutes = require('./server/routes/admin');
const rateLimit   = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Confiar en el proxy de Railway para que funcionen las cookies secure
app.set('trust proxy', 1);

app.use(session({
  secret:            process.env.SESSION_SECRET || 'secreto-21k-yb',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   8 * 60 * 60 * 1000, // 8 horas
  },
}));

// --- Archivos estáticos ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Limitadores de Tasa (Rate Limiting) ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 200, 
  message: { error: 'Demasiadas peticiones desde esta IP, por favor intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 intentos por 15 minutos para panel admin
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta más tarde.' },
});

// --- Rutas API ---
app.use('/api', apiLimiter, apiRoutes);
app.use('/api/admin/login', adminLoginLimiter);
app.use('/api/admin', adminRoutes);

// --- Rutas de páginas HTML ---
const sendPage = (page) => (req, res) =>
  res.sendFile(path.join(__dirname, 'public', page));

app.get('/',            sendPage('index.html'));
app.get('/buscar',      sendPage('buscar.html'));
app.get('/rankings',    sendPage('rankings.html'));
app.get('/admin',       sendPage('admin.html'));
app.get('/corredor/:id', sendPage('corredor.html'));

// Fallback 404
app.get('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Inicio del servidor ---
require('child_process').execSync('node init-db.js', { stdio: 'inherit' });

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
