const axios = require('axios');

const BITLY_TOKEN = process.env.BITLY_TOKEN;
const BITLY_API_URL = 'https://api-ssl.bitly.com/v4/shorten';

/**
 * Shorten a URL with Bitly, optionally using a custom name (back-half).
 * @param {string} longUrl - The original URL to shorten.
 * @param {string} [name] - Optional custom name for the short link (back-half).
 * @returns {Promise<string>} - The shortened URL, or the original if failed.
 */
async function shortenUrl(longUrl, name) {
  if (!BITLY_TOKEN) {
    console.warn('No BITLY_TOKEN set, returning original URL');
    return longUrl;
  }
  try {
    const payload = { long_url: longUrl };
    // Accept custom domain as third argument
    let domain = 'asaprwc.com';

    if (name) {
      payload.domain = domain;
      payload.custom_bitlink = `${domain}/${name}`;
    } else {
      payload.domain = domain;
    }
    const response = await axios.post(
      BITLY_API_URL,
      payload,
      { headers: { Authorization: `Bearer ${BITLY_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    return response.data.link;
  } catch (err) {
    if (err.response?.data?.description) {
      console.error('Bitly shortening failed:', err.response.data.description);
    } else {
      console.error('Bitly shortening failed:', err.response?.data || err.message);
    }
    return longUrl;
  }
}

module.exports = { shortenUrl };
