// server.js — Punto de entrada principal
const express = require('express');
const session = require('express-session');
const path    = require('path');

const apiRoutes   = require('./server/routes/api');
const adminRoutes = require('./server/routes/admin');

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

// --- Rutas API ---
app.use('/api',       apiRoutes);
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
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
