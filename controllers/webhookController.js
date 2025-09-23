const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const SibApiV3Sdk = require("sib-api-v3-sdk");

function authHeaders() {
  const apiKey = process.env.SERVICEM8_API_KEY;
  return {
    "X-API-KEY": apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

const handleBrevoEmail = async (req, res) => {
  try {
    const { to, subject, name } = req.body;

    // ✅ Setup Brevo client
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications["api-key"];
    apiKey.apiKey = process.env.BREVO_API_KEY;

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    // ✅ Load & compile template
    const templatePath = path.join(
      __dirname,
      "..",
      "templates",
      "confirmation.html"
    );
    const templateSource = fs.readFileSync(templatePath, "utf8");
    const compiledTemplate = handlebars.compile(templateSource);
    const htmlBody = compiledTemplate({
      customerName: name,
    });

    // ✅ Build email payload
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail({
      sender: {
        email: "canaresmiko3@gmail.com", // must be verified in Brevo
        name: "My Test App",
      },
      to: [{ email: to, name }],
      subject,
      htmlContent: htmlBody,
    });

    // ✅ Send email
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("✅ Email sent:", response);

    res.json({ success: true, message: "Email sent successfully", response });
  } catch (error) {
    console.error("❌ Email failed:", error.response?.text || error.message);
    res
      .status(500)
      .json({ success: false, error: error.response?.text || error.message });
  }
};

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

          // Load and compile template
          const templatePath = path.join(
            __dirname,
            "..",
            "templates",
            "confirmation.html"
          );
          const templateSource = fs.readFileSync(templatePath, "utf8");
          const compiledTemplate = handlebars.compile(templateSource);

          // Inject dynamic data
          const htmlBody = compiledTemplate({
            customerName: primaryContact.first,
            jobAddress: existingJob.job_address,
            completedDate: new Date().toLocaleDateString(),
          });

          console.log(
            "📨 Sending ServiceM8 email with template:",
            templatePath
          );

          // Send via ServiceM8
          await axios.post(
            "https://api.servicem8.com/platform_service_email",
            {
              to: primaryContact.email,
              subject: `Job Completed: ${existingJob.job_address}`,
              htmlBody,
              regardingJobUUID: jobUuid,
            },
            { headers: authHeaders() }
          );

          console.log(`✅ ServiceM8 email sent to ${primaryContact.email}`);
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
module.exports = { handleSendEmailIfCompleted, handleBrevoEmail };
