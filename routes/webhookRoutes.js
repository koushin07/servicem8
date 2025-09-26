
const express = require('express');
const router = express.Router();
const { handleSendEmailIfCompleted, handleBrevoEmail } = require('../controllers/webhookController');
const unsubscribeController = require('../controllers/unsubscribeController');

router.post('/handleSendEmailIfCompleted', handleSendEmailIfCompleted);
router.post('/handleBrevoEmail', handleBrevoEmail);

// Unsubscribe endpoint for email recipients
router.get('/unsubscribe', unsubscribeController.unsubscribe);

module.exports = router;
