// smsSuppressionController.js
// Handles SMS STOP/UNSTOP and phone suppression
const fs = require('fs');
const path = require('path');

const smsSuppressionPath = path.join(__dirname, '../globals/smsSuppressionList.json');

function getSmsSuppressionList() {
  if (!fs.existsSync(smsSuppressionPath)) return [];
  return JSON.parse(fs.readFileSync(smsSuppressionPath, 'utf8'));
}

function saveSmsSuppressionList(list) {
  fs.writeFileSync(smsSuppressionPath, JSON.stringify(list, null, 2));
}

exports.handleInboundSms = (req, res) => {
  // Example: ServiceM8 or SMS provider webhook posts { from: "+61412345678", message: "STOP" }
  const { from, message } = req.body;
  if (!from || !message) return res.status(400).send('Missing from or message');
  let list = getSmsSuppressionList();
  if (/^stop$/i.test(message.trim())) {
    if (!list.includes(from)) list.push(from);
    saveSmsSuppressionList(list);
    return res.send('You have been unsubscribed from SMS.');
  }
  if (/^unstop$/i.test(message.trim())) {
    list = list.filter(num => num !== from);
    saveSmsSuppressionList(list);
    return res.send('You have been resubscribed to SMS.');
  }
  res.send('No action taken.');
};

exports.isSmsSuppressed = (phone) => {
  const list = getSmsSuppressionList();
  return list.includes(phone);
};
