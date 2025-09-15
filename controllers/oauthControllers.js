const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SERVICEM8_AUTH_URL = 'https://go.servicem8.com/oauth/authorize';
const SERVICEM8_TOKEN_URL = 'https://go.servicem8.com/oauth/token';
const SERVICEM8_CUSTOMERS_URL = 'https://api.servicem8.com/api_1.0/company.json';

const TOKEN_FILE = path.join(__dirname, "../tokens.json");

// 🔹 Load saved tokens if available
function loadTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  }
  return {};
}

// 🔹 Save tokens persistently
function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

let tokenStore = loadTokens();

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

    tokenStore = {
      access_token: tokenRes.data.access_token,
      refresh_token: tokenRes.data.refresh_token,
    };
    saveTokens(tokenStore);

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

async function ensureToken() {
  try {
    // Test if current access token still works
    if (tokenStore.access_token) {
      await axios.get(SERVICEM8_CUSTOMERS_URL, {
        headers: { Authorization: `Bearer ${tokenStore.access_token}` },
      });
      return tokenStore.access_token;
    }
  } catch (err) {
    if (err.response?.status !== 401) throw err;
  }

  // 🔄 If expired or missing, refresh with refresh_token
  if (!tokenStore.refresh_token) {
    throw new Error("No refresh token available. Please run /auth again.");
  }

  console.log("🔄 Refreshing ServiceM8 token...");
  const tokenRes = await axios.post(
    SERVICEM8_TOKEN_URL,
    qs.stringify({
      grant_type: "refresh_token",
      refresh_token: tokenStore.refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  tokenStore.access_token = tokenRes.data.access_token;
  if (tokenRes.data.refresh_token) {
    tokenStore.refresh_token = tokenRes.data.refresh_token; // rotate if provided
  }
  saveTokens(tokenStore);
  return tokenStore.access_token;
}

async function authHeaders() {
  const token = await ensureToken();
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
}


const customers = async (req, res) => {
  try {
    const headers = await authHeaders();
    const { data } = await axios.get(SERVICEM8_CUSTOMERS_URL, { headers });
    res.json(data);
  } catch (error) {
    console.error("Customer fetch failed:", error.response?.data || error.message);
    res.status(500).send("Failed to fetch customers");
  }
};

module.exports = {
  auth,
  callback,
  customers,
  ensureToken, 
  authHeaders
}