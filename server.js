import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chatRouter from './routes/chat.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

app.use(express.static(join(__dir, 'public')));
app.use('/api/chat', chatRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`   Keys loaded: OpenRouter=${!!process.env.OPEN_ROUTER_API_KEY} | Exa=${!!process.env.EXA_API_KEY} | Tavily=${!!process.env.TAVILY_API_KEY} | Firecrawl=${!!process.env.FIRE_CRAWL_API_KEY} | SerpAPI=${!!process.env.SERP_API_KEY}\n`);
});
