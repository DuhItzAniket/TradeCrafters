const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/tradeController');
const userController = require('../controllers/userController');

// Trade routes
router.post('/trade', tradeController.trade);
router.get('/portfolio/:username', tradeController.getPortfolio);
router.get('/transactions/:username', tradeController.getTransactions);
router.get('/stocks/chart/:symbol', tradeController.getChartData);

// Auth routes
router.post('/auth/register', userController.register);
router.post('/auth/login', userController.login);

module.exports = router;