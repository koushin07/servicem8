import { Router, Request, Response, NextFunction } from 'express';
import { auth, callback, customers  } from './oauthControllers';

const router = Router();

router.get('/auth', auth);

// OAuth callback route
router.get('/callback', callback);

router.get('/customers', customers);

export default router;
