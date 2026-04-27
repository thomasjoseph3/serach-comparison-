import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRouter from './routes/auth.js';
import chatRouter from './routes/chat.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

app.use(express.static(join(__dir, 'public')));
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`   Keys: OpenRouter=${!!process.env.OPEN_ROUTER_API_KEY} | SerpAPI=${!!process.env.SERP_API_KEY} | MongoDB=${!!process.env.MONGO_URL} | JWT=${!!process.env.JWT_SECRET}\n`);
});
