const axios = require('axios');
const qs = require('querystring');
const globalStore = require('../globals/globalStore');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SERVICEM8_AUTH_URL = 'https://go.servicem8.com/oauth/authorize';
const SERVICEM8_TOKEN_URL = 'https://go.servicem8.com/oauth/token';
const SERVICEM8_CUSTOMERS_URL = 'https://api.servicem8.com/api_1.0/company.json';


const auth = (req, res) => {
  const SCOPE = 'read_customers read_customer_contacts read_jobs manage_jobs create_jobs read_job_contacts manage_job_contacts read_job_queues manage_job_queues read_schedule manage_schedule read_staff read_job_categories manage_job_categories read_job_notes publish_job_notes read_attachments manage_attachments read_job_attachments publish_job_attachments publish_email publish_sms';
  
  const REDIRECT_URI = process.env.REDIRECT_URI;

  const authUrl = `${SERVICEM8_AUTH_URL}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`;
  res.redirect(authUrl);
}

const callback = async (req, res) => {
  const { code } = req.query;
  const REDIRECT_URI = process.env.REDIRECT_URI;
  try {
    const tokenRes = await axios.post(SERVICEM8_TOKEN_URL, qs.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    globalStore.access_token = tokenRes.data.access_token;
    res.send('OAuth successful! Now you can <a href="/customers">fetch customers</a>.');
  } catch (error) {
    res.status(500).send('OAuth failed');
  }
}


const customers = async (req, res) => {
  console.log("(globalStore.access_token", globalStore.access_token)
  if (!globalStore.access_token) return res.redirect('/auth');

  try {
    const response = await axios.get(SERVICEM8_CUSTOMERS_URL, {
      headers: {
        'Authorization': `Bearer ${globalStore.access_token}`,
        'Accept': 'application/json'
      }
    });

    const compId = "a82254d4-3438-4f4b-a2e3-231b2b97220b";

    const customerRes = await axios.get(`https://api.servicem8.com/api_1.0/company/${compId}.json`, {
      headers: {
        Authorization: `Bearer ${globalStore.access_token}`,
        Accept: 'application/json',
      }
    });

    const customer = customerRes.data;

    const queuedata = await axios.get(
      'https://api.servicem8.com/api_1.0/queue.json',{},
      {
        headers: {
          Authorization: `Bearer ${globalStore.access_token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
      }
    );

    console.log("queuedata", queuedata.data);

    res.json({cust: response.data, queue: queuedata.data, customer: customer});
  } catch (error) {
    console.log("error", error);
    res.status(500).send('Failed to fetch customers');
  }
}

module.exports = {
  auth,
  callback,
  customers
}