import 'dotenv/config';
import { createApp } from './app.js';

const { DATABASE_URL, JWT_SECRET, PORT } = process.env;

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
if (JWT_SECRET === 'change-me-in-production' && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be changed from the default value before running in production');
}

const port = Number(PORT) || 3000;

const app = createApp({
  databaseUrl: DATABASE_URL,
  jwtSecret: JWT_SECRET,
});

app.listen(port, () => {
  console.log(`SMS gateway listening on :${port}`);
});
