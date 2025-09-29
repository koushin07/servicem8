import axios from "axios";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import handlebars from "handlebars";
import SibApiV3Sdk from "sib-api-v3-sdk";
import { isSmsSuppressed } from "./smsSuppressionController";
import { isSuppressed } from "./unsubscribeController";
import { buildBrevoTemplatePayload, buildCustomHtmlPayload } from "../services/brevoEmailService";

function authHeaders(): Record<string, string> {
  const apiKey = process.env.SERVICEM8_API_KEY || "";
  return {
    "X-API-KEY": apiKey,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export const handleBrevoEmail = async (req: any, res: any) => {
  try {
    const {
      to,
      subject,
      name,
      useBrevoTemplate,
      brevoTemplateId,
      templateParams,
    } = req.body;

    if (!process.env.BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY");
    if (!to || !subject) throw new Error("Missing 'to' or 'subject'");
    if (isSuppressed(to)) {
      return res.status(200).json({ success: false, error: "Recipient has unsubscribed." });
    }

    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;

    const api = new SibApiV3Sdk.TransactionalEmailsApi();
    const accountApi = new SibApiV3Sdk.AccountApi();

    const acc = await accountApi.getAccount();

    let icsAttachment: any = null;
    if (subject && subject.toLowerCase().includes("booking")) {
      const mergeFields = {
        customerName: name || "",
        bookingDate: templateParams?.bookingDate || "",
        bookingTime: templateParams?.bookingTime || "",
        jobAddress: templateParams?.jobAddress || "",
      };
      function generateICS(fields: typeof mergeFields): string {
        return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Booking Confirmation\nDTSTART:${fields.bookingDate}T${fields.bookingTime}\nDTEND:${fields.bookingDate}T${fields.bookingTime}\nLOCATION:${fields.jobAddress}\nDESCRIPTION:Booking for ${fields.customerName}\nEND:VEVENT\nEND:VCALENDAR`;
      }
      const icsContent = generateICS(mergeFields);
      icsAttachment = {
        name: "booking.ics",
        content: Buffer.from(icsContent).toString("base64"),
        contentType: "text/calendar",
      };
    }

    let sendSmtpEmail: any;
    if (useBrevoTemplate && brevoTemplateId) {
      sendSmtpEmail = buildBrevoTemplatePayload({
        to,
        subject,
        name,
        brevoTemplateId,
        templateParams,
      });
    } else {
      sendSmtpEmail = buildCustomHtmlPayload({
        to,
        subject,
        name,
      });
    }
    if (icsAttachment) {
      sendSmtpEmail.attachment = [icsAttachment];
    }

    const response = await api.sendTransacEmail(sendSmtpEmail);

    const events = await api.getTransacEmailsList({
      email: to,
      sort: "desc",
      limit: 5,
    });

    try {
      const content = await api.getTransacEmailContent(response.messageId);
    } catch (err: any) {}

    res.json({ success: true, message: "Email sent successfully", response });
  } catch (error: any) {
    const msg = error?.response?.text || error?.message || String(error);
    res.status(500).json({ success: false, error: msg });
  }
};

export const handleSendEmailIfCompleted = async (req: any, res: any) => {
  try {
    const jwtRaw = Object.keys(req.body)[0];
    const decoded = jwt.decode(jwtRaw, { json: true }) as any;
    const jobUuid = decoded.eventArgs.entry[0].uuid;

    const { data: existingJob } = await axios.get(
      `https://api.servicem8.com/api_1.0/job/${jobUuid}.json`,
      { headers: authHeaders() }
    );

    if (existingJob.status === "Completed") {
      const { data: contacts } = await axios.get(
        `https://api.servicem8.com/api_1.0/jobcontact.json?$filter=job_uuid eq ${jobUuid}`,
        { headers: authHeaders() }
      );

      const primaryContact = (contacts || []).find(
        (c: any) => c.email || c.mobile || c.phone
      );

      if (!primaryContact) {
        return res.sendStatus(200);
      }

      if (
        primaryContact.email !== "canaresmiko3@gmail.com" ||
        primaryContact.first !== "Testing Mark Alfrey"
      ) {
        return res.sendStatus(200);
      }

      let emailSent = false;
      if (primaryContact.email && false) {
        try {
          const templatePath = path.join(
            __dirname,
            "..",
            "templates",
            "confirmation.html"
          );
          const templateSource = fs.readFileSync(templatePath, "utf8");
          const compiledTemplate = handlebars.compile(templateSource);

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
          };

          interface MergeFields {
            customerName: string;
            customerEmail: string;
            jobAddress: string;
            completedDate: string;
            bookingId: string;
            bookingDate: string;
            bookingTime: string;
            technicianName: string;
            technicianPhone: string;
          }
          function generateICS(mergeFields: MergeFields): string {
            return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Booking Confirmation\nDTSTART:${mergeFields.bookingDate}T${mergeFields.bookingTime}\nDTEND:${mergeFields.bookingDate}T${mergeFields.bookingTime}\nLOCATION:${mergeFields.jobAddress}\nDESCRIPTION:Booking for ${mergeFields.customerName}\nEND:VEVENT\nEND:VCALENDAR`;
          }

          function getGoogleCalendarLink(mergeFields: MergeFields): string {
            const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
            const params = [
              `text=Booking+Confirmation`,
              `dates=${mergeFields.bookingDate.replace(/-/g, "")}T${mergeFields.bookingTime.replace(/:/g, "")}00/${mergeFields.bookingDate.replace(/-/g, "")}T${mergeFields.bookingTime.replace(/:/g, "")}00`,
              `details=Booking+for+${encodeURIComponent(mergeFields.customerName)}`,
              `location=${encodeURIComponent(mergeFields.jobAddress)}`,
            ];
            return base + "&" + params.join("&");
          }

          const htmlBody = compiledTemplate({
            ...mergeFields,
            googleCalendarLink: getGoogleCalendarLink(mergeFields),
          });

          const icsContent = generateICS(mergeFields);

          await axios.post(
            "https://api.servicem8.com/platform_service_email",
            {
              to: primaryContact.email,
              subject: `Job Completed: ${mergeFields.jobAddress}`,
              htmlBody,
              regardingJobUUID: jobUuid,
            },
            { headers: authHeaders() }
          );

          emailSent = true;
        } catch (err: any) {}
      }
      if (primaryContact.mobile || primaryContact.phone) {
        const smsNumber = primaryContact.mobile || primaryContact.phone;
        function isValidPhone(phone: string): boolean {
          return /^\+\d{10,15}$/.test(phone);
        }
        function isQuietHours(): boolean {
          const nowUtc = new Date();
          let hourAest = nowUtc.getUTCHours() + 10;
          if (hourAest >= 24) hourAest -= 24;
          return hourAest >= 20 || hourAest < 8;
        }
        const rateLimitMap: Record<string, Record<string, number>> =
          (global as any)._smsRateLimitMap || ((global as any)._smsRateLimitMap = {});
        const nowHour = new Date().toISOString().slice(0, 13);

        if (!rateLimitMap[smsNumber]) rateLimitMap[smsNumber] = {};
        if (rateLimitMap[smsNumber][nowHour] >= 3) {
          return;
        }
        if (isSmsSuppressed(smsNumber)) {
          return;
        }
        if (!isValidPhone(smsNumber)) {
          return;
        }
        // Define smsMergeFields and smsTemplatePath before use
        const smsTechnician = existingJob.allocated_staff
          ? existingJob.allocated_staff[0]
          : {};
        const smsMergeFields: Record<string, string> = {
          FirstName: primaryContact.first || "",
          LastName: primaryContact.last || "",
          "Booking#": existingJob.generated_job_id || "",
          BookingDate: existingJob.start_date || "",
          BookingTime: existingJob.start_time || "",
          Address: existingJob.job_address || "",
          TechnicianName: smsTechnician.display_name || "",
          TechnicianPhone: smsTechnician.phone || "",
        };
        const smsTemplatePath = path.join(
          __dirname,
          "..",
          "templates",
          "messages",
          "confirmation.txt"
        );
        if (isQuietHours()) {
          const queuePath = path.join(
            __dirname,
            "..",
            "globals",
            "smsQueue.json"
          );
          let queue: any[] = [];
          try {
            if (fs.existsSync(queuePath)) {
              queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
            }
          } catch (e) {}
          queue.push({
            to: smsNumber,
            message: null,
            regardingJobUUID: jobUuid,
            mergeFields: smsMergeFields,
            templatePath: smsTemplatePath,
          });
          let smsTemplate = fs.readFileSync(smsTemplatePath, "utf8");
          smsTemplate = smsTemplate.replace(
            /\[([A-Za-z0-9#]+)\]/g,
            (match, p1: keyof typeof smsMergeFields) => smsMergeFields[p1] || ""
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
          } catch (e) {}
          return;
        }
        async function processSmsQueue() {
          const queuePath = path.join(
            __dirname,
            "..",
            "globals",
            "smsQueue.json"
          );
          let queue: any[] = [];
          try {
            if (fs.existsSync(queuePath)) {
              queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
            }
          } catch (e) {
            return;
          }
          if (!queue.length) return;
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
            } catch (err: any) {}
          }
          try {
            fs.writeFileSync(queuePath, JSON.stringify([], null, 2));
          } catch (e) {}
        }
        try {
          const smsTemplatePath = path.join(
            __dirname,
            "..",
            "templates",
            "messages",
            "confirmation.txt"
          );
          let smsTemplate = fs.readFileSync(smsTemplatePath, "utf8");
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
          };
          const { shortenUrl } = require("../services/bitlyService");
          if (smsTemplate.includes("[TrackingLink]")) {
            const longUrl = "https://www.asaproadworthys.com.au/.well-known/sgcaptcha/?r=%2F&y=ipr:120.28.252.170:1759109027.849";
            let customName = `your-portal-${primaryContact.first.toLowerCase()}-${existingJob.generated_job_id}`;
            customName = customName.replace(/[^a-zA-Z0-9-]/g, "-");
            customName = customName.replace(/-+/g, "-");
            const customDomain = process.env.BITLY_CUSTOM_DOMAIN || "bit.ly";
            const shortUrl = await shortenUrl(longUrl, customName, customDomain);
            smsTemplate = smsTemplate.replace("[TrackingLink]", shortUrl);
          }
          smsTemplate = smsTemplate.replace(
            /\[([A-Za-z0-9#]+)\]/g,
            (match, p1: keyof typeof smsMergeFields) => smsMergeFields[p1] || ""
          );
          let attempt = 0;
          const maxAttempts = 3;
          let sent = false;
          let lastErr: any = null;
          while (attempt < maxAttempts && !sent) {
            try {
              await axios.post(
                "https://api.servicem8.com/platform_service_sms",
                {
                  to: smsNumber,
                  message: smsTemplate,
                  regardingJobUUID: jobUuid,
                },
                { headers: authHeaders() }
              );
              sent = true;
              rateLimitMap[smsNumber][nowHour] =
                (rateLimitMap[smsNumber][nowHour] || 0) + 1;
            } catch (smsErr: any) {
              lastErr = smsErr;
              attempt++;
              const backoff = Math.pow(2, attempt) * 1000;
              if (attempt < maxAttempts)
                await new Promise((r) => setTimeout(r, backoff));
            }
          }
        } catch (smsErr: any) {}
      }
      return res.sendStatus(200);
    }
    res.sendStatus(200);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
