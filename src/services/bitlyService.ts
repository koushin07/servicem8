import axios from 'axios';

const BITLY_TOKEN = process.env.BITLY_TOKEN;
const BITLY_API_URL = 'https://api-ssl.bitly.com/v4/shorten';

export async function shortenUrl(longUrl: string, name?: string, domain?: string): Promise<string> {
  if (!BITLY_TOKEN) {
    console.warn('No BITLY_TOKEN set, returning original URL');
    return longUrl;
  }
  try {
    const payload: any = { long_url: longUrl };
    let useDomain = domain || 'bit.ly';
    if (name) {
      payload.domain = useDomain;
      payload.custom_bitlink = `${useDomain}/${name}`;
    } else {
      payload.domain = useDomain;
    }
    const response = await axios.post(
      BITLY_API_URL,
      payload,
      { headers: { Authorization: `Bearer ${BITLY_TOKEN}`, 'Content-Type': 'application/json' } }
    );
    return response.data.link;
  } catch (err: any) {
    if (err.response?.data?.description) {
      console.error('Bitly shortening failed:', err.response.data.description);
    } else {
      console.error('Bitly shortening failed:', err.response?.data || err.message);
    }
    return longUrl;
  }
}
