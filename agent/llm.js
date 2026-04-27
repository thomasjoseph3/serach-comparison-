import axios from 'axios';
import { searchExa } from '../tools/exa/search.js';
import { searchTavily } from '../tools/tavily/search.js';
import { searchFirecrawl } from '../tools/firecrawl/search.js';
import { searchSerper } from '../tools/serper/search.js';
import { SYSTEM_PROMPT } from './persona.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const COUNTRY_CONFIG = {
  in: { locale: 'India', currency: 'INR', symbol: '₹', gl: 'in' },
  us: { locale: 'USA',   currency: 'USD', symbol: '$',  gl: 'us' },
  jp: { locale: 'Japan', currency: 'JPY', symbol: '¥',  gl: 'jp' }
};

const SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'search_products',
    description: 'Search for jewelry products based on user query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Short, clean search query: jewelry type + key attributes. No verbose price ranges.' }
      },
      required: ['query']
    }
  }
};

function orHeaders() {
  return {
    Authorization: `Bearer ${process.env.OPEN_ROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Jewelry Sales Agent'
  };
}

function buildSystemPrompt(country) {
  const c = COUNTRY_CONFIG[country] || COUNTRY_CONFIG.us;
  return `${SYSTEM_PROMPT}\n\n━━━ SESSION LOCALE ━━━\nUser is in: ${c.locale}\nCurrency: ${c.currency} (${c.symbol})\nAppend "${c.locale}" to all search queries. Show prices in ${c.currency}.`;
}

// Non-streaming call — used for LLM #1 (intent + tool call detection)
async function callLLM(messages, useTools) {
  const body = { model: process.env.MODEL || 'google/gemini-3-flash-preview', messages };
  if (useTools) { body.tools = [SEARCH_TOOL]; body.tool_choice = 'auto'; }
  const res = await axios.post(OPENROUTER_URL, body, { headers: orHeaders() });
  return res.data.choices[0].message;
}

// Streaming call — used for LLM #2 (conversational response after search)
async function callLLMStream(messages, onDelta) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: orHeaders(),
    body: JSON.stringify({
      model: process.env.MODEL || 'google/gemini-3-flash-preview',
      messages,
      stream: true
    })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep last incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch {}
    }
  }
}

function formatForAI(results) {
  if (!results.length) return 'No results found for this search.';
  return results.slice(0, 10).map((r, i) => [
    `[${i + 1}] ${r.name || r.title}`,
    `Price: ${r.price || 'Check website'}`,
    r.retailer   ? `Retailer: ${r.retailer}` : null,
    r.metal      ? `Metal: ${r.metal}` : null,
    r.stone      ? `Stone: ${r.stone}` : null,
    r.rating     ? `Rating: ${r.rating}/5` : null,
    r.reviews    ? `Reviews: ${r.reviews}` : null,
    r.delivery   ? `Delivery: ${r.delivery}` : null,
    r.in_stock !== null && r.in_stock !== undefined ? `Stock: ${r.in_stock ? 'Available' : 'Out of stock'}` : null,
    r.description ? `Details: ${r.description.slice(0, 200)}` : null
  ].filter(Boolean).join('\n')).join('\n\n');
}

export async function chatStream(history, activeTool = 'serpapi', country = 'in', onEvent) {
  const t0 = Date.now();
  const cfg = COUNTRY_CONFIG[country] || COUNTRY_CONFIG.us;
  const messages = [{ role: 'system', content: buildSystemPrompt(country) }, ...history];

  // LLM #1 — intent detection + query generation (non-streaming, fast)
  const t1 = Date.now();
  const firstMsg = await callLLM(messages, true);
  console.log(`[TIMING] LLM#1: ${Date.now() - t1}ms`);

  // Conversational / brand response — no search needed
  if (!firstMsg.tool_calls?.length) {
    const text = firstMsg.content;
    onEvent({ type: 'text', delta: text });

    const brandsMatch = text.match(/<brands>([\s\S]*?)<\/brands>/);
    if (brandsMatch) {
      try {
        const brands = JSON.parse(brandsMatch[1].trim());
        onEvent({ type: 'brands', brands });
      } catch {}
    }

    onEvent({ type: 'done', searchQuery: null });
    console.log(`[TIMING] total (conversational): ${Date.now() - t0}ms`);
    return { reply: text, toolResults: null, searchQuery: null };
  }

  // Search path
  const toolCall = firstMsg.tool_calls[0];
  const { query } = JSON.parse(toolCall.function.arguments);
  console.log(`[LLM] query="${query}" → ${activeTool}`);
  onEvent({ type: 'searching', query, tool: activeTool });

  const toolRunners = {
    exa:     () => searchExa(query, cfg),
    serpapi: () => searchSerper(query, cfg)
  };

  const t2 = Date.now();
  const runner = toolRunners[activeTool];
  if (!runner) throw new Error(`Unknown tool: ${activeTool}`);
  const result = await runner().catch(e => ({ results: [], error: e.message }));
  console.log(`[TIMING] ${activeTool}: ${Date.now() - t2}ms → ${result.results?.length ?? 0} results`);

  // LLM #2 — stream conversational text only.
  // The full system prompt has a MANDATORY CARD FORMAT section that overrides weak hints,
  // so we use a completely separate system message here with no card instructions at all.
  const c = COUNTRY_CONFIG[country] || COUNTRY_CONFIG.us;
  const followUp = [
    {
      role: 'system',
      content: `You are 'The Salesperson', a warm and knowledgeable jewelry AI assistant.
The user searched for jewelry and the results are provided in the tool response below.
Write exactly 1-2 friendly, natural sentences about what you found — like a helpful friend.
Currency: ${c.currency} (${c.symbol}).
STRICT RULES: Plain text only. No JSON. No markdown. No lists. No <cards> tags. No <brands> tags.`
    },
    ...history,
    firstMsg,
    {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: formatForAI(result.results || [])
    }
  ];

  const t3 = Date.now();
  let fullText = '';
  await callLLMStream(followUp, delta => {
    fullText += delta;
    onEvent({ type: 'text', delta });
  });
  console.log(`[TIMING] LLM#2 stream: ${Date.now() - t3}ms | total: ${Date.now() - t0}ms`);

  // Send products directly from raw SerpAPI data — images and URLs are reliable
  onEvent({ type: 'products', results: result.results || [] });

  const toolResults = { exa: null, serpapi: null };
  toolResults[activeTool] = result;

  onEvent({ type: 'done', searchQuery: query });
  return { reply: fullText, toolResults, searchQuery: query };
}
