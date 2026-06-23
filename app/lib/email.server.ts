import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("[email] SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendReminderEmail(input: SendEmailInput) {
  const tx = getTransporter();
  if (!tx) return { ok: false, skipped: true, error: "SMTP not configured" };

  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = input.fromName ? `"${input.fromName.replace(/"/g, "'")}" <${fromEmail}>` : fromEmail;

  try {
    const result = await tx.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text || input.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    });
    return { ok: true, messageId: result.messageId };
  } catch (error: any) {
    console.error("[email] reminder failed", error);
    return { ok: false, error: String(error?.message || error) };
  }
}
