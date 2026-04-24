import { Router } from 'express';
import { chat } from '../agent/llm.js';

const router = Router();
const sessions = new Map();

// Store search history per session
function initSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, {
      messages: [],
      searches: []
    });
  }
  return sessions.get(id);
}

router.post('/', async (req, res) => {
  const { message, sessionId, activeTool, country } = req.body;

  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

  const id = sessionId || 'default';
  const session = initSession(id);
  const history = session.messages;

  history.push({ role: 'user', content: message });
  console.log(`[chat] session=${id} tool=${activeTool || 'serper'} country=${country || 'in'} msg="${message.slice(0, 60)}"`);

  try {
    const { message: reply, toolResults, searchQuery } = await chat(history, activeTool || 'serper', country || 'in');
    history.push({ role: 'assistant', content: reply });
    console.log(`[chat] reply ready, search=${searchQuery || 'none'}`);

    // Store search in history for comparison
    if (searchQuery && toolResults) {
      const tool = activeTool || 'serper';
      const results = toolResults[tool]?.results || [];
      session.searches.push({
        id: `search_${session.searches.length + 1}`,
        timestamp: new Date().toISOString(),
        query: searchQuery,
        tool,
        country,
        resultCount: results.length,
        results: results.slice(0, 5) // Store top 5 for comparison
      });
    }

    res.json({ reply, toolResults, searchQuery });
  } catch (err) {
    console.error('[chat error]', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// Get search history for comparison
router.get('/history/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId || 'default');
  if (!session) return res.json({ searches: [] });
  res.json({ searches: session.searches });
});

router.delete('/session', (req, res) => {
  sessions.delete(req.body?.sessionId || 'default');
  res.json({ ok: true });
});

export default router;
