import twilio from 'twilio';

/* -------------------- Twilio setup -------------------- */
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;

// Only initialize Twilio if valid credentials are provided
// Twilio accountSid must start with "AC" and not be a placeholder
const isValidTwilioConfig = accountSid && 
                            authToken && 
                            accountSid.startsWith('AC') && 
                            accountSid !== 'your_twilio_account_sid' &&
                            authToken !== 'your_twilio_auth_token';

if (isValidTwilioConfig) {
  try {
    twilioClient = twilio(accountSid, authToken);
    console.log('✅ Twilio SMS service initialized');
  } catch (err) {
    console.warn('⚠️ Failed to initialize Twilio:', err.message);
    twilioClient = null;
  }
} else {
  console.warn('⚠️ Twilio not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER). SMS OTP will log to console in dev mode.');
}

/* -------------------- Send OTP SMS -------------------- */
export async function sendOtpSms({ toPhone, otp }) {
  if (!twilioClient) {
    // In development, log the OTP instead of sending SMS
    console.log(`[DEV MODE] OTP for ${toPhone}: ${otp}`);
    return { sent: true };
  }

  try {
    await twilioClient.messages.create({
      body: `Your Project Gallery verification code is: ${otp}. It expires in 10 minutes.`,
      from: fromNumber,
      to: toPhone,
    });

    return { sent: true };
  } catch (err) {
    console.error('Twilio SMS error:', err.message);
    return { sent: false, error: err.message };
  }
}

/* -------------------- Validate phone number format -------------------- */
export function validatePhoneNumber(phone) {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Basic validation: should be 10-15 digits
  if (cleaned.length < 10 || cleaned.length > 15) {
    return { valid: false, error: 'Phone number must be 10-15 digits' };
  }

  return { valid: true, cleaned: `+${cleaned}` };
}
