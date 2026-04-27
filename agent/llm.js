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

const QUERY_STYLE = {
  exa: (
    'Natural language sentence describing exactly what the user wants — Exa is a neural search engine. ' +
    'Write it like a product description, e.g. "gold chain necklace for a young boy aged 5-10 years in India" ' +
    'or "diamond solitaire engagement ring in white gold for women India". ' +
    'Include material, style, occasion, recipient, and country. Do NOT use keyword lists.'
  ),
  serpapi: (
    'Keyword-dense Google Shopping query. Structure: [Brand] + jewelry type + material + attributes + country. ' +
    'Rules: ' +
    '(1) Material specificity — "22kt yellow gold" not just "gold", "VVS diamond" not just "diamond". ' +
    '(2) Brand first — if user names a brand, put it first: "Tanishq 22kt gold chain India". ' +
    '(3) Occasion — include it: engagement, wedding, anniversary, gifting, daily wear, office wear. ' +
    '(4) Recipient — include it: men, women, kids, boys, girls, baby, bride. ' +
    '(5) Style — include if mentioned: solitaire, cluster, tennis, choker, bangle, stud, hoop. ' +
    '(6) Budget — NEVER put price numbers in the query. Extract budget to maxPrice/minPrice fields. ' +
    'GOOD: "Tanishq 22kt gold necklace women India" | "VVS diamond engagement ring platinum India" | "kids gold chain boys 22kt India". ' +
    'BAD: "affordable gold ring" | "ring under 50000" | "nice jewelry for wife".'
  ),
  firecrawl: (
    'Short keyword-style search query: jewelry type + key attributes only. ' +
    'e.g. "gold chain necklace kids boys India" or "diamond ring women white gold India". ' +
    'No sentences, no filler words.'
  )
};

function buildSearchTool(activeTool) {
  const properties = {
    query: { type: 'string', description: QUERY_STYLE[activeTool] || QUERY_STYLE.serpapi }
  };

  // Serper gets structured budget fields so the filter can enforce a price ceiling/floor
  if (activeTool === 'serpapi') {
    properties.maxPrice = {
      type: 'number',
      description: [
        'Budget ceiling in local currency. Three cases:',
        '1. Explicit number — use it directly: "under ₹50,000" → 50000, "budget ₹1 lakh" → 100000.',
        '2. Vague budget word — estimate from category + locale:',
        '   India (INR): affordable/cheap/budget → gold=18000, diamond=45000, silver=4000, default=12000.',
        '   India (INR): mid-range → gold=50000, diamond=150000, silver=12000, default=40000.',
        '   USA (USD): affordable → gold=400, diamond=1200, default=300.',
        '   USA (USD): mid-range → gold=1500, diamond=5000, default=1000.',
        '3. No budget signal at all — set NULL. Do NOT invent a ceiling when the user did not imply one.'
      ].join(' ')
    };
    properties.minPrice = {
      type: 'number',
      description: [
        'Budget floor in local currency. Three cases:',
        '1. Explicit lower bound: "between ₹20,000 and ₹50,000" → 20000.',
        '2. Vague premium/luxury word — estimate floor:',
        '   India (INR): premium/luxury/high-end → gold=80000, diamond=200000, default=60000.',
        '   USA (USD): premium/luxury → gold=2000, diamond=8000, default=1500.',
        '3. No signal — set NULL.'
      ].join(' ')
    };
  }

  return {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search for jewelry products based on the user request and chat history.',
      parameters: {
        type: 'object',
        properties,
        required: ['query']
      }
    }
  };
}

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
async function callLLM(messages, useTools, activeTool = 'serpapi') {
  const body = { model: process.env.MODEL || 'google/gemini-3-flash-preview', messages };
  if (useTools) { body.tools = [buildSearchTool(activeTool)]; body.tool_choice = 'auto'; }
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
  const requestId = Math.random().toString(36).slice(2, 7).toUpperCase();
  const t0 = Date.now();
  const cfg = COUNTRY_CONFIG[country] || COUNTRY_CONFIG.us;
  const messages = [{ role: 'system', content: buildSystemPrompt(country) }, ...history];

  console.log(`\n[${requestId}] === START CHAT ===`);
  console.log(`[${requestId}] Tool: ${activeTool} | Country: ${country}`);

  // LLM #1 — intent detection + query generation (query style depends on active tool)
  const t1 = Date.now();
  const firstMsg = await callLLM(messages, true, activeTool);
  console.log(`[${requestId}] [TIMING] LLM #1 (Intent): ${Date.now() - t1}ms`);

  if (!firstMsg.tool_calls?.length) {
    const text = firstMsg.content;
    console.log(`[${requestId}] Mode: Conversational`);
    onEvent({ type: 'text', delta: text });
    onEvent({ type: 'done', searchQuery: null });
    return { reply: text, toolResults: null, searchQuery: null };
  }

  const toolCall = firstMsg.tool_calls[0];
  const { query, maxPrice, minPrice } = JSON.parse(toolCall.function.arguments);
  console.log(`[${requestId}] [LLM Query] Generated: "${query}"${maxPrice ? ` | max=₹${maxPrice}` : ''}${minPrice ? ` | min=₹${minPrice}` : ''}`);
  onEvent({ type: 'searching', query, tool: activeTool });

  const toolRunners = {
    exa:       () => searchExa(query, cfg),
    serpapi:   () => searchSerper(query, { ...cfg, maxPrice: maxPrice || null, minPrice: minPrice || null }),
    firecrawl: () => searchFirecrawl(query, cfg)
  };

  const t2 = Date.now();
  const runner = toolRunners[activeTool];
  if (!runner) throw new Error(`Unknown tool: ${activeTool}`);
  
  console.log(`[${requestId}] [TOOL] Executing ${activeTool}...`);
  const result = await runner().catch(e => ({ results: [], error: e.message }));
  
  // VERBOSE LOGGING OF RESULTS
  console.log(`[${requestId}] [TOOL RESULTS] Found ${result.results?.length ?? 0} items:`);
  (result.results || []).forEach((r, i) => {
    console.log(`    ${i+1}. [${r.retailer}] ${r.name.slice(0, 50)}... | ${r.price || 'No Price'} | URL: ${r.url}`);
  });
  console.log(`[${requestId}] [TIMING] Tool Latency: ${Date.now() - t2}ms`);

  // LLM #2 — stream response
  const followUp = [
    {
      role: 'system',
      content: `You are 'The Salesperson'.
The user wants: ${query}
You have results from: ${activeTool}
STRICT FILTER: If the user asked for rings and the results are earrings, apologize and say you couldn't find rings.
Write 1-2 friendly sentences. Plain text only. No <cards> tags.`
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

  if (!fullText.trim()) {
    fullText = result.results?.length ? "Found some options for you!" : "No matches found.";
    onEvent({ type: 'text', delta: fullText });
  }

  onEvent({ type: 'products', results: result.results || [] });
  console.log(`[${requestId}] [TIMING] LLM #2: ${Date.now() - t3}ms | TOTAL: ${Date.now() - t0}ms`);
  console.log(`[${requestId}] === END CHAT ===\n`);
  
  return { reply: fullText, toolResults: { [activeTool]: result }, searchQuery: query };
}
