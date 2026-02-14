# ProWorkers Backend

Node.js/Express backend for ProWorkers application.

## Features

- User authentication (Email/Phone OTP, Google OAuth)
- User profiles and user cards
- Project uploads and management
- Real-time messaging
- File uploads (Cloudinary)
- Follow/Connection system

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
   - `MONGODB_URI` - MongoDB connection string (required)
   - `JWT_SECRET` - Secret key for JWT tokens (required)
   - `FRONTEND_URL` - Frontend URL
   - `BACKEND_URL` - Backend URL
   - `BREVO_API_KEY` - For email OTP (optional)
   - `TWILIO_*` - For SMS OTP (optional)
   - `GOOGLE_CLIENT_ID/SECRET` - For Google signup (optional)
   - `CLOUDINARY_*` - For image uploads (optional)

4. Run development server:
```bash
npm run dev
```

5. Run production server:
```bash
npm start
```

## Deployment

### Render.com
1. Connect your GitHub repository
2. Select "Web Service"
3. Use the provided `render.yaml` configuration
4. Add environment variables in Render dashboard

### Vercel
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Follow the prompts

### Railway
1. Connect your GitHub repository
2. Railway will auto-detect Node.js
3. Add environment variables
4. Deploy

## API Endpoints

- `POST /api/auth/signup` - User signup
- `POST /api/auth/login` - User login
- `POST /api/auth/send-otp` - Send OTP (email/phone)
- `GET /api/auth/google` - Google OAuth
- `GET /api/user-card` - Get all user cards
- `POST /api/user-card` - Create/update user card
- `GET /api/projects` - Get all projects
- `POST /api/projects` - Create project
- And more...

## Environment Variables

See `.env.example` for all available environment variables.
