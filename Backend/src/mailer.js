const nodemailer = require('nodemailer');

const smtpPort = Number(process.env.SMTP_PORT || process.env.MAILTRAP_PORT || 587);
const smtpHost = process.env.SMTP_HOST || process.env.MAILTRAP_HOST || 'smtp.gmail.com';
const smtpUser = process.env.SMTP_USER || process.env.MAILTRAP_USER;
const smtpPass = process.env.SMTP_PASS || process.env.MAILTRAP_PASS;
const fromName = process.env.MAIL_FROM_NAME || process.env.MAILTRAP_FROM_NAME || 'SoundScout';
const fromEmail = process.env.MAIL_FROM || process.env.MAILTRAP_FROM_EMAIL || smtpUser;

const transport = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

async function sendOtpEmail(toEmail, code, { isNewUser }) {
  const subject = isNewUser
    ? `Your SoundScout verification code: ${code}`
    : `Your SoundScout login code: ${code}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1E3937">
      <h2 style="margin:0 0 8px">SoundScout</h2>
      <p style="margin:0 0 20px;color:#607470">${isNewUser ? 'Verify your email to create your account.' : 'Use this code to sign in.'}</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 0">${code}</div>
      <p style="color:#607470;font-size:13px">This code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. If you did not request it, you can ignore this email.</p>
    </div>
  `;

  await transport.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    subject,
    html,
  });
}

module.exports = { sendOtpEmail };
