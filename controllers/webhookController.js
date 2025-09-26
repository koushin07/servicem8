const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const brevoEmailService = require("../services/brevoEmailService");

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
    const { to, subject, name, useBrevoTemplate, brevoTemplateId, templateParams } = req.body;

    // --- Guard rails ---
    if (!process.env.BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY");
    if (!to || !subject) throw new Error("Missing 'to' or 'subject'");

    // --- Setup Brevo client ---
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

    const api = new SibApiV3Sdk.TransactionalEmailsApi();
    const accountApi = new SibApiV3Sdk.AccountApi();

    // --- Confirm which account this API key belongs to ---
    const acc = await accountApi.getAccount();
    console.log("🔑 Using Brevo account:", acc.companyName, "-", acc.email);
    console.log("🔑 API key tail:", (process.env.BREVO_API_KEY || "").slice(-8));


    // --- ICS attachment logic ---
    let icsAttachment = null;
    // Only attach ICS for booking confirmations (customize as needed)
    if (subject && subject.toLowerCase().includes('booking')) {
      // Example merge fields for ICS
      const mergeFields = {
        customerName: name || "",
        bookingDate: templateParams?.bookingDate || "",
        bookingTime: templateParams?.bookingTime || "",
        jobAddress: templateParams?.jobAddress || "",
      };
      function generateICS(fields) {
        return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Booking Confirmation\nDTSTART:${fields.bookingDate}T${fields.bookingTime}\nDTEND:${fields.bookingDate}T${fields.bookingTime}\nLOCATION:${fields.jobAddress}\nDESCRIPTION:Booking for ${fields.customerName}\nEND:VEVENT\nEND:VCALENDAR`;
      }
      const icsContent = generateICS(mergeFields);
      icsAttachment = {
        name: "booking.ics",
        content: Buffer.from(icsContent).toString('base64'),
        contentType: "text/calendar"
      };
    }

    let sendSmtpEmail;
    if (useBrevoTemplate && brevoTemplateId) {
      sendSmtpEmail = brevoEmailService.buildBrevoTemplatePayload({ to, subject, name, brevoTemplateId, templateParams });
    } else {
      sendSmtpEmail = brevoEmailService.buildCustomHtmlPayload({ to, subject, name });
    }
    // Attach ICS if generated
    if (icsAttachment) {
      sendSmtpEmail.attachment = [icsAttachment];
    }

    // --- Send ---
    const response = await api.sendTransacEmail(sendSmtpEmail);
    console.log("✅ Email sent:", response);

    // --- Fetch logs for this recipient ---
    const events = await api.getTransacEmailsList({
      email: to,
      sort: "desc",
      limit: 5,
    });
    console.log("📬 Recent events for", to, ":", JSON.stringify(events, null, 2));

    // --- Fetch email content by messageId ---
    try {
      const content = await api.getTransacEmailContent(response.messageId);
      console.log("📧 Content meta:", {
        subject: content.subject,
        date: content.date,
        events: content.events,
      });
    } catch (err) {
      console.warn("⚠️ Could not fetch email content by messageId:", err.message);
    }

    res.json({ success: true, message: "Email sent successfully", response });
  } catch (error) {
    const msg = error?.response?.text || error?.message || String(error);
    console.error("❌ Email failed:", msg);
    res.status(500).json({ success: false, error: msg });
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

          // Merge fields for customer, booking, technician
          const technician = existingJob.allocated_staff ? existingJob.allocated_staff[0] : {};
          const mergeFields = {
            customerName: primaryContact.first || "",
            customerEmail: primaryContact.email || "",
            jobAddress: existingJob.job_address || "",
            completedDate: new Date().toLocaleDateString(),
            bookingId: existingJob.id || "",
            bookingDate: existingJob.start_date || "",
            bookingTime: existingJob.start_time || "",
            technicianName: technician.display_name || "",
            technicianPhone: technician.phone || "",
            // Add more fields as needed
          };

          // iCal/ICS attachment for booking confirmations
          function generateICS(mergeFields) {
            // Basic ICS content, expand as needed
            return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Booking Confirmation\nDTSTART:${mergeFields.bookingDate}T${mergeFields.bookingTime}\nDTEND:${mergeFields.bookingDate}T${mergeFields.bookingTime}\nLOCATION:${mergeFields.jobAddress}\nDESCRIPTION:Booking for ${mergeFields.customerName}\nEND:VEVENT\nEND:VCALENDAR`;
          }

          // Google Calendar quick-add link
          function getGoogleCalendarLink(mergeFields) {
            const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
            const params = [
              `text=Booking+Confirmation`,
              `dates=${mergeFields.bookingDate.replace(/-/g, '')}T${mergeFields.bookingTime.replace(/:/g, '')}00/${mergeFields.bookingDate.replace(/-/g, '')}T${mergeFields.bookingTime.replace(/:/g, '')}00`,
              `details=Booking+for+${encodeURIComponent(mergeFields.customerName)}`,
              `location=${encodeURIComponent(mergeFields.jobAddress)}`
            ];
            return base + '&' + params.join('&');
          }

          // Inject dynamic data and calendar links
          const htmlBody = compiledTemplate({
            ...mergeFields,
            googleCalendarLink: getGoogleCalendarLink(mergeFields),
          });

          // Prepare ICS attachment (as base64 for ServiceM8, if supported)
          const icsContent = generateICS(mergeFields);
          // TODO: Attach ICS file if ServiceM8 supports attachments

          console.log(
            "📨 Sending ServiceM8 email with template:",
            templatePath
          );

          // Send via ServiceM8
          await axios.post(
            "https://api.servicem8.com/platform_service_email",
            {
              to: primaryContact.email,
              subject: `Job Completed: ${mergeFields.jobAddress}`,
              htmlBody,
              regardingJobUUID: jobUuid,
              // icsAttachment: icsContent, // Uncomment if ServiceM8 supports
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
          // Read SMS template from file
          const smsTemplatePath = path.join(__dirname, "..", "templates", "messages", "confirmation.txt");
          let smsTemplate = fs.readFileSync(smsTemplatePath, "utf8");
          // Merge fields for customer, booking, technician
          const smsTechnician = existingJob.allocated_staff ? existingJob.allocated_staff[0] : {};
          const smsMergeFields = {
            FirstName: primaryContact.first || "",
            LastName: primaryContact.last || "",
            'Booking#': existingJob.id || "",
            BookingDate: existingJob.start_date || "",
            BookingTime: existingJob.start_time || "",
            Address: existingJob.job_address || "",
            TechnicianName: smsTechnician.display_name || "",
            TechnicianPhone: smsTechnician.phone || "",
            // Add more fields as needed
          };

          // URL shortener placeholder for tracking links
          function shortenUrl(url) {
            // TODO: Integrate with a real URL shortener service
            return url;
          }

          // Replace all merge fields in template
          smsTemplate = smsTemplate.replace(/\[([A-Za-z0-9#]+)\]/g, (match, p1) => smsMergeFields[p1] || "");

          // Example: Replace [TrackingLink] with a shortened URL if present
          if (smsTemplate.includes('[TrackingLink]')) {
            smsTemplate = smsTemplate.replace('[TrackingLink]', shortenUrl('https://your-tracking-link.com'));
          }

          await axios.post(
            "https://api.servicem8.com/platform_service_sms",
            {
              to: smsNumber,
              message: smsTemplate,
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
