const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  host: process.env.MAILTRAP_HOST,
  port: Number(process.env.MAILTRAP_PORT),
  auth: {
    user: process.env.MAILTRAP_USER,
    pass: process.env.MAILTRAP_PASS,
  },
});

async function sendOtpEmail(toEmail, code, { isNewUser }) {
  const subject = isNewUser
    ? `Your SoundScout verification code: ${code}`
    : `Your SoundScout login code: ${code}`;

  const html = `
    <div style="font-family: sans-serif; padding: 24px; color: #1C2430;">
      <h2 style="color: #2B6E6E; margin-bottom: 4px;">SoundScout</h2>
      <p style="font-size: 15px;">${isNewUser ? 'Welcome! Use this code to verify your email and finish creating your account:' : 'Use this code to log in:'}</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1E4F4F; margin: 20px 0;">${code}</p>
      <p style="font-size: 13px; color: #5B6472;">This code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes. If you didn't request this, you can ignore this email.</p>
    </div>
  `;

  await transport.sendMail({
    from: `"${process.env.MAILTRAP_FROM_NAME}" <${process.env.MAILTRAP_FROM_EMAIL}>`,
    to: toEmail,
    subject,
    html,
  });
}

module.exports = { sendOtpEmail };