import { Router } from 'express';
import { chat } from '../agent/llm.js';
import { connectDB } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import ChatSession from '../models/ChatSession.js';
import Search from '../models/Search.js';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { message, activeTool, country } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

  await connectDB();
  const userId = req.user.userId;
  const tool   = activeTool || 'serpapi';
  const region = country || 'in';

  // Load or create the user's active session
  let session = await ChatSession.findOne({ userId }).sort({ updatedAt: -1 });
  if (!session) session = await ChatSession.create({ userId, messages: [] });

  // Keep last 20 messages to avoid unbounded token growth
  const history = session.messages.slice(-20).map(m => ({ role: m.role, content: m.content }));
  history.push({ role: 'user', content: message });

  console.log(`[chat] user=${req.user.username} tool=${tool} country=${region} msg="${message.slice(0, 60)}"`);

  try {
    const { message: reply, toolResults, searchQuery } = await chat(history, tool, region);
    history.push({ role: 'assistant', content: reply });

    // Persist updated messages
    session.messages = history;
    await session.save();

    // Save search to history
    if (searchQuery && toolResults?.[tool]) {
      const results = toolResults[tool].results || [];
      await Search.create({
        userId,
        query: searchQuery,
        tool,
        country: region,
        aiReply: reply,
        results: results.slice(0, 20),
        resultCount: results.length
      });
    }

    res.json({ reply, toolResults, searchQuery });
  } catch (err) {
    console.error('[chat error]', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// Get current session messages (to restore chat on page load)
router.get('/session', requireAuth, async (req, res) => {
  await connectDB();
  const session = await ChatSession.findOne({ userId: req.user.userId }).sort({ updatedAt: -1 });
  res.json({ messages: session?.messages || [] });
});

// Get user's search history
router.get('/history', requireAuth, async (req, res) => {
  await connectDB();
  const searches = await Search
    .find({ userId: req.user.userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('-__v');
  res.json({ searches });
});

// Clear user's current session (start fresh chat)
router.delete('/session', requireAuth, async (req, res) => {
  await connectDB();
  await ChatSession.deleteMany({ userId: req.user.userId });
  res.json({ ok: true });
});

export default router;
