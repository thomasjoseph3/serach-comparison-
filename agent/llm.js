import axios from 'axios';
import { searchExa } from '../tools/exa/search.js';
import { searchTavily } from '../tools/tavily/search.js';
import { searchFirecrawl } from '../tools/firecrawl/search.js';
import { searchSerper } from '../tools/serper/search.js';
import { SYSTEM_PROMPT } from './persona.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const COUNTRY_CONFIG = {
  in: { locale: 'India', currency: 'INR', symbol: '₹',  gl: 'in' },
  us: { locale: 'USA',   currency: 'USD', symbol: '$',   gl: 'us' },
  jp: { locale: 'Japan', currency: 'JPY', symbol: '¥',   gl: 'jp' }
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

async function callLLM(messages, useTools) {
  const body = { model: process.env.MODEL || 'google/gemini-3-flash-preview', messages };
  if (useTools) { body.tools = [SEARCH_TOOL]; body.tool_choice = 'auto'; }
  const res = await axios.post(OPENROUTER_URL, body, { headers: orHeaders() });
  return res.data.choices[0].message;
}

function formatForAI(results) {
  if (!results.length) return 'No results found for this search.';
  return results.slice(0, 15).map((r, i) => [
    `[${i + 1}] ${r.name || r.title}`,
    `URL: ${r.url}`,
    r.price    ? `Price: ${r.price}`    : null,
    r.retailer ? `Retailer: ${r.retailer}` : null,
    r.metal    ? `Metal: ${r.metal}`    : null,
    r.stone    ? `Stone: ${r.stone}`    : null,
    r.rating   ? `Rating: ${r.rating}/5`   : null,
    r.reviews  ? `Reviews: ${r.reviews}`: null,
    r.delivery ? `Delivery: ${r.delivery}`: null,
    r.in_stock !== undefined ? `Stock: ${r.in_stock ? 'Available' : 'Out of stock'}` : null,
    r.image_url ? `Image: ${r.image_url}` : null,
    r.description ? `Details: ${r.description.slice(0, 300)}` : null
  ].filter(Boolean).join('\n')).join('\n\n');
}

export async function chat(history, activeTool = 'serpapi', country = 'in') {
  const cfg = COUNTRY_CONFIG[country] || COUNTRY_CONFIG.us;
  const messages = [{ role: 'system', content: buildSystemPrompt(country) }, ...history];

  console.log(`[LLM] ${messages.length} messages, tool=${activeTool}, country=${country}`);
  const firstMsg = await callLLM(messages, true);

  if (!firstMsg.tool_calls?.length) {
    console.log('[LLM] conversational response (no tool call)');
    return { message: firstMsg.content, toolResults: null, searchQuery: null };
  }

  const toolCall = firstMsg.tool_calls[0];
  const { query } = JSON.parse(toolCall.function.arguments);
  console.log(`[LLM] search query="${query}" → ${activeTool}`);

  // Run selected tool
  const toolRunners = {
    exa:       () => searchExa(query, cfg),
    tavily:    () => searchTavily(query, cfg),
    firecrawl: () => searchFirecrawl(query, cfg),
    serpapi:   () => searchSerper(query, cfg)
  };

  const runner = toolRunners[activeTool] || toolRunners.serpapi;
  const result = await runner().catch(e => ({ results: [], error: e.message }));

  const toolResults = { exa: null, tavily: null, firecrawl: null, serpapi: null };
  toolResults[activeTool] = result;
  console.log(`  → ${activeTool} returned ${result.results?.length ?? 0} results`);

  const followUp = [
    ...messages,
    firstMsg,
    { role: 'tool', tool_call_id: toolCall.id, content: formatForAI(result.results || []) }
  ];

  console.log('[LLM] sending results to AI for formatting');
  const finalMsg = await callLLM(followUp, false);

  return { message: finalMsg.content, toolResults, searchQuery: query };
}
