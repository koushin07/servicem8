import { Router, Request, Response, NextFunction } from 'express';
import { handleSendEmailIfCompleted, handleBrevoEmail } from './webhookController';
import { shortenUrlEndpoint } from './bitlyController';
import { unsubscribe } from './unsubscribeController';
import { handleInboundSms } from './smsSuppressionController';

const router = Router();

// Bitly shortener test endpoint
router.post('/shorten-url', shortenUrlEndpoint);

router.post('/handleSendEmailIfCompleted', handleSendEmailIfCompleted);
router.post('/handleBrevoEmail', handleBrevoEmail);

// Unsubscribe endpoint for email recipients
router.get('/unsubscribe', unsubscribe);

// SMS STOP/UNSTOP webhook endpoint
router.post('/sms-inbound', handleInboundSms);

export default router;
