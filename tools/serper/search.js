import axios from 'axios';

const SERPAPI_URL = 'https://serpapi.com/search.json';

// ─── Locale detection ───────────────────────────────────────────────────────
function detectLocale(query) {
  const q = query.toLowerCase();
  if (/india|inr|₹|lakh|kerala|mumbai|delhi|bangalore|chennai|hyderabad|kolkata|pune|jaipur/.test(q)) {
    return { gl: 'in', hl: 'en', location: 'India' };
  }
  if (/\buk\b|gbp|£|london|britain/.test(q)) {
    return { gl: 'gb', hl: 'en', location: 'United Kingdom' };
  }
  if (/japan|jpy|¥|tokyo/.test(q)) {
    return { gl: 'jp', hl: 'en', location: 'Japan' };
  }
  return { gl: 'us', hl: 'en' };
}

const OUT_OF_STOCK = /out of stock|unavailable|discontinued|no longer available|sold out/i;

// ─── Spam / junk title patterns ─────────────────────────────────────────────
// Catches costume / low-quality / synthetic-stone products
const SPAM_TITLE = /\b(lot of|set of|wholesale|bulk|fashion gold|gold plated|gold tone|gold filled|gold color|gold colour|costume|imitation|artificial|fake|synthetic|lab.?created|lab.?grown|simulated|glass stone|acrylic|cubic zirconia|\bcz\b|zircon stone|rhinestone|crystal stone|american diamond)\b/i;

// ─── Price parser: "₹4,299" / "$89.99" / "4299" → number ───────────────────
function parsePrice(priceStr) {
  if (!priceStr) return null;
  // Strip currency symbols, commas, spaces — keep digits and dot
  const cleaned = String(priceStr).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── Category-aware price floor (in local currency) ─────────────────────────
const PRICE_FLOORS = {
  // INR floors
  in: {
    diamond:  5000,
    gemstone: 4000,  // ruby / emerald / sapphire / pearl etc.
    gold:     3000,
    silver:    500,
    default:  1000,
  },
  // USD floors
  us: {
    diamond:  100,
    gemstone:  60,
    gold:      50,
    silver:    10,
    default:   15,
  },
  // GBP floors
  gb: {
    diamond:  80,
    gemstone: 50,
    gold:     40,
    silver:    8,
    default:  12,
  },
  // JPY floors
  jp: {
    diamond:  15000,
    gemstone: 10000,
    gold:      6000,
    silver:    1000,
    default:   2000,
  }
};

function detectCategory(query) {
  const q = query.toLowerCase();
  if (/diamond/.test(q))                                          return 'diamond';
  if (/ruby|emerald|sapphire|pearl|opal|topaz|amethyst|jade|coral|turquoise|garnet|tanzanite/.test(q)) return 'gemstone';
  if (/gold/.test(q))                                             return 'gold';
  if (/silver/.test(q))                                           return 'silver';
  return 'default';
}

function getPriceFloor(gl, category, overrideFloor) {
  if (overrideFloor != null) return overrideFloor;
  const floors = PRICE_FLOORS[gl] || PRICE_FLOORS.us;
  return floors[category] || floors.default;
}

// ─── Title similarity (simple token-overlap ratio) ───────────────────────────
// Returns 0–1. 1 = identical.
function titleSimilarity(a, b) {
  const tokenise = s => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
  const setA = tokenise(a);
  const setB = tokenise(b);
  if (!setA.size || !setB.size) return 0;
  let common = 0;
  for (const t of setA) if (setB.has(t)) common++;
  return common / Math.max(setA.size, setB.size);
}

// ─── Master quality filter ───────────────────────────────────────────────────
const DEFAULT_MAX_PER_DOMAIN = 2; // for generic queries: max 2 results per retailer

// If one domain holds > 40% of results, the user likely asked for a specific brand.
// In that case, skip domain dedup entirely so brand-specific searches aren't capped.
function detectDomainLimit(items) {
  if (!items.length) return DEFAULT_MAX_PER_DOMAIN;
  const counts = new Map();
  for (const item of items) {
    let domain = 'unknown';
    try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  const dominantRatio = maxCount / items.length;
  if (dominantRatio > 0.4) {
    console.log(`  [Quality] Brand query detected (dominant domain ratio ${(dominantRatio * 100).toFixed(0)}%) — skipping domain dedup`);
    return Infinity; // let all results from the brand through
  }
  return DEFAULT_MAX_PER_DOMAIN;
}

function applyQualityFilters(items, query, gl, overrideFloor, priceCeiling) {
  const category      = detectCategory(query);
  const priceFloor    = getPriceFloor(gl, category, overrideFloor);
  const maxPerDomain  = detectDomainLimit(items); // Infinity for brand queries
  const domainCount   = new Map();
  const kept = [];

  for (const item of items) {
    const title = item.name || '';

    // 1. Spam / junk title
    if (SPAM_TITLE.test(title)) {
      console.log(`  [Quality] DROP (spam title): "${title.slice(0, 60)}"`);
      continue;
    }

    // 2. Title too short (garbage entries)
    if (title.length < 8) {
      console.log(`  [Quality] DROP (title too short): "${title}"`);
      continue;
    }

    // 3. Price floor + ceiling
    const price = parsePrice(item.price);
    if (price !== null && price < priceFloor) {
      console.log(`  [Quality] DROP (price ${price} < floor ${priceFloor}): "${title.slice(0, 60)}"`);
      continue;
    }
    if (price !== null && priceCeiling != null && price > priceCeiling) {
      console.log(`  [Quality] DROP (price ${price} > ceiling ${priceCeiling}): "${title.slice(0, 60)}"`);
      continue;
    }

    // 4. Domain cap (skipped for brand queries)
    let domain = 'unknown';
    try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
    const domainHits = domainCount.get(domain) || 0;
    if (domainHits >= maxPerDomain) {
      console.log(`  [Quality] DROP (domain limit ${domain}): "${title.slice(0, 60)}"`);
      continue;
    }

    // 5. Near-duplicate title (≥ 85% token overlap with any kept item)
    const isDupTitle = kept.some(k => titleSimilarity(k.name, title) >= 0.85);
    if (isDupTitle) {
      console.log(`  [Quality] DROP (dup title): "${title.slice(0, 60)}"`);
      continue;
    }

    domainCount.set(domain, domainHits + 1);
    kept.push(item);
  }

  const ceilingStr = priceCeiling != null ? `, ceiling=${priceCeiling}` : '';
  console.log(`  [Quality] ${items.length} → ${kept.length} after quality filter (category=${category}, floor=${priceFloor}${ceilingStr})`);
  return kept;
}

// ─── SerpAPI locale params by country code ───────────────────────────────────
const SERP_LOCALE_PARAMS = {
  in: { gl: 'in', hl: 'en', location: 'India' },
  us: { gl: 'us', hl: 'en' },
  gb: { gl: 'gb', hl: 'en', location: 'United Kingdom' },
  jp: { gl: 'jp', hl: 'ja', location: 'Japan' },
};

// ─── Main export ─────────────────────────────────────────────────────────────
export async function searchSerper(query, cfg) {
  if (!process.env.SERP_API_KEY) {
    return { results: [], error: 'SERP_API_KEY not configured', raw: null };
  }

  const gl          = cfg?.gl || 'us';
  const serpLocale  = SERP_LOCALE_PARAMS[gl] || detectLocale(query);
  console.log(`  [SerpAPI] query="${query}" locale=${gl}`);

  // Fetch 20 raw results so the quality filter has enough pool to still return 10 good ones
  const res = await axios.get(SERPAPI_URL, {
    params: {
      engine: 'google_shopping',
      q: query,
      api_key: process.env.SERP_API_KEY,
      num: 20,
      ...serpLocale
    }
  });

  const raw   = res.data;
  const items = raw.shopping_results || [];
  console.log(`  [SerpAPI] ${items.length} raw shopping results`);

  const mapped = items
    .map(r => {
      const availability = r.availability || null;
      const outOfStock   = (availability && OUT_OF_STOCK.test(availability)) || r.in_stock === false;
      const url          = r.product_link || r.link || '';

      return {
        name:           r.title || r.product_title || 'Untitled',
        price:          r.price || r.extracted_price || null,
        original_price: r.original_price || null,
        rating:         (r.rating || r.average_rating) ?? null,
        reviews:        (r.review_count || r.reviews) ?? null,
        retailer:       r.source || (url ? new URL(url).hostname : 'Unknown'),
        url,
        image_url:      r.thumbnail || r.image || r.product_image || null,
        description:    r.snippet || r.description || r.product_snippet || '',
        delivery:       r.delivery || null,
        availability,
        in_stock:       outOfStock ? false : r.in_stock === true ? true : null,
        metal:          r.attributes?.metal || null,
        stone:          r.attributes?.stone || null,
        carat:          r.attributes?.carat || r.attributes?.weight || null,
        clarity:        r.attributes?.clarity || null
      };
    })
    // Basic hard drops: out-of-stock and no URL
    .filter(r => r.in_stock !== false && r.url);

  // Sanity-cap price overrides: if the LLM passed an INR-scale number into a USD/GBP/JPY search
  // (e.g. user switched region mid-conversation), the floor would be absurdly high and drop
  // everything. Cap the override to 500× the natural floor for this locale/category.
  const category    = detectCategory(query);
  const naturalFloor = getPriceFloor(serpLocale.gl, category, null);
  const rawMin = cfg?.minPrice || cfg?.priceFloor || null;
  const rawMax = cfg?.maxPrice || null;
  const safeMin = rawMin != null && rawMin > naturalFloor * 500 ? null : rawMin;
  const safeMax = rawMax != null && rawMax > naturalFloor * 5000 ? null : rawMax;
  if (safeMin !== rawMin) console.log(`  [SerpAPI] minPrice ${rawMin} sanity-capped to null (locale=${serpLocale.gl})`);
  if (safeMax !== rawMax) console.log(`  [SerpAPI] maxPrice ${rawMax} sanity-capped to null (locale=${serpLocale.gl})`);

  // Quality layer: spam names, price floor, price ceiling, domain dedup, title dedup
  const results = applyQualityFilters(mapped, query, serpLocale.gl, safeMin, safeMax)
    .slice(0, 10);

  console.log(`  [SerpAPI] ${results.length} final results`);
  return { results, raw };
}
