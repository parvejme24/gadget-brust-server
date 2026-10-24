const nodemailer = require("nodemailer");

// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM (or EMAIL_FROM) in .env
const isConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter;
const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

// Returns true when the email was handed to the SMTP server, false when SMTP isn't set up or
// refused it (the error is logged; callers decide what the user sees)
const sendMail = async ({ to, subject, text, html }) => {
  if (!isConfigured()) {
    console.warn(`✉️  SMTP is not configured; email to ${to} not sent: ${subject}`);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.MAIL_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (error) {
    console.error(`✉️  Email to ${to} failed: ${error.message}`);
    return false;
  }
};

module.exports = { sendMail, isMailConfigured: isConfigured };
