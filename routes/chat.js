import { Router } from 'express';
import { chat } from '../agent/llm.js';

const router = Router();
const sessions = new Map();

router.post('/', async (req, res) => {
  const { message, sessionId, activeTool, country } = req.body;

  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

  const id = sessionId || 'default';
  if (!sessions.has(id)) sessions.set(id, []);
  const history = sessions.get(id);

  history.push({ role: 'user', content: message });
  console.log(`[chat] session=${id} tool=${activeTool || 'serper'} country=${country || 'in'} msg="${message.slice(0, 60)}"`);

  try {
    const { message: reply, toolResults, searchQuery } = await chat(history, activeTool || 'serper', country || 'in');
    history.push({ role: 'assistant', content: reply });
    console.log(`[chat] reply ready, search=${searchQuery || 'none'}`);
    res.json({ reply, toolResults, searchQuery });
  } catch (err) {
    console.error('[chat error]', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

router.delete('/session', (req, res) => {
  sessions.delete(req.body?.sessionId || 'default');
  res.json({ ok: true });
});

export default router;
