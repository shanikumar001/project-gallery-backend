import SibApiV3Sdk from 'sib-api-v3-sdk';

/* -------------------- Brevo setup -------------------- */
const client = SibApiV3Sdk.ApiClient.instance;
client.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

/* -------------------- Generic sender -------------------- */
export async function sendEmail({ to, subject, text, html }) {
  try {
    await emailApi.sendTransacEmail({
      sender: {
        email: process.env.EMAIL_FROM_ADDRESS || 'no-reply@projectgallery.com',
        name: process.env.EMAIL_FROM_NAME || 'Project Gallery',
      },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    });

    return { sent: true };
  } catch (err) {
    console.error('Brevo email error:', err?.response?.body || err.message);
    return { sent: false, error: err.message };
  }
}

/* -------------------- OTP email -------------------- */
export async function sendOtpEmail({ toEmail, otp }) {
  const result = await sendEmail({
    to: toEmail,
    subject: 'Your verification code - Project Gallery',
    text: `Your verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <p>Your verification code is: <strong>${otp}</strong></p>
      <p>It expires in 10 minutes.</p>
      <p>If you didn’t request this, you can ignore this email.</p>
    `,
  });

  if (!result.sent) {
    throw new Error('Unable to send OTP. Please try again later.');
  }

  return result;
}

/* -------------------- Follow request -------------------- */
export async function sendFollowRequestEmail({ toEmail, fromName }) {
  return sendEmail({
    to: toEmail,
    subject: `${fromName} wants to follow you`,
    text: `${fromName} has sent you a follow request on Project Gallery.`,
    html: `
      <p><strong>${fromName}</strong> has sent you a follow request.</p>
      <p>Log in to accept or decline.</p>
    `,
  });
}

/* -------------------- New message -------------------- */
export async function sendNewMessageEmail({ toEmail, fromName, messagePreview }) {
  return sendEmail({
    to: toEmail,
    subject: `${fromName} sent you a message`,
    text: `New message from ${fromName}:\n\n"${messagePreview}"`,
    html: `
      <p>You have a new message from <strong>${fromName}</strong>.</p>
      <p>"${messagePreview}"</p>
      <p>Log in to reply.</p>
    `,
  });
}
