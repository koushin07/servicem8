const express = require('express');
const router = express.Router();
const { auth, callback, customers } = require('../controllers/oauthControllers.js');

router.get('/auth', auth);

router.get('/callback', callback);

router.get('/customers', customers);

module.exports = router;