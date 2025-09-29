const axios = require("axios");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const brevoEmailService = require("../services/brevoEmailService");
const { isSuppressed } = require("./unsubscribeController");

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
    const {
      to,
      subject,
      name,
      useBrevoTemplate,
      brevoTemplateId,
      templateParams,
    } = req.body;

    // --- Guard rails ---
    if (!process.env.BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY");
    if (!to || !subject) throw new Error("Missing 'to' or 'subject'");
    if (isSuppressed(to)) {
      return res
        .status(200)
        .json({ success: false, error: "Recipient has unsubscribed." });
    }

    // --- Setup Brevo client ---
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

    const api = new SibApiV3Sdk.TransactionalEmailsApi();
    const accountApi = new SibApiV3Sdk.AccountApi();

    // --- Confirm which account this API key belongs to ---
    const acc = await accountApi.getAccount();
    console.log("🔑 Using Brevo account:", acc.companyName, "-", acc.email);
    console.log(
      "🔑 API key tail:",
      (process.env.BREVO_API_KEY || "").slice(-8)
    );

    // --- ICS attachment logic ---
    let icsAttachment = null;
    // Only attach ICS for booking confirmations (customize as needed)
    if (subject && subject.toLowerCase().includes("booking")) {
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
        content: Buffer.from(icsContent).toString("base64"),
        contentType: "text/calendar",
      };
    }

    let sendSmtpEmail;
    if (useBrevoTemplate && brevoTemplateId) {
      sendSmtpEmail = brevoEmailService.buildBrevoTemplatePayload({
        to,
        subject,
        name,
        brevoTemplateId,
        templateParams,
      });
    } else {
      sendSmtpEmail = brevoEmailService.buildCustomHtmlPayload({
        to,
        subject,
        name,
      });
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
    console.log(
      "📬 Recent events for",
      to,
      ":",
      JSON.stringify(events, null, 2)
    );

    // --- Fetch email content by messageId ---
    try {
      const content = await api.getTransacEmailContent(response.messageId);
      console.log("📧 Content meta:", {
        subject: content.subject,
        date: content.date,
        events: content.events,
      });
    } catch (err) {
      console.warn(
        "⚠️ Could not fetch email content by messageId:",
        err.message
      );
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
      if (primaryContact.email && false) {
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
          const technician = existingJob.allocated_staff
            ? existingJob.allocated_staff[0]
            : {};
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
            const base =
              "https://calendar.google.com/calendar/render?action=TEMPLATE";
            const params = [
              `text=Booking+Confirmation`,
              `dates=${mergeFields.bookingDate.replace(
                /-/g,
                ""
              )}T${mergeFields.bookingTime.replace(
                /:/g,
                ""
              )}00/${mergeFields.bookingDate.replace(
                /-/g,
                ""
              )}T${mergeFields.bookingTime.replace(/:/g, "")}00`,
              `details=Booking+for+${encodeURIComponent(
                mergeFields.customerName
              )}`,
              `location=${encodeURIComponent(mergeFields.jobAddress)}`,
            ];
            return base + "&" + params.join("&");
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
        const { isSmsSuppressed } = require("./smsSuppressionController");
        // Phone validation (simple E.164 check)
        function isValidPhone(phone) {
          return /^\+\d{10,15}$/.test(phone);
        }
        // Quiet hours (Australia, 8pm-8am AEST)
        function isQuietHours() {
          // Convert to Australia Eastern Standard Time (UTC+10)
          const nowUtc = new Date();
          // Get UTC hour and add 10 for AEST
          let hourAest = nowUtc.getUTCHours() + 10;
          if (hourAest >= 24) hourAest -= 24;
          // Block SMS from 8pm (20) to 8am (8)
          return hourAest >= 20 || hourAest < 8;
        }
        // Rate limiting (in-memory, per number, per hour)
        const rateLimitMap =
          global._smsRateLimitMap || (global._smsRateLimitMap = {});
        const nowHour = new Date().toISOString().slice(0, 13);

        if (!rateLimitMap[smsNumber]) rateLimitMap[smsNumber] = {};

        if (rateLimitMap[smsNumber][nowHour] >= 3) {
          console.log(`Rate limit exceeded for ${smsNumber}`);
          return;
        }

        if (isSmsSuppressed(smsNumber)) {
          console.log(`SMS suppressed for ${smsNumber}`);
          return;
        }
        if (!isValidPhone(smsNumber)) {
          console.log(`Invalid phone number: ${smsNumber}`);
          return;
        }
        if (isQuietHours()) {
          console.log(`Quiet hours: queueing SMS to ${smsNumber}`);
          // Queue SMS for later sending
          const queuePath = path.join(
            __dirname,
            "..",
            "globals",
            "smsQueue.json"
          );
          let queue = [];
          try {
            if (fs.existsSync(queuePath)) {
              queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
            }
          } catch (e) {
            console.error("Failed to read SMS queue", e);
          }
          queue.push({
            to: smsNumber,
            message: null, // will be set below
            regardingJobUUID: jobUuid,
            mergeFields: smsMergeFields,
            templatePath: smsTemplatePath,
          });
          // Prepare message for queue
          let smsTemplate = fs.readFileSync(smsTemplatePath, "utf8");
          smsTemplate = smsTemplate.replace(
            /\[([A-Za-z0-9#]+)\]/g,
            (match, p1) => smsMergeFields[p1] || ""
          );
          if (smsTemplate.includes("[TrackingLink]")) {
            const longUrl = "https://your-tracking-link.com";
            let customName = "asap";
            if (existingJob.id) customName += `-job-${existingJob.id}`;
            if (primaryContact.first)
              customName += `-${primaryContact.first.toLowerCase()}`;
            customName = customName.replace(/[^a-zA-Z0-9\-]/g, "");
            const { shortenUrl } = require("../services/bitlyService");
            smsTemplate = smsTemplate.replace(
              "[TrackingLink]",
              await shortenUrl(longUrl, customName)
            );
          }
          queue[queue.length - 1].message = smsTemplate;
          try {
            fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
          } catch (e) {
            console.error("Failed to write SMS queue", e);
          }
          return;
        }
        // Function to process queued SMS messages (call this on a schedule or at startup)
        async function processSmsQueue() {
          const queuePath = path.join(
            __dirname,
            "..",
            "globals",
            "smsQueue.json"
          );
          let queue = [];
          try {
            if (fs.existsSync(queuePath)) {
              queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
            }
          } catch (e) {
            console.error("Failed to read SMS queue", e);
            return;
          }
          if (!queue.length) return;
          // Only send if not quiet hours
          function isQuietHours() {
            const nowUtc = new Date();
            let hourAest = nowUtc.getUTCHours() + 10;
            if (hourAest >= 24) hourAest -= 24;
            return hourAest >= 20 || hourAest < 8;
          }
          if (isQuietHours()) return;
          const { shortenUrl } = require("../services/bitlyService");
          for (const sms of queue) {
            try {
              await axios.post(
                "https://api.servicem8.com/platform_service_sms",
                {
                  to: sms.to,
                  message: sms.message,
                  regardingJobUUID: sms.regardingJobUUID,
                },
                { headers: authHeaders() }
              );
              console.log(`Queued SMS sent to ${sms.to}`);
            } catch (err) {
              console.error(
                `Failed to send queued SMS to ${sms.to}`,
                err.response?.data || err.message
              );
            }
          }
          // Clear queue after sending
          try {
            fs.writeFileSync(queuePath, JSON.stringify([], null, 2));
          } catch (e) {
            console.error("Failed to clear SMS queue", e);
          }
        }
        try {
          console.log(`Attempting to send SMS to ${smsNumber}`);
          // Read SMS template from file
          const smsTemplatePath = path.join(
            __dirname,
            "..",
            "templates",
            "messages",
            "confirmation.txt"
          );
          let smsTemplate = fs.readFileSync(smsTemplatePath, "utf8");
          // Merge fields for customer, booking, technician
          const smsTechnician = existingJob.allocated_staff
            ? existingJob.allocated_staff[0]
            : {};
          const smsMergeFields = {
            FirstName: primaryContact.first || "",
            LastName: primaryContact.last || "",
            "Booking#": existingJob.generated_job_id || "",
            BookingDate: existingJob.start_date || "",
            BookingTime: existingJob.start_time || "",
            Address: existingJob.job_address || "",
            TechnicianName: smsTechnician.display_name || "",
            TechnicianPhone: smsTechnician.phone || "",
            // Add more fields as needed
          };
          // Debug: Log all merge fields before template replacement
          console.log("🔍 SMS Merge Fields:", JSON.stringify(smsMergeFields, null, 2));

          // Integrate Bitly for URL shortening
          const { shortenUrl } = require("../services/bitlyService");

          // First, replace [TrackingLink] with Bitly short URL if present
          if (smsTemplate.includes("[TrackingLink]")) {
            const longUrl = "https://www.asaproadworthys.com.au/.well-known/sgcaptcha/?r=%2F&y=ipr:120.28.252.170:1759109027.849";

            // Remove spaces and non-url chars
            customName = customName.replace(/[^a-zA-Z0-9\-]/g, "asap-portal");
            try {
              const shortUrl = await shortenUrl(longUrl, "asap");
              console.log("🔗 Bitly response for ", customName, ":", shortUrl);
              smsTemplate = smsTemplate.replace("[TrackingLink]", shortUrl);
            } catch (bitlyErr) {
              console.error("❌ Bitly error for ", customName, ":", bitlyErr.message || bitlyErr);
              smsTemplate = smsTemplate.replace("[TrackingLink]", "[BitlyError]");
            }
          }

          // Now replace all other merge fields in template
          smsTemplate = smsTemplate.replace(
            /\[([A-Za-z0-9#]+)\]/g,
            (match, p1) => smsMergeFields[p1] || ""
          );
          // Debug: Log template after all replacements
          console.log("📝 SMS Template after all replacements:", smsTemplate);

          // Retry & backoff logic
          let attempt = 0;
          const maxAttempts = 3;
          let sent = false;
          let lastErr = null;
          console.log({
            to: smsNumber,
            message: smsTemplate,
            regardingJobUUID: jobUuid,
          });
        // Debug: Log final SMS message after all replacements
        console.log("✅ Final SMS message:", smsTemplate);
          console.log(existingJob)
          return res.status(200).json({
            to: smsNumber,
            message: smsTemplate,
            regardingJobUUID: jobUuid,
            existingJob
          })
          // while (attempt < maxAttempts && !sent) {
          //   try {
          //     await axios.post(
          //       "https://api.servicem8.com/platform_service_sms",
          //       {
          //         to: smsNumber,
          //         message: smsTemplate,
          //         regardingJobUUID: jobUuid,
          //       },
          //       { headers: authHeaders() }
          //     );
          //     sent = true;
          //     // Rate limit increment
          //     rateLimitMap[smsNumber][nowHour] =
          //       (rateLimitMap[smsNumber][nowHour] || 0) + 1;
          //     console.log(`SMS sent to ${smsNumber}`);
          //   } catch (smsErr) {
          //     lastErr = smsErr;
          //     attempt++;
          //     const backoff = Math.pow(2, attempt) * 1000;
          //     console.error(
          //       `❌ Failed to send SMS (attempt ${attempt}):`,
          //       smsErr.response?.data || smsErr.message
          //     );
          //     if (attempt < maxAttempts)
          //       await new Promise((r) => setTimeout(r, backoff));
          //   }
          // }
          if (!sent) {
            // Delivery failure handling: log or notify
            console.error(
              `❌ SMS delivery failed for ${smsNumber} after ${maxAttempts} attempts.`
            );
          }
        } catch (smsErr) {
          console.error(
            "❌ Failed to send SMS (outer catch)",
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
