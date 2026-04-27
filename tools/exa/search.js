import axios from 'axios';
import { detectBrandsInQuery, getExaDomains } from '../../brands.js';

const EXA_SEARCH_URL   = 'https://api.exa.ai/search';
const EXA_CONTENTS_URL = 'https://api.exa.ai/contents';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exaHeaders() {
  return {
    'x-api-key':    process.env.EXA_API_KEY,
    'Content-Type': 'application/json'
  };
}

function retailerFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch { return ''; }
}

// ─── Category URL filter ──────────────────────────────────────────────────────
// Blocks listing/navigation pages; allows individual product pages.

// URL path fragments that are definitive category/listing indicators
const CATEGORY_FRAGMENTS = [
  '?sortby=', '?sort=', '?filter=', '?dir=', '?order=', '?page=',
  '/category/', '/categories/', '/collection/', '/collections/',
  '/all-jewellery', '/all-jewelry',
  'jewellery.html', 'jewelry.html',           // e.g. /chains-jewellery.html
  'necklaces.html', 'chains.html',            // listing suffix
  'pendants.html', 'earrings.html',
  'rings.html', 'bracelets.html', 'bangles.html',
  'chain-for-', 'necklace-for-', 'pendant-for-',  // e.g. /chain-for-boys.html
  'ring-for-', 'earring-for-', 'bracelet-for-',
  '/blog/', '/article/', '/news/', '/guides/', '/guide/',
  '/reviews/', '/review/', '/posts/', '/post/',
  '/about/', '/faq/', '/help/', '/contact/', '/careers/', '/press/'
];

// Indian brand PHP category page pattern — product pages always have a numeric or
// alphanumeric slug, e.g. /product/22kt-gold-chain-abc123.  Pure category PHP
// pages look like /Jewellery/Chains/boys-gold-chain.php with no product ID.
const INDIA_CATEGORY_PHP = /\/[A-Za-z-]+\/[A-Za-z-]+\/[a-z-]+-(?:chain|necklace|pendant|ring|earring|bracelet|bangle)s?\.php$/i;

// Trailing-slash category directory — e.g. /Jewellery/Chains/ or /necklaces/
const CATEGORY_DIR_PATH = /\/(?:chains?|necklaces?|pendants?|rings?|earrings?|bracelets?|bangles?|jewellery|jewelry|collections?)\/?$/i;

// Shopify: /collections/xxx without /products/xxx is a listing page
function isShopifyCategoryUrl(url) {
  const lower = url.toLowerCase();
  if (!lower.includes('/collections/')) return false;
  return !lower.includes('/products/');
}

function isCategoryUrl(url) {
  const lower = url.toLowerCase();
  if (isShopifyCategoryUrl(lower)) return true;
  if (INDIA_CATEGORY_PHP.test(url)) return true;
  if (CATEGORY_DIR_PATH.test(url)) return true;
  return CATEGORY_FRAGMENTS.some(f => lower.includes(f));
}

// ─── Image validation ─────────────────────────────────────────────────────────

const BAD_IMAGE = ['logo', 'icon', 'pixel', '1x1', 'transparent', 'favicon',
  'banner', 'header', 'footer', 'nav', 'sprite', 'blank', 'placeholder',
  'loading', 'loader', 'spinner', 'avatar', 'badge', 'arrow', 'star',
  'rating', 'flag', '/svg/', '.svg', '.gif', 'data:image'];

const GOOD_IMAGE = ['/product', '/catalog', '/assets', '/images/', '/media/',
  '/upload', '/photo', '/img/', 'cdn.', 'cloudfront.', 'imgix.', 'shopify'];

function isValidProductImage(url) {
  if (!url || url.length < 20 || !url.startsWith('https://')) return false;
  const lower = url.toLowerCase();
  return !BAD_IMAGE.some(b => lower.includes(b));
}

function bestImageFromList(urls = []) {
  const good = [], ok = [];
  for (const url of urls) {
    if (!url || !url.startsWith('http')) continue;
    const lower = url.toLowerCase();
    if (BAD_IMAGE.some(b => lower.includes(b))) continue;
    if (GOOD_IMAGE.some(g => lower.includes(g))) good.push(url);
    else ok.push(url);
  }
  return (good[0] || ok[0]) ?? null;
}

// ─── Product JSON schema — Exa's LLM extracts these fields per live-crawled page ─
const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    name:           { type: 'string',  description: 'Full product name as shown on the page' },
    price:          { type: 'string',  description: "Current price with currency symbol e.g. '₹31,500' or '$1,250'" },
    original_price: { type: 'string',  description: 'Original price before discount. Null if not on sale.' },
    discount:       { type: 'string',  description: "Discount label e.g. '20% OFF'. Null if not on sale." },
    metal:          { type: 'string',  description: 'Metal type: Yellow Gold, White Gold, Rose Gold, Platinum, Silver. Null if not mentioned.' },
    stone:          { type: 'string',  description: 'Primary gemstone: Diamond, Sapphire, Ruby, Pearl, etc. Null if none.' },
    description:    { type: 'string',  description: '1-2 sentence product description from the page' },
    delivery:       { type: 'string',  description: "Shipping or delivery info e.g. 'Free shipping'. Null if not shown." },
    rating:         { type: 'number',  description: 'Star rating 0-5 if shown. Null if not shown.' },
    reviews:        { type: 'integer', description: 'Number of customer reviews if shown. Null if not shown.' },
    image_url:      {
      type: 'string',
      description: (
        'Primary product image URL from this specific product page. ' +
        'Priority: 1) JSON-LD Product schema "image" field, ' +
        '2) og:image meta tag only if it shows the specific product (not a brand logo), ' +
        '3) largest product photo in the page body. ' +
        'Must be a full absolute HTTPS URL. Null if not found.'
      )
    }
  },
  required: ['name', 'price']
};

// Fallback regex for price — used only when schema extraction returns nothing
function extractPrice(text = '') {
  const m = text.match(/(?:₹|Rs\.?\s*|USD?\s*|\$|£|€|¥)\s*[\d,]+(?:\.\d{1,2})?/i);
  return m ? m[0].replace(/\s+/g, '') : null;
}

function extractMetalAndStone(text = '') {
  const metals = ['white gold', 'yellow gold', 'rose gold', 'platinum', 'silver', 'gold'];
  const stones = ['diamond', 'sapphire', 'ruby', 'emerald', 'pearl', 'topaz', 'solitaire'];
  const lower  = text.toLowerCase();
  return {
    metal: metals.find(m => lower.includes(m)) ?? null,
    stone: stones.find(s => lower.includes(s)) ?? null,
  };
}

// ─── Step 1: Exa /search — find product page URLs ────────────────────────────
async function findProductUrls(query, includeDomains) {
  const res = await axios.post(
    EXA_SEARCH_URL,
    {
      query,
      numResults:    12,          // request more so we have enough after filtering
      type:          'auto',
      useAutoprompt: true,
      includeDomains,
      contents: {
        highlights: { numSentences: 2, highlightsPerUrl: 1 }  // numSentences deprecated but still works
      }
    },
    { headers: exaHeaders() }
  );

  const raw = res.data.results || [];
  console.log(`  [Exa] Search returned ${raw.length} raw results`);

  const seen = new Set();
  const urls = [];
  for (const r of raw) {
    if (!r.url?.startsWith('https://')) continue;
    if (isCategoryUrl(r.url)) {
      console.log(`  [Exa] DROP (category URL): ${r.url.slice(0, 80)}`);
      continue;
    }
    try {
      const key = new URL(r.url).hostname + new URL(r.url).pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push({ url: r.url, title: r.title, highlights: r.highlights });
    } catch {}
  }

  console.log(`  [Exa] ${urls.length} unique product URLs after filtering`);
  return urls.slice(0, 8);
}

// ─── Step 2: Exa /contents — live-crawl each URL with schema extraction ──────
async function fetchPageContents(urlObjs, query) {
  const ids = urlObjs.map(u => u.url);
  console.log(`  [Exa] Fetching live contents for ${ids.length} pages...`);

  try {
    const res = await axios.post(
      EXA_CONTENTS_URL,
      {
        ids,
        maxAgeHours:       0,          // 0 = always live-crawl fresh (replaces deprecated livecrawl:'always')
        livecrawlTimeout:  12000,
        summary: {
          query: (
            `This is a product page. Extract details for: ${query}. ` +
            'Find the exact product name, current price with ₹ or $ symbol, ' +
            'metal type (Gold/Platinum/Silver), primary gemstone, any discount, ' +
            'delivery info, star rating, number of reviews, and the direct product image URL. ' +
            'If this is a listing page with multiple products, extract the single most relevant product.'
          ),
          schema: PRODUCT_SCHEMA
        },
        extras: { image_links: 10 }  // fallback image pool from page
      },
      { headers: exaHeaders() }
    );

    return res.data.results || [];
  } catch (err) {
    console.error('  [Exa] /contents error:', err.response?.data?.message || err.message);
    return [];
  }
}

// ─── Merge search + contents into a clean product object ──────────────────────
function buildProduct(searchResult, contentsResult) {
  const url   = contentsResult?.url || searchResult.url;
  const title = contentsResult?.title || searchResult.title || 'Untitled';

  // ── Structured extraction from Exa's schema (primary source) ──
  const schema = (() => {
    const s = contentsResult?.summary;
    if (!s) return {};
    if (typeof s === 'object') return s;
    try { return JSON.parse(s); } catch { return {}; }
  })();

  // ── Fallback text-based extraction ──
  const rawText   = contentsResult?.text || '';
  const hlText    = (searchResult.highlights || []).join(' ');
  const fullText  = `${hlText} ${rawText}`;
  const fallbackPriceRaw = extractPrice(fullText);
  const { metal: fallbackMetal, stone: fallbackStone } = extractMetalAndStone(fullText);

  // ── Image resolution (schema → r.image → extras.image_links) ──
  let image_url = null;
  if (isValidProductImage(schema.image_url)) {
    image_url = schema.image_url;
  }
  if (!image_url) {
    const exaImage = contentsResult?.image;
    if (isValidProductImage(exaImage)) image_url = exaImage;
  }
  if (!image_url) {
    const extras = contentsResult?.extras;
    const pool   = extras?.image_links || extras?.imageLinks || [];
    image_url = bestImageFromList(pool);
  }

  return {
    name:           schema.name           || title,
    url,
    price:          schema.price          || fallbackPriceRaw,
    original_price: schema.original_price || null,
    discount:       schema.discount       || null,
    retailer:       retailerFromUrl(url),
    description:    schema.description    || rawText.slice(0, 400) || hlText.slice(0, 400),
    image_url,
    rating:         schema.rating         ?? null,
    reviews:        schema.reviews        ?? null,
    delivery:       schema.delivery       || null,
    metal:          schema.metal          || fallbackMetal,
    stone:          schema.stone          || fallbackStone,
    in_stock:       /out of stock|unavailable/i.test(rawText) ? false : null,
  };
}

// ─── Drop invalid products (category pages that slipped through) ─────────────
function isValidProduct(p) {
  if (!p.name || p.name === 'null' || p.name === 'Untitled') return false;
  if (!p.price || p.price === 'null') return false;
  // Reject ₹0 / $0 / £0 — a sign the page had no product price
  if (/[₹$£€]\s*0+(?:\.0+)?$/.test(p.price)) return false;
  return true;
}

// ─── Domain-level dedup — max 2 products per root domain ─────────────────────
function deduplicateByDomain(products, max = 2) {
  const counts = {};
  const out    = [];
  for (const p of products) {
    let root = p.url;
    try {
      const parts = new URL(p.url).hostname.split('.');
      root = parts.slice(-2).join('.');
    } catch {}
    if ((counts[root] ?? 0) >= max) continue;
    counts[root] = (counts[root] ?? 0) + 1;
    out.push(p);
  }
  return out;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function searchExa(query, cfg) {
  if (!process.env.EXA_API_KEY) {
    return { results: [], error: 'EXA_API_KEY not configured', raw: null };
  }

  const gl          = cfg?.gl || 'in';
  const localeLabel = { in: 'India', us: 'USA', gb: 'UK', jp: 'Japan' }[gl] || 'India';
  const finalQuery  = `${query} ${localeLabel}`;

  const brandDomains   = detectBrandsInQuery(query);
  const includeDomains = brandDomains.length ? brandDomains : getExaDomains(gl);

  console.log(`  [Exa] query="${finalQuery}"`);
  console.log(`  [Exa] mode=${brandDomains.length ? 'brand-specific' : 'locale-generic'} | domains=[${includeDomains.join(', ')}]`);

  // Step 1: find product URLs
  const searchResults = await findProductUrls(finalQuery, includeDomains);
  if (!searchResults.length) {
    console.log('  [Exa] No results from search step');
    return { results: [], raw: null };
  }

  // Step 2: live-crawl + schema extract
  const contentsArr = await fetchPageContents(searchResults, finalQuery);

  // Build URL → contents map
  const contentsMap = new Map();
  for (const c of contentsArr) {
    if (c.url) contentsMap.set(c.url, c);
  }

  // Merge, validate, dedup, slice
  const merged  = searchResults.map(sr => buildProduct(sr, contentsMap.get(sr.url)));
  const valid   = merged.filter(isValidProduct);
  const results = deduplicateByDomain(valid).slice(0, 10);

  console.log(
    `  [Exa] ${results.length} final products ` +
    `(${results.filter(r => r.price).length} with price, ` +
    `${results.filter(r => r.image_url).length} with image)`
  );
  return { results, raw: { searchResults, contentsMap: Object.fromEntries(contentsMap) } };
}
