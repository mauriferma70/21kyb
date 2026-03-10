// server/routes/admin.js — Rutas del panel de administración
const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const ctrl    = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');

// Multer — guardar Excel temporalmente
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) cb(null, true);
    else cb(new Error('Solo se aceptan archivos .xlsx o .xls'));
  }
});

// Auth (sin protección — son las rutas de login/status)
router.post('/login',         ctrl.login);
router.post('/logout',        ctrl.logout);
router.get('/session',        ctrl.sessionStatus);

// Todo lo demás requiere estar logueado
router.get('/dashboard',                       requireAdmin, ctrl.getDashboard);
router.get('/runners',                         requireAdmin, ctrl.getRunners);
router.post('/runners',                        requireAdmin, ctrl.addRunner);
router.put('/runners/:runner_id',              requireAdmin, ctrl.updateRunner);
router.get('/results',                         requireAdmin, ctrl.getResults);
router.post('/results',                        requireAdmin, ctrl.addResult);
router.put('/results/:id',                     requireAdmin, ctrl.updateResult);
router.post('/import', requireAdmin, upload.single('file'), ctrl.importExcel);
router.get('/duplicates',                      requireAdmin, ctrl.getDuplicates);
router.post('/duplicates/:id/resolve',         requireAdmin, ctrl.resolveDuplicate);

module.exports = router;
