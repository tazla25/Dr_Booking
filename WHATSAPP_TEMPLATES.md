# Dr_Booking — WhatsApp Message Templates

This file documents the WhatsApp Cloud API message templates that need to be created and approved in Meta Business Manager for the Dr_Booking bot.

## Why templates are needed

WhatsApp has a **24-hour customer service window**:
- Within 24 hours of a patient's last message, the bot can send any free-form text.
- **After** 24 hours, the bot can ONLY send pre-approved **template messages**.

For Dr_Booking, the bot-initiated (outside the 24-hour window) messages are:
1. **Appointment reminders** — sent 1 hour before the appointment
2. **Feedback requests** — sent after a completed appointment
3. **Doctor verification approval** — sent when super admin approves a doctor

Without approved templates, these business-initiated messages will fail with error code 101013 (`template not found`).

---

## How to create templates in Meta Business Manager

1. Go to https://business.facebook.com/
2. Select your business → **WhatsApp Manager**
3. Click **Message Templates** in the left sidebar
4. Click **Create Template**
5. Choose category: **Marketing** (for reminders/feedback) or **Utility** (for status updates)
6. Fill in template name, language, and content (see templates below)
7. Submit for review (typically approved within 24 hours)

Once approved, update `src/jobs/reminderJob.js` and `src/jobs/feedbackJob.js` to call the WhatsApp API with the `template` type instead of the `text` type.

---

## Template 1: Appointment Reminder (1 hour before)

**Template name:** `appointment_reminder_1h`
**Category:** Marketing
**Language:** Bengali (bn)

**Body (Bengali):**
```
⏰ রিমাইন্ডার

আপনার অ্যাপয়েন্টমেন্ট {{1}} ১ ঘণ্টার মধ্যে শুরু হবে।

টোকেন: #{{2}}
লাইভ ট্র্যাকার: {{3}}
```

**Parameters:**
1. `clinicStr` — clinic name + day (e.g., "Health First Clinic, Monday")
2. `queueNumber` — token/queue number
3. `trackerUrl` — the dashboard tracker URL

**Example fill:**
```
⏰ রিমাইন্ডার

আপনার অ্যাপয়েন্টমেন্ট Health First Clinic, Monday ১ ঘণ্টার মধ্যে শুরু হবে।

টোকেন: #3
লাইভ ট্র্যাকার: https://dr-booking.vercel.app/?view=tracker&scheduleId=abc123&date=2026-08-05
```

---

## Template 2: Feedback Request (after completed appointment)

**Template name:** `feedback_request`
**Category:** Marketing
**Language:** Bengali (bn)

**Body (Bengali):**
```
🙏 আপনার অভিজ্ঞতা শেয়ার করুন

আপনি সম্প্রতি {{1}} এর সাথে অ্যাপয়েন্টমেন্ট সম্পন্ন করেছেন।

অনুগ্রহ করে আপনার রেটিং দিন (১-৫ ⭐):
```

**Parameters:**
1. `doctorName` — full name of the doctor

**Note:** Since WhatsApp templates don't support inline buttons, the feedback request as a template can only include text. You'll need to either:
- Ask patients to reply with a number 1-5 (and parse their response)
- Or send the template + then send a separate interactive message within the 24-hour window opened by their reply

---

## Template 3: Doctor Verification Approved

**Template name:** `doctor_verification_approved`
**Category:** Utility
**Language:** Bengali (bn)

**Body (Bengali):**
```
✅ অভিনন্দন!

আপনার ডাক্তার অ্যাকাউন্ট অনুমোদিত হয়েছে।

এখন আপনি /admin দিয়ে লগইন করতে পারবেন এবং /invite দিয়ে কম্পাউন্ডার ইনভাইট করতে পারবেন।
```

---

## Template 4: Appointment Confirmation (post-booking)

**Template name:** `appointment_confirmed`
**Category:** Utility
**Language:** Bengali (bn)

**Body (Bengali):**
```
✅ বুকিং সম্পন্ন!

👤 নাম: {{1}}
📅 তারিখ: {{2}}
🔢 আপনার টোকেন: {{3}}

লাইভ স্ট্যাটাস দেখুন:
{{4}}
```

**Parameters:**
1. `patientName`
2. `appointmentDate`
3. `queueNumber`
4. `trackerUrl`

**Note:** Booking confirmations are typically sent within the 24-hour window (since the patient just messaged the bot), so a free-form text message usually works. This template is only needed if the booking is initiated by a compounder via the dashboard (which is outside the patient's 24-hour window).

---

## Template 5: Appointment Cancelled (by patient or admin)

**Template name:** `appointment_cancelled`
**Category:** Utility
**Language:** Bengali (bn)

**Body (Bengali):**
```
❌ বুকিং বাতিল

আপনার বুকিং (টোকেন #{{1}}) বাতিল করা হয়েছে।

নতুন বুকিং করতে /book পাঠান।
```

**Parameters:**
1. `queueNumber`

---

## Template 6: New Doctor Registration (to super admin)

**Template name:** `new_doctor_registration`
**Category:** Utility
**Language:** English (en)

**Body (English):**
```
📋 New Doctor Registration

👤 Name: {{1}}
📱 Phone: {{2}}
🏥 Medical Reg: {{3}}
🩺 Specialization: {{4}}

Approve in the dashboard → Verify Doctors.
```

**Parameters:**
1. `doctorName`
2. `doctorPhone`
3. `medicalRegNumber`
4. `specialization`

---

## Template 7: Walk-in Patient Added (notification)

**Template name:** `walk_in_added`
**Category:** Utility
**Language:** Bengali (bn)

**Body (Bengali):**
```
✅ ওয়াক-ইন রোগী যোগ হয়েছে

👤 নাম: {{1}}
🔢 টোকেন: {{2}}
📅 তারিখ: {{3}}
```

---

## Updating the bot to use templates

After creating and approving the templates above, update these files to use the WhatsApp `template` message type when sending business-initiated messages:

### `src/jobs/reminderJob.js`

Replace the `bot.sendMessage(...)` call with a template send:

```javascript
// OLD (free-form text — fails outside 24h window)
await bot.sendMessage(apt.patientPhone, message);

// NEW (template send — works any time after template is approved)
const platform = bot._platform;
await platform._send({
  messaging_product: 'whatsapp',
  to: platform.normalizePhone(apt.patientPhone),
  type: 'template',
  template: {
    name: 'appointment_reminder_1h',
    language: { code: 'bn' },
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: clinicStr },
          { type: 'text', text: String(apt.queueNumber) },
          { type: 'text', text: trackerUrl },
        ],
      },
    ],
  },
});
```

### `src/jobs/feedbackJob.js`

Similar change — replace the free-form feedback message with the `feedback_request` template.

### `src/services/adminService.js`

When `approveDoctor()` is called, send the `doctor_verification_approved` template to the doctor's WhatsApp number.

---

## Template submission checklist

Before submitting each template to Meta:

- [ ] Template name uses only lowercase letters, numbers, and underscores
- [ ] All variable content is parameterized with `{{1}}`, `{{2}}`, etc.
- [ ] No Markdown formatting (WhatsApp templates are plain text — `*` and `_` will be displayed literally)
- [ ] No URLs in body (use parameters for any URLs)
- [ ] Category is correct (Marketing for promotional, Utility for transactional)
- [ ] Language matches the target audience (bn for Bengali, en for English)

After approval, test by sending the template via the Meta API test console before enabling it in production code.

---

## Testing templates

You can test templates via the Meta Graph API Explorer or curl:

```bash
curl -X POST \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "<test-recipient-phone>",
    "type": "template",
    "template": {
      "name": "appointment_reminder_1h",
      "language": { "code": "bn" },
      "components": [{
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Health First Clinic, Monday" },
          { "type": "text", "text": "3" },
          { "type": "text", "text": "https://dr-booking.vercel.app/?view=tracker&scheduleId=abc&date=2026-08-05" }
        ]
      }]
    }
  }' \
  "https://graph.facebook.com/v18.0/$WHATSAPP_PHONE_NUMBER_ID/messages"
```

The recipient must be in your test recipient list (until business verification is complete).

---

## Template approval status tracking

Track each template's approval status in the table below. Update this file when you submit/approve each template.

| Template Name | Category | Language | Submitted | Approved | Live in Code |
|---|---|---|---|---|---|
| `appointment_reminder_1h` | Marketing | bn | ☐ | ☐ | ☐ |
| `feedback_request` | Marketing | bn | ☐ | ☐ | ☐ |
| `doctor_verification_approved` | Utility | bn | ☐ | ☐ | ☐ |
| `appointment_confirmed` | Utility | bn | ☐ | ☐ | ☐ |
| `appointment_cancelled` | Utility | bn | ☐ | ☐ | ☐ |
| `new_doctor_registration` | Utility | en | ☐ | ☐ | ☐ |
| `walk_in_added` | Utility | bn | ☐ | ☐ | ☐ |

---

## References

- WhatsApp Cloud API message templates docs: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
- Template categories: https://developers.facebook.com/docs/whatsapp/updates-to-pricing/template-categories
- 24-hour customer service window: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
