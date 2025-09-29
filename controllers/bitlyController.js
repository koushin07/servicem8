const { shortenUrl } = require('../services/bitlyService');

// POST /shorten-url
// Body: { longUrl: string, name?: string }
exports.shortenUrlEndpoint = async (req, res) => {
  const { longUrl, name } = req.body;
  if (!longUrl) return res.status(400).json({ error: 'Missing longUrl' });
  try {
    const shortUrl = await shortenUrl(longUrl, name);
    res.json({ shortUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
