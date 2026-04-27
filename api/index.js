import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import chatRouter from '../routes/chat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Serve static files from public folder
app.use(express.static(join(__dirname, '../public')));

// API routes
app.use('/api/chat', chatRouter);

// Fallback for SPA (serve index.html for all other routes)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

// Export for Vercel serverless functions
export default app;
