import { Request, Response } from 'express';
import { shortenUrl } from '../services/bitlyService';

export const shortenUrlEndpoint = async (req: Request, res: Response) => {
  const { longUrl, name } = req.body as { longUrl?: string; name?: string };
  if (!longUrl) return res.status(400).json({ error: 'Missing longUrl' });
  try {
    const shortUrl = await shortenUrl(longUrl, name);
    res.json({ shortUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
