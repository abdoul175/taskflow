import nodemailer, { type Transporter } from 'nodemailer';
import { config, emailPreviewMode } from '../config.js';

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;
let loggedTransportConfig = false;

function getTransporter(): Transporter {
  if (!loggedTransportConfig) {
    loggedTransportConfig = true;
    console.log(
      `[mail] SMTP host=${config.smtp.host} port=${config.smtp.port} secure=${config.smtp.secure} ` +
        `user=${config.smtp.user || '(none)'} from=${config.smtp.from}`,
    );
  }

  transporter ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
    // Keep a failed SMTP attempt from hanging the Vercel function.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

/**
 * Check the configured SMTP credentials without sending a message. Used by the
 * temporary /api/health/mail diagnostic endpoint.
 */
export async function verifyMailTransport(): Promise<{
  ok: boolean;
  code?: string;
  responseCode?: number;
  response?: string;
}> {
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (error) {
    const failure = error as {
      code?: string;
      response?: string;
      responseCode?: number;
    };
    return {
      ok: false,
      code: failure.code,
      responseCode: failure.responseCode,
      response: failure.response,
    };
  }
}

/**
 * Send an email through SMTP when configured. Without SMTP (local development)
 * the message is printed to the server console so every flow stays testable.
 */
export async function sendMail(mail: MailOptions): Promise<void> {
  if (emailPreviewMode) {
    console.warn(
      [
        '',
        '──────── EMAIL PREVIEW (SMTP_HOST is not set) ────────',
        `To:      ${mail.to}`,
        `Subject: ${mail.subject}`,
        '',
        mail.text,
        '──────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return;
  }

  try {
    await getTransporter().sendMail({
      from: config.smtp.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    console.log(`[mail] sent "${mail.subject}"`);
  } catch (error) {
    const failure = error as {
      code?: string;
      command?: string;
      response?: string;
      responseCode?: number;
      message?: string;
    };
    console.error(
      `[mail] SMTP send failed: code=${failure.code ?? '?'} command=${failure.command ?? '?'} ` +
        `responseCode=${failure.responseCode ?? '?'} response=${failure.response ?? '?'} ` +
        `message=${failure.message ?? '?'}`,
    );
    throw error;
  }
}
