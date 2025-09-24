
function buildBrevoTemplatePayload({ to, subject, name, brevoTemplateId, templateParams }) {
  return {
    sender: {
      email: "no-reply@asaproadworthys.com.au",
      name: "ASAP Roadworthys",
    },
    to: [{ email: to, name }],
    subject,
    templateId: brevoTemplateId,
    params:  {...templateParams},
    replyTo: { email: "support@asaproadworthys.com.au", name: "Support" },
    headers: { "X-Client": "asap-app", "X-Ref": String(Date.now()) },
    tags: ["asap-test"],
  };
}

function buildCustomHtmlPayload({ to, subject, name }) {
  const templatePath = path.join(__dirname, "..", "templates", "confirmation.html");
  const templateSource = fs.readFileSync(templatePath, "utf8");
  const htmlBody = handlebars.compile(templateSource)({
    customerName: name || "",
  });
  return {
    sender: {
      email: "no-reply@asaproadworthys.com.au",
      name: "ASAP Roadworthys",
    },
    to: [{ email: to, name }],
    subject,
    htmlContent: htmlBody,
    replyTo: { email: "support@asaproadworthys.com.au", name: "Support" },
    headers: { "X-Client": "asap-app", "X-Ref": String(Date.now()) },
    tags: ["asap-test"],
  };
}

module.exports = { buildBrevoTemplatePayload, buildCustomHtmlPayload };
