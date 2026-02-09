import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function testEmail() {
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: 'your-test-email@example.com',
    subject: 'Test Email',
    text: 'This is a test email',
    html: '<b>This is a test email</b>',
  });
  console.log(info.response);
}

testEmail().catch(console.error);
