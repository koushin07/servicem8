const express = require('express');
const router = express.Router();
const { handleSendEmailIfCompleted, handleBrevoEmail } = require('../controllers/webhookController');

router.post('/handleSendEmailIfCompleted', handleSendEmailIfCompleted);

router.post('/handleBrevoEmail', handleBrevoEmail)

module.exports = router;
