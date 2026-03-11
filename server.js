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

app.use(session({
  secret:            process.env.SESSION_SECRET || 'secreto-21k-yb',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   8 * 60 * 60 * 1000, // 8 horas
  },
}));

// --- Archivos estáticos ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Rutas API ---
app.use('/api',       apiRoutes);
app.use('/api/admin', adminRoutes);

// --- Fallback: sirve index o buscar.html ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'buscar.html'));
});

// --- Inicio del servidor ---
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
