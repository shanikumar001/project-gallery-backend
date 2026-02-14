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
        email: process.env.EMAIL_FROM_ADDRESS || 'no-reply@proworkers.com',
        name: process.env.EMAIL_FROM_NAME || 'ProWorkers',
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
  const logoHtml = getLogoHtml();
  const result = await sendEmail({
    to: toEmail,
    subject: 'Your verification code - ProWorkers',
    text: `Your ProWorkers verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        ${logoHtml}
        <h2 style="color: #2F5DAA;">Verification Code</h2>
        <p>Your verification code is: <strong>${otp}</strong></p>
      <p>It expires in 10 minutes.</p>
      <p>If you didn’t request this, you can ignore this email.</p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">ProWorkers</p>
      </div>
    `,
  });

  if (!result.sent) {
    throw new Error('Unable to send OTP. Please try again later.');
  }

  return result;
}

/* -------------------- Follow request -------------------- */
export async function sendFollowRequestEmail({ toEmail, fromName }) {
  const logoHtml = getLogoHtml();
  return sendEmail({
    to: toEmail,
    subject: `${fromName} wants to follow you - ProWorkers`,
    text: `${fromName} has sent you a follow request on ProWorkers. Log in to accept or decline.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        ${logoHtml}
        <h2 style="color: #2F5DAA;">Follow Request</h2>
        <p><strong>${fromName}</strong> has sent you a follow request on ProWorkers.</p>
        <p>Log in to accept or decline.</p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">ProWorkers</p>
      </div>
    `,
  });
}

/* ProWorkers logo/header for emails - set PROWORKERS_LOGO_URL in .env for image, or uses styled text */
const getLogoHtml = () => {
  const url = process.env.PROWORKERS_LOGO_URL;
  if (url) {
    return `<img src="${url}" alt="ProWorkers" width="80" height="80" style="margin-bottom: 16px; display: block;" />`;
  }
  return `<div style="font-size: 24px; font-weight: bold; margin-bottom: 16px;"><span style="color: #2F5DAA;">Pro</span><span style="color: #F47C2C;">Workers</span></div>`;
};

/* -------------------- New message -------------------- */
export async function sendNewMessageEmail({ toEmail, fromName, messagePreview }) {
  const logoHtml = getLogoHtml();
  return sendEmail({
    to: toEmail,
    subject: `${fromName} sent you a message - ProWorkers`,
    text: `New message from ${fromName} on ProWorkers:\n\n"${messagePreview}"\n\nLog in to reply.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        ${logoHtml}
        <h2 style="color: #2F5DAA;">New Message</h2>
        <p>You have a new message from <strong>${fromName}</strong> on ProWorkers.</p>
        <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0;">"${messagePreview}"</p>
        </div>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/chat" style="color: #F47C2C; font-weight: bold;">Log in to reply →</a></p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">ProWorkers - Connect with skilled professionals</p>
      </div>
    `,
  });
}

/* -------------------- Project offer -------------------- */
export async function sendProjectOfferEmail({
  toEmail,
  toName,
  fromName,
  projectTitle,
  description,
  budget,
  deadline,
  appUrl,
}) {
  const deadlineStr = deadline ? new Date(deadline).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }) : 'Not specified';
  const frontendUrl = appUrl || process.env.FRONTEND_URL || 'http://localhost:3000';

  return sendEmail({
    to: toEmail,
    subject: `New Project Offer: "${projectTitle}" from ${fromName}`,
    text: `
New Project Offer from ${fromName}

Project: ${projectTitle}
Description: ${description || 'No description provided'}
Budget: ₹${Number(budget || 0).toLocaleString('en-IN')}
Deadline: ${deadlineStr}

Log in to your account to accept or reject this offer.
${frontendUrl}/chat
    `.trim(),
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        ${getLogoHtml()}
        <h2 style="color: #2F5DAA;">New Project Offer</h2>
        <p><strong>${fromName}</strong> has sent you a project offer on ProWorkers.</p>
        
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Project Title:</strong> ${projectTitle}</p>
          ${description ? `<p style="margin: 0 0 8px 0;"><strong>Description:</strong><br>${description}</p>` : ''}
          <p style="margin: 0 0 8px 0;"><strong>Budget:</strong> ₹${Number(budget || 0).toLocaleString('en-IN')}</p>
          <p style="margin: 0;"><strong>Deadline:</strong> ${deadlineStr}</p>
        </div>
        
        <p>Log in to your account to <strong>Accept</strong> or <strong>Reject</strong> this offer.</p>
        <p><a href="${frontendUrl}/chat" style="color: #F47C2C; font-weight: bold;">View in Chat →</a></p>
        
        <p style="color: #666; font-size: 12px; margin-top: 24px;">ProWorkers - Connect with skilled professionals</p>
      </div>
    `,
  });
}
