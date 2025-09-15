const express = require('express');
const router = express.Router();
const { handleSendEmailIfCompleted } = require('../controllers/webhookController');

router.post('/handleSendEmailIfCompleted', handleSendEmailIfCompleted);

module.exports = router;