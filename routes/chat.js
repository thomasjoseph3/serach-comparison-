import { Router } from 'express';
import { chatStream } from '../agent/llm.js';
import { connectDB } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import ChatSession from '../models/ChatSession.js';
import Search from '../models/Search.js';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { message, activeTool, country } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

  // SSE headers — Vercel holds this up to maxDuration (60s configured in vercel.json)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

  await connectDB();
  const userId = req.user.userId;
  const tool   = activeTool || 'serpapi';
  const region = country || 'in';

  let session = await ChatSession.findOne({ userId }).sort({ updatedAt: -1 });
  if (!session) session = await ChatSession.create({ userId, messages: [] });

  const history = session.messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
  history.push({ role: 'user', content: message });

  console.log(`[chat] user=${req.user.username} tool=${tool} country=${region} msg="${message.slice(0, 60)}"`);

  try {
    let fullReply = '';
    const result = await chatStream(history, tool, region, event => {
      if (event.type === 'text') fullReply += event.delta;
      send(event);
    });

    // Persist updated session
    session.messages = [...history, { role: 'assistant', content: fullReply }];
    await session.save();

    // Save search to history
    if (result.searchQuery && result.toolResults?.[tool]) {
      const rawResults = result.toolResults[tool].results || [];
      await Search.create({
        userId,
        query: result.searchQuery,
        tool,
        country: region,
        aiReply: fullReply,
        results: rawResults.slice(0, 20),
        resultCount: rawResults.length
      });
    }

    res.end();
  } catch (err) {
    console.error('[chat error]', err.response?.data || err.message);
    send({ type: 'error', message: err.response?.data?.error?.message || err.message });
    res.end();
  }
});

// Restore chat session on page load
router.get('/session', requireAuth, async (req, res) => {
  await connectDB();
  const session = await ChatSession.findOne({ userId: req.user.userId }).sort({ updatedAt: -1 });
  res.json({ messages: session?.messages || [] });
});

// Search history for the comparison modal
router.get('/history', requireAuth, async (req, res) => {
  await connectDB();
  const searches = await Search
    .find({ userId: req.user.userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('-__v');
  res.json({ searches });
});

// Clear session (new conversation)
router.delete('/session', requireAuth, async (req, res) => {
  await connectDB();
  await ChatSession.deleteMany({ userId: req.user.userId });
  res.json({ ok: true });
});

export default router;
