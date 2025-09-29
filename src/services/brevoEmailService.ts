import path from "path";
import fs from "fs";
import handlebars from "handlebars";

export interface BrevoTemplatePayload {
	to: string;
	subject: string;
	name: string;
	brevoTemplateId: number;
	templateParams?: Record<string, any>;
}

export function buildBrevoTemplatePayload({ to, subject, name, brevoTemplateId, templateParams }: BrevoTemplatePayload) {
	return {
		sender: {
			email: "no-reply@asaproadworthys.com.au",
			name: "ASAP Roadworthys",
		},
		to: [{ email: to, name }],
		subject,
		templateId: brevoTemplateId,
		params: { ...templateParams },
		replyTo: { email: "support@asaproadworthys.com.au", name: "Support" },
		headers: { "X-Client": "asap-app", "X-Ref": String(Date.now()) },
		tags: ["asap-test"],
	};
}

export interface CustomHtmlPayload {
	to: string;
	subject: string;
	name: string;
}

export function buildCustomHtmlPayload({ to, subject, name }: CustomHtmlPayload) {
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
