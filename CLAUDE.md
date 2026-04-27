# The Salesperson — Jewelry AI Agent (Project Reference)

> Full codebase context for AI assistants. Read this first before touching any file.

---

## What This Is

A demo app built for **5 clients** to compare search tool quality side-by-side. It is a jewelry shopping AI agent ("The Salesperson") that lets users search for jewelry products and compare results from two different search backends: **SerpAPI** (Google Shopping) and **Exa** (neural web search).

**The goal:** clients switch between tools and regions, run the same query, and judge which gives better product results.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node 22 (ESM, `"type": "module"`) |
| Server | Express |
| DB | MongoDB via Mongoose |
| Auth | JWT (`jsonwebtoken`) |
| LLM | OpenRouter → `google/gemini-3-flash-preview` (configurable via `MODEL` env var) |
| Search tools | SerpAPI (Google Shopping), Exa (neural) |
| Frontend | Vanilla JS + CSS (no framework), SSE streaming |
| Hosting | Vercel (`maxDuration: 60`, `nodejs22.x`) |

---

## File Map

```
/
├── server.js                  Express entry point, serves /public + /api routes
├── vercel.json                Vercel config — all routes go through server.js
├── brands.js                  Brand alias map + locale domain lists (Exa/Firecrawl)
├── agent/
│   ├── llm.js                 Core pipeline: 2-LLM + search + SSE streaming
│   └── persona.js             System prompt for The Salesperson (SYSTEM_PROMPT)
├── routes/
│   ├── auth.js                POST /api/auth/login → JWT
│   └── chat.js                POST /api/chat (SSE), GET /session, GET /history, DELETE /session
├── models/
│   ├── User.js                { username, password, name }
│   ├── ChatSession.js         { userId, messages[{role, content, products, searchQuery, tool}] }
│   └── Search.js              { userId, query, tool, country, aiReply, results[], resultCount }
├── middleware/
│   └── auth.js                requireAuth middleware (verifies JWT Bearer token)
├── db/
│   └── connection.js          connectDB() — singleton Mongoose connection
├── tools/
│   ├── exa/search.js          searchExa(query, cfg) — neural web search
│   └── serper/search.js       searchSerper(query, cfg) — Google Shopping
├── public/
│   ├── index.html             Single-page app shell (login → tool selector → chat)
│   ├── app.js                 All frontend logic (auth, SSE streaming, card rendering)
│   └── style.css              Dark theme, card styles, shimmer animation
└── scripts/
    └── seed.js                Seeds 5 demo users: user1–user5 (password: pass1234)
```

---

## Environment Variables

```
OPEN_ROUTER_API_KEY   OpenRouter API key (routes to Gemini/OpenAI/etc)
SERP_API_KEY          SerpAPI key (Google Shopping)
EXA_API_KEY           Exa.ai API key
MONGO_URL             MongoDB connection string
JWT_SECRET            JWT signing secret
MODEL                 (optional) LLM model ID, default: google/gemini-3-flash-preview
```

**Unused / legacy keys** still in `vercel.json` env block but not wired up:
- `TAVILY_API_KEY`, `FIRE_CRAWL_API_KEY` — Tavily and Firecrawl were removed. Keep keys in vercel.json but the code doesn't call them.

---

## Architecture: The 2-LLM Pipeline

Every user message goes through this sequence:

```
User message
     │
     ▼
[LLM #1 — non-streaming]  (callLLM, useTools=true)
  System prompt = SYSTEM_PROMPT + locale context
  Tool definition = buildSearchTool(activeTool, cfg) — locale-aware query style + price hints
  Model decides: conversational reply OR tool call?
     │
     ├── No tool call → emit text delta, parse <brands>, emit done
     │
     └── Tool call (search_products) → extract query, maxPrice, minPrice
              │
              ▼
         [Search tool runs]
           SerpAPI: Google Shopping → structured product data
           Exa:     Neural search   → web page content
              │
              ▼
         [LLM #2 — streaming]  (callLLMStream)
           System prompt = STRIPPED (1-2 sentence reply only, NO cards/JSON)
           Context = history + LLM#1 message + tool result (formatForAI text)
              │
              ▼
         SSE events: text deltas → products → done
```

**Why two LLMs?**
- LLM #1 decides whether to search and generates the clean search query
- LLM #2 only writes 1-2 friendly sentences — it NEVER formats cards (products come from raw search data, not the LLM)
- This prevents the LLM from mangling image URLs and product links

**Critical**: LLM #2's system prompt is a completely separate, minimal prompt (defined inline in `llm.js`). It does NOT inherit `SYSTEM_PROMPT` from `persona.js`. The `persona.js` prompt has `MANDATORY CARD FORMAT` which would override weak hints — the only reliable fix was to replace the entire system message.

---

## Locale / Region System

### COUNTRY_CONFIG (`agent/llm.js`)

```js
const COUNTRY_CONFIG = {
  in: { locale: 'India', currency: 'INR', symbol: '₹', gl: 'us' },
  us: { locale: 'USA',   currency: 'USD', symbol: '$',  gl: 'us' },
  jp: { locale: 'Japan', currency: 'JPY', symbol: '¥',  gl: 'jp' }
};
```

The `cfg` object from this map is threaded through the entire pipeline:
- `buildSystemPrompt(country)` — injects locale + currency into the LLM system prompt
- `buildSearchTool(activeTool, cfg)` — makes query style examples and `maxPrice`/`minPrice` descriptions locale-aware
- `searchSerper(query, cfg)` — uses `cfg.gl` to look up correct SerpAPI locale params (`gl`, `hl`, `location`)
- `searchExa(query, cfg)` — uses `cfg.gl` to pick the right domain list and append the locale label to queries

### Query style is locale-aware (`buildQueryStyle`)

`QUERY_STYLE` is a function, not a static object. It receives the locale label (e.g. "USA") and injects it into query examples so LLM #1 always generates country-appropriate queries. Previously hardcoded "India" examples caused Indian results regardless of selected region.

### Price fields are locale-aware

`maxPrice`/`minPrice` tool descriptions explicitly state the current currency (e.g. "Budget ceiling in USD ($). Do NOT carry forward price numbers from a previous region."). This prevents the LLM from applying INR-scale numbers to USD searches when a user switches region mid-conversation.

### Backend price sanity cap (`tools/serper/search.js`)

Even if the LLM passes a stale cross-currency price (e.g. ₹1,00,000 min applied to a USD search), the backend caps it: if `minPrice > naturalFloor × 500` for the current locale, it is nullified. For USA diamonds the natural floor is $100, so any min above $50,000 is automatically dropped. Logged as `minPrice X sanity-capped to null`.

### SerpAPI locale params (`SERP_LOCALE_PARAMS`)

```js
const SERP_LOCALE_PARAMS = {
  in: { gl: 'in', hl: 'en', location: 'India' },
  us: { gl: 'us', hl: 'en' },
  gb: { gl: 'gb', hl: 'en', location: 'United Kingdom' },
  jp: { gl: 'jp', hl: 'ja', location: 'Japan' },
};
```

Previously the raw `cfg` object was spread into SerpAPI params, which missed `hl` and included irrelevant fields (`locale`, `currency`, `symbol`).

---

## SSE Event Types (`/api/chat`)

The chat endpoint streams Server-Sent Events. Client reads with `fetch` + `ReadableStream`.

| Event type | Payload | When emitted |
|------------|---------|--------------|
| `searching` | `{ query, tool }` | After LLM #1 decides to search |
| `text` | `{ delta }` | Each token from LLM #2 |
| `products` | `{ results[] }` | After search completes (raw product array) |
| `brands` | `{ brands[] }` | If LLM #1 replied with `<brands>` block |
| `error` | `{ message }` | On any exception |
| `done` | `{ searchQuery }` | Stream finished |

Products are emitted from **raw search data**, not from LLM output. This is intentional — the LLM cannot be trusted to preserve image URLs and product links accurately.

---

## Search Tools

### SerpAPI (`tools/serper/search.js`) — RECOMMENDED

- **Engine**: `google_shopping`
- **Images**: `r.thumbnail` — Google-indexed product images, reliable HTTPS
- **URL**: `r.product_link` (direct retailer page) OR `r.link` (Google Shopping page) — **priority: product_link first**
- **Data**: price, rating, reviews, delivery, availability, stock status, metal/stone attributes
- **Filters**: drops out-of-stock products, drops products with no URL, spam title filter, price floor/ceiling, domain dedup, title dedup
- **Max results**: 10 (fetches 20 raw, quality-filters down)

**Why it's better**: Real product thumbnails, structured shopping data, direct retailer URLs, stock status.

### Exa (`tools/exa/search.js`)

- **Type**: `auto` (picks between neural and keyword per query)
- **Images**: schema extraction → `r.image` → `extras.image_links` pool — unreliable, often null
- **URL**: `r.url` — the page URL (HTTPS only after filtering)
- **Data**: live-crawled via `/contents` with structured schema extraction
- **Filters**: HTTPS-only, category/listing URL filter, domain dedup (max 2 per root domain)
- **numResults**: 12 fetched → filtered → max 10

**Known limitations**: No dedicated product image API. Many retailer pages have missing og:image. Falls back to 💎 placeholder. This is a fundamental Exa limitation.

---

## Frontend Architecture (`public/app.js`)

### Auth flow
1. Check `localStorage` for `auth_token` + `auth_user`
2. If found + `pref_tool` set → skip overlay, call `launchApp()` directly
3. `launchApp()` calls `restoreSession()` — fetches `/api/chat/session` and re-renders messages

### Session restore
`restoreSession()` renders past messages from MongoDB. Assistant messages include:
- `msg.content` — text (rendered via `marked.parse()` for markdown)
- `msg.products` — raw product array (renders cards without re-querying)
- `msg.searchQuery` — shown in tool badge
- `msg.tool` — which tool was used (for "try with X" rerun bar)

**Note**: Sessions saved before the `products` field was added will restore text-only (no cards). This is expected.

### Streaming (`sendMessage`)
Reads SSE stream. Key points:
- `text` events: accumulate in `fullText`, cut off at `<cards>` (safety net), render with `marked.parse()`
- `searching` event: show tool badge immediately
- `products` event: show 400ms shimmer → replace with real cards
- Empty bubble is removed if text was empty (pure product search)

### Markdown rendering
Uses `marked.js` v12 (CDN). Both streaming text and restored sessions use `marked.parse()`. AI bubble CSS styles bold text in gold (`var(--gold)`), lists with proper spacing.

### Header controls

| Control | Desktop | Mobile |
|---------|---------|--------|
| Tool switcher | Visible in header | Visible in header |
| Compare (📊) | Visible when history exists | Visible when history exists |
| Country flag | Clickable dropdown | Clickable dropdown |
| User badge | Shows initial, opens dropdown | Shows initial, opens dropdown |
| New conversation | — (in user dropdown) | — (in user dropdown) |
| Sign out | — (in user dropdown) | — (in user dropdown) |

**User badge dropdown** contains: username, "↺ New conversation", "⏻ Sign out". Both `doNewConversation()` and `doLogout()` are extracted as shared functions used by both the dropdown and (on desktop) the dedicated header buttons.

### Tool switching
- Header button opens dropdown → switch `activeTool` mid-conversation, saved to `localStorage`
- Each product card set has a "Try with: [other tool]" bar that re-sends the same query with the other tool
- `TOOL_META` only has `serpapi` and `exa` — Tavily/Firecrawl were removed

### Region switching
- Country flag badge is a clickable dropdown (🇮🇳 India / 🇺🇸 USA / 🇯🇵 Japan)
- Switching updates `activeCountry` in memory and `pref_country` in `localStorage` immediately
- Every new message sent uses the current `activeCountry` — no reload needed
- Past messages/cards in the conversation are not retroactively changed

---

## Users

5 demo users seeded via `scripts/seed.js` (run `node scripts/seed.js` to apply):

| Username | Password | Name |
|----------|----------|------|
| user1 | pass1234 | User One |
| user2 | pass1234 | User Two |
| user3 | pass1234 | User Three |
| user4 | pass1234 | User Four |
| user5 | pass1234 | User Five |

---

## Known Issues / Design Decisions

### Why products bypass the LLM
Early version had LLM format `<cards>` JSON — this caused:
- Images dropped/truncated (LLM can't reliably copy long URLs)
- Wrong URLs (LLM rewrites `product_link` to `link`)
- JSON leaking into the visible text stream
**Solution**: LLM #2 writes only 1-2 sentences. Products come directly from raw search data via `products` SSE event.

### Why no fallback between tools
User selects their tool intentionally for comparison. No silent fallback — if Exa returns nothing, the LLM tells the user honestly. The user can press "Try with SerpAPI" explicitly.

### Why Node 22
`callLLMStream` uses native `fetch` with `ReadableStream` — requires Node 18+. Specified in `package.json` (`engines.node: "22.x"`) and `vercel.json` (`runtime: nodejs22.x`).

### Exa image quality
Exa has no dedicated product image API. Images come from og:image metadata scraped from the page. Many retailer pages have missing or low-quality og:image. Falls back to 💎 placeholder. This is a fundamental Exa limitation.

### `persona.js` MANDATORY CARD FORMAT
The `SYSTEM_PROMPT` in `persona.js` still has a `MANDATORY CARD FORMAT` section. This is intentionally left there because LLM #1 (which uses it) used to format cards. Since we moved to raw-data products, this section is now inert for the product flow — but it's harmless and we keep it in case it's needed again. LLM #2 uses its own stripped system prompt.

### Price context when switching regions
If a user specifies a price range in one region (e.g. ₹1,00,000–₹3,00,000 in India) and then switches to USA, the LLM may carry those numbers forward. Two safeguards:
1. `maxPrice`/`minPrice` tool descriptions explicitly state the current currency and warn against cross-region carry-over
2. Backend sanity cap in `searchSerper`: if `minPrice > naturalFloor × 500` for the locale, it is nullified before filtering

---

## Deployment (Vercel)

```bash
vercel --prod
```

All API routes (`/api/*`) and static files route through `server.js`. SSE works because `maxDuration: 60` gives the function enough time to stream. The `res.flushHeaders()` call is required to start the SSE stream before Vercel's timeout kicks in.

**Unused env vars** (`TAVILY_API_KEY`, `FIRE_CRAWL_API_KEY`) remain in `vercel.json` — harmless, no code calls them.

---

## What Was Tried and Abandoned

| Approach | Why abandoned |
|----------|---------------|
| LLM formats `<cards>` JSON | Images/URLs mangled by LLM, JSON leaked into streamed text |
| Organic fallback in SerpAPI | Returns non-product pages, bad URLs, no images |
| Tavily + Firecrawl | Removed — only Exa and SerpAPI for this comparison |
| `type: 'neural'` for Exa | Changed to `'auto'` — auto picks best mode per query |
| `r.link` as primary URL in SerpAPI | `r.link` = Google Shopping page; `r.product_link` = direct retailer — priority swapped |
| `r.score` as star rating for Exa | It's a 0–1 relevance float, not stars — set to `null` |
| `in_stock: true` hardcoded for Exa | Exa has no stock data — set to `null` |
| Static `QUERY_STYLE` object | Hardcoded "India" in examples → Indian results regardless of selected region |
| Spreading raw `cfg` into SerpAPI params | Sent irrelevant fields, missed `hl` — replaced with `SERP_LOCALE_PARAMS` map |

---

## Future Improvement: Single Streaming LLM Call

Current 2-LLM pipeline adds 2-6 seconds of blank wait before any text appears. ChatGPT-style UX requires a **single streaming call** where:
1. The model starts streaming tokens within ~200ms
2. If it emits a `tool_call` chunk mid-stream, pause, run search, inject result, resume streaming

OpenRouter supports streaming tool calls. This would require refactoring `llm.js` to:
- Single `callLLMStream` with `tools` enabled
- Parse `delta.tool_calls` chunks from the stream
- Handle the pause-run-resume cycle

This is the most impactful UX improvement remaining.
