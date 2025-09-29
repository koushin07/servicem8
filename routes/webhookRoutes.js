
const express = require('express');
const router = express.Router();

const { handleSendEmailIfCompleted, handleBrevoEmail } = require('../controllers/webhookController');
const { shortenUrlEndpoint } = require('../controllers/bitlyController');
// Bitly shortener test endpoint
router.post('/shorten-url', shortenUrlEndpoint);
const unsubscribeController = require('../controllers/unsubscribeController');
const smsSuppressionController = require('../controllers/smsSuppressionController');

router.post('/handleSendEmailIfCompleted', handleSendEmailIfCompleted);
router.post('/handleBrevoEmail', handleBrevoEmail);


// Unsubscribe endpoint for email recipients
router.get('/unsubscribe', unsubscribeController.unsubscribe);

// SMS STOP/UNSTOP webhook endpoint
router.post('/sms-inbound', smsSuppressionController.handleInboundSms);

module.exports = router;
