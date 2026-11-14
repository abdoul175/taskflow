import nodemailer, { type Transporter } from 'nodemailer';
import { config, emailPreviewMode } from '../config.js';

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
  });
  return transporter;
}

/**
 * Send an email through SMTP when configured. Without SMTP (local development)
 * the message is printed to the server console so every flow stays testable.
 */
export async function sendMail(mail: MailOptions): Promise<void> {
  if (emailPreviewMode) {
    console.log(
      [
        '',
        '──────── EMAIL PREVIEW (no SMTP configured) ────────',
        `To:      ${mail.to}`,
        `Subject: ${mail.subject}`,
        '',
        mail.text,
        '────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return;
  }

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
