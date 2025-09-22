const axios = require("axios");
const jwt = require("jsonwebtoken");

function authHeaders() {
  const apiKey = process.env.SERVICEM8_API_KEY;
  return {
    "X-API-KEY": apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
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

    console.log("New Trigger", existingJob.status);

    if (existingJob.status === "Completed") {
      const { data: contacts } = await axios.get(
        `https://api.servicem8.com/api_1.0/jobcontact.json?$filter=job_uuid eq ${jobUuid}`,
        { headers: authHeaders() }
      );

      const primaryContact = (contacts || []).find(
        (c) => c.email || c.mobile || c.phone
      );

      if (!primaryContact) {
        console.log("⚠️ No contact found for job");
        return res.sendStatus(200);
      }

      if (
        primaryContact.email !== "canaresmiko3@gmail.com" ||
        primaryContact.first !== "Testing Mark Alfrey"
      ) {
        console.log("Not From Mark:", primaryContact.email);
        return res.sendStatus(200);
      }

      //Sending email
      let emailSent = false;
      if (primaryContact.email) {
        try {
          console.log(`Attempting to send email to ${primaryContact.email}`);

          // Load your HTML template
          const templatePath = path.join(
            __dirname,
            "..",
            "templates",
            "confirmation.html"
          );

          const htmlBody = fs.readFileSync(templatePath, "utf8");
console.log("the path to the template is", templatePath);
          await axios.post(
            "https://api.servicem8.com/platform_service_email",
            {
              to: primaryContact.email,
              subject: `Job Completed: ${existingJob.job_address}`,
              htmlBody, // use your template file here
              regardingJobUUID: jobUuid,
            },
            { headers: authHeaders() }
          );

          console.log(`ServiceM8 email sent to ${primaryContact.email}`);
          emailSent = true;
        } catch (err) {
          console.error(
            "❌ Failed to send email",
            err.response?.data || err.message
          );
        }
      }

      //Send SMS
      if (primaryContact.mobile || primaryContact.phone) {
        const smsNumber = primaryContact.mobile || primaryContact.phone;
        try {
          console.log(`Attempting to send SMS to ${smsNumber}`);
          await axios.post(
            "https://api.servicem8.com/platform_service_sms",
            {
              to: smsNumber,
              message: `
              How did we go?

              We hope you're thrilled with the service you received from ASAP Roadworthys! Your opinion matters greatly to us and helps us ensure we're always delivering top-notch service. Could you spare a minute to share your experience?

              Share Your Experience: https://bit.ly/feedseq

              It's quick and easy—just click the button above to get started. Your feedback is invaluable and helps us improve every day.

              Thank you for choosing ASAP Roadworthys, and we look forward to serving you again!

              Warm regards,

              The ASAP Roadworthys Team

              FOR MORE INFORMATION
              Call Now: (07) 5611 7044 or visit https://www.asaproadworthys.com.au

              FULL TERMS AND CONDITIONS
              Terms and Conditions: https://asaprwc.com/TCs
              Terms of Inspection: https://asaprwc.com/TOI
              `,
              regardingJobUUID: jobUuid,
            },
            { headers: authHeaders() }
          );
          console.log(`SMS sent to ${smsNumber}`);
        } catch (smsErr) {
          console.error(
            "❌ Failed to send SMS",
            smsErr.response?.data || smsErr.message
          );
        }
      }

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(
      "❌ Error in handleSendEmailIfCompleted",
      err.response?.data || err.message
    );
    res.status(500).json({ error: err.message });
  }
};

module.exports = { handleSendEmailIfCompleted };
