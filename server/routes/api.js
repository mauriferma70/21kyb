// server/routes/api.js — Rutas públicas
const router = require('express').Router();
const { getRunner, searchRunner } = require('../controllers/runnersController');
const { historicalRanking, loyalRunners, progressionRanking } = require('../controllers/rankingsController');

// Corredor
router.get('/runner/:runner_id',  getRunner);
router.post('/search-runner',     searchRunner);

// Rankings públicos
router.get('/rankings/historical',  historicalRanking);
router.get('/rankings/loyal',       loyalRunners);
router.get('/rankings/progression', progressionRanking);

module.exports = router;
