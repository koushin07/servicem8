// unsubscribeController.js
// Handles unsubscribe and preferences for email recipients
const fs = require('fs');
const path = require('path');

// In-memory suppression list for demo (replace with DB in production)
const suppressionListPath = path.join(__dirname, '../globals/suppressionList.json');
function getSuppressionList() {
  if (!fs.existsSync(suppressionListPath)) return [];
  return JSON.parse(fs.readFileSync(suppressionListPath, 'utf8'));
}
function saveSuppressionList(list) {
  fs.writeFileSync(suppressionListPath, JSON.stringify(list, null, 2));
}

exports.unsubscribe = (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).send('Missing email');
  let list = getSuppressionList();
  if (!list.includes(email)) list.push(email);
  saveSuppressionList(list);
  res.send('You have been unsubscribed.');
};

exports.isSuppressed = (email) => {
  const list = getSuppressionList();
  return list.includes(email);
};
