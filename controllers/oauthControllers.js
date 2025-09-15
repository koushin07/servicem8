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
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>OAuth Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f9fafb;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
          }
          h1 {
            color: #16a34a;
          }
          p {
            margin: 1rem 0;
            color: #374151;
          }
          a {
            display: inline-block;
            margin-top: 1rem;
            padding: 0.5rem 1rem;
            background: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            transition: background 0.2s;
          }
          a:hover {
            background: #1d4ed8;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ Connected Successfully!</h1>
          <p>Your ServiceM8 account is now linked.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>OAuth Failed</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f9fafb;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
          }
          h1 {
            color: #dc2626;
          }
          p {
            margin: 1rem 0;
            color: #374151;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>❌ Connection Failed</h1>
          <p>We couldn't complete the connection. Please try again.</p>
        </div>
      </body>
      </html>
    `);
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