const axios = require('axios');
const jwt = require('jsonwebtoken');
const globalStore = require('../globals/globalStore');

// ------------------ Helpers ------------------
function authHeaders(isFile = false) {
  return {
    Authorization: `Bearer ${globalStore.access_token}`,
    Accept: 'application/json',
    ...(isFile && { 'Content-Type': 'multipart/form-data' }),
  };
}

const handleSendEmailIfCompleted = async (req, res) => {
  try {
    const jwtRaw = Object.keys(req.body)[0];
    const decoded = jwt.decode(jwtRaw, { json: true });
    const jobUuid = decoded.eventArgs.entry[0].uuid;

    const { data: existingJob } = await axios.get(
      `https://api.servicem8.com/api_1.0/job/${jobUuid}.json`,
      { headers: authHeaders() }
    );

    console.log("jobUuid", jobUuid);
    console.log("existingJob.status", existingJob.status);

    if (existingJob.status === "Completed") {
      const { data: contacts } = await axios.get(
        `https://api.servicem8.com/api_1.0/jobcontact.json?$filter=job_uuid eq ${jobUuid}`,
        { headers: authHeaders() }
      );

      const primaryContact = (contacts || []).find((c) => c.email || c.mobile || c.phone);

      if (!primaryContact) {
        console.log("⚠️ No contact found for job");
        return res.sendStatus(200);
      }

      //Sending email
      let emailSent = false;
      if (primaryContact.email) {
        try {
          console.log(`Attempting to send email to ${primaryContact.email}`);
          await axios.post(
            "https://api.servicem8.com/platform_service_email",
            {
              to: primaryContact.email,
              subject: `Job Completed: ${existingJob.job_address}`,
              textBody: `Hello ${primaryContact.first || ""}, your job at ${existingJob.job_address} has been marked as Completed.`,
              regardingJobUUID: jobUuid,
            },
            { headers: authHeaders() }
          );
          console.log(`ServiceM8 email sent to ${primaryContact.email}`);
          emailSent = true;
        } catch (err) {
          console.error("❌ Failed to send email", err.response?.data || err.message);
        }
      }

      //Send SMS
      if ((primaryContact.mobile || primaryContact.phone)) {
        const smsNumber = primaryContact.mobile || primaryContact.phone;
        try {
          console.log(`Attempting to send SMS to ${smsNumber}`);
          await axios.post(
            "https://api.servicem8.com/platform_service_sms",
            {
              to: smsNumber,
              message: `Hi ${primaryContact.first || ""}, your job at ${existingJob.job_address} is now completed.`,
              regardingJobUUID: jobUuid,
            },
            { headers: authHeaders() }
          );
          console.log(`SMS sent to ${smsNumber}`);
        } catch (smsErr) {
          console.error("❌ Failed to send SMS", smsErr.response?.data || smsErr.message);
        }
      }

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in handleSendEmailIfCompleted", err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
};


module.exports = { handleSendEmailIfCompleted };
