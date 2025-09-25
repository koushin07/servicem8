# API Endpoint Documentation: handleBrevoEmail & ServiceM8 Integration

## Overview
This document describes the payloads and integration details for the `handleBrevoEmail` endpoint (Brevo/Sendinblue) and ServiceM8 automation, including requirements for 3rd party payloads and usage instructions for developers.

---

## Endpoints
- **POST** `/your-brevo-endpoint` (Brevo email sending)
- **POST** `/your-servicem8-endpoint` (ServiceM8 job completion automation)

---

## Required Environment Variables
- `BREVO_API_KEY`: Your Brevo (Sendinblue) API key
- `SERVICEM8_API_KEY`: Your ServiceM8 API key

---

## Brevo Email Payloads
### 1. Using Custom HTML Template
```json
{
  "to": "recipient@example.com",
  "subject": "Welcome to ASAP Roadworthys!",
  "name": "John Doe"
}
```

### 2. Using Brevo Template
```json
{
  "to": "recipient@example.com",
  "subject": "Welcome to ASAP Roadworthys!",
  "name": "John Doe",
  "useBrevoTemplate": true,
  "brevoTemplateId": 1234567,
  "templateParams": {
    "customerName": "John Doe",
    "customField": "Some Value"
  }
}
```
- `to` (string): Recipient's email address (required)
- `subject` (string): Email subject (required)
- `name` (string): Recipient's name (optional, used in template)
- `useBrevoTemplate` (boolean): Set to true to use a Brevo template
- `brevoTemplateId` (number): The Brevo template ID to use (required if useBrevoTemplate is true)
- `templateParams` (object): Key-value pairs for template variables (optional, but recommended)

---

## Brevo Response
- On success: `{ success: true, message: "Email sent successfully", response: <Brevo API response> }`
- On error: `{ success: false, error: <error message> }`

---

## ServiceM8 Automation
- The ServiceM8 webhook listens for job completion events.
- It decodes the incoming JWT payload to extract the job UUID.
- Fetches job and contact details from ServiceM8 API:
  - `GET https://api.servicem8.com/api_1.0/job/{jobUuid}.json`
  - `GET https://api.servicem8.com/api_1.0/jobcontact.json?$filter=job_uuid eq {jobUuid}`
- If the job is completed and the contact matches criteria, sends:
  - Email via ServiceM8: `POST https://api.servicem8.com/platform_service_email`
  - SMS via ServiceM8: `POST https://api.servicem8.com/platform_service_sms`

### ServiceM8 Email Payload Example
```json
{
  "to": "contact@email.com",
  "subject": "Job Completed: 123 Main St",
  "htmlBody": "<html>...rendered template...</html>",
  "regardingJobUUID": "job-uuid-value"
}
```

### ServiceM8 SMS Payload Example
```json
{
  "to": "+61412345678",
  "message": "How did we go?...",
  "regardingJobUUID": "job-uuid-value"
}
```

---

## 3rd Party Integration Details
- Brevo (Sendinblue) Transactional Email API is used for direct email sending.
- ServiceM8 API is used for job and contact data, and for sending emails/SMS via ServiceM8 platform.
- All API keys must be kept secure and not exposed in client code.
- Sender and reply-to emails must be validated in Brevo.
- ServiceM8 endpoints require valid API key in the `X-API-KEY` header.

---

## Other Notes
- The Brevo endpoint fetches and logs recent email events for debugging.
- The ServiceM8 automation only sends emails/SMS for specific contacts/jobs as per business logic.
- All errors are logged and returned in the response.

---

## Contact
For further integration help, contact the ASAP Roadworthys dev team.
