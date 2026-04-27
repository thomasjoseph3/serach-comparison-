import axios from 'axios';
import { getFirecrawlDomains } from '../../brands.js';

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v1/scrape';
const TAVILY_URL           = 'https://api.tavily.com/search';

// ─── Build a product-focused search query ────────────────────────────────────
const LOCALE_LABEL = { in: 'India', us: 'USA', gb: 'UK', jp: 'Japan' };

function buildProductQuery(query, gl = 'in') {
  const label = LOCALE_LABEL[gl] || 'India';
  return `${query} buy online ${label} jewelry`;
}

// ─── Step 1: Tavily discovers product URLs restricted to Indian brand domains ─
async function findBrandProductUrls(query, domains) {
  if (!process.env.TAVILY_API_KEY) {
    console.error('  [Firecrawl] TAVILY_API_KEY missing');
    return [];
  }

  const domainSet = new Set(domains);
  console.log(`    -> Tavily: Searching ${domains.length} brand domains for "${query}"`);

  try {
    const res = await axios.post(TAVILY_URL, {
      api_key:         process.env.TAVILY_API_KEY,
      query:           query,
      search_depth:    'advanced',
      include_domains: domains,
      max_results:     8
    });

    const urls = (res.data.results || [])
      .map(r => r.url)
      .filter(url => {
        try {
          const hostname = new URL(url).hostname.replace(/^www\./, '');
          if (!domainSet.has(hostname)) return false;
          return !/\/(blog|guide|education|about|faq|help|contact|news|article)/i.test(url);
        } catch {
          return false;
        }
      })
      .slice(0, 5);

    console.log(`    -> Tavily: Found ${urls.length} brand product URLs:`);
    urls.forEach((u, i) => console.log(`       ${i + 1}. ${u}`));
    return urls;
  } catch (err) {
    console.error('    [Tavily Error]', err.response?.data || err.message);
    return [];
  }
}

// ─── Deduplicate URLs by base path (strip query strings like srsltid) ─────────
function dedupeUrls(urls) {
  const seen = new Set();
  const result = [];
  for (const url of urls) {
    try {
      const u = new URL(url);
      // Filter out bare homepages (path is just "/" or empty)
      if (!u.pathname || u.pathname === '/') continue;
      const key = u.hostname + u.pathname;  // ignores ?srsltid=... params
      if (!seen.has(key)) {
        seen.add(key);
        result.push(url);
      }
    } catch {}
  }
  return result;
}

// ─── Step 2: Firecrawl scrapes each product page ─────────────────────────────
async function scrapeProductPage(url) {
  console.log(`    -> Firecrawl: Scraping ${url.slice(0, 70)}...`);
  try {
    const res = await axios.post(
      FIRECRAWL_SCRAPE_URL,
      {
        url,
        formats: ['markdown']   // do NOT include 'extract' here — needs separate format flag
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.FIRE_CRAWL_API_KEY}`,
          'Content-Type':  'application/json'
        },
        timeout: 20000
      }
    );

    if (res.data?.success && res.data.data) {
      const d        = res.data.data;
      const metadata = d.metadata || {};

      // Pull best available values from page metadata + markdown
      const name      = metadata.title || d.title || 'Untitled';
      const price     = metadata.price || extractPriceFromText(d.markdown || '') || null;
      const image_url = metadata.ogImage || metadata.og?.image || metadata.image || null;
      const desc      = metadata.description || (d.markdown || '').slice(0, 400);

      console.log(`    -> Firecrawl: OK — "${name.slice(0, 50)}" | ${price || 'no price'} | img=${!!image_url}`);

      return {
        name,
        url,
        price,
        retailer:     new URL(url).hostname.replace(/^www\./, ''),
        description:  desc,
        image_url,
        in_stock:     /out of stock|unavailable/i.test(extracted.availability || '') ? false : true,
        availability: extracted.availability || 'Check website'
      };
    }

    console.log(`    -> Firecrawl: No data for ${url.slice(0, 50)}`);
  } catch (err) {
    console.log(`    -> Firecrawl: Error [${url.slice(0, 50)}] — ${err.message}`);
  }
  return null;
}

// ─── Helper: extract first price pattern from raw markdown ───────────────────
function extractPriceFromText(text) {
  const m = text.match(/[₹$£€][\d,]+(?:\.\d{1,2})?/);
  return m ? m[0] : null;
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function searchFirecrawl(query, cfg) {
  const gl      = cfg?.gl || 'in';
  const domains = getFirecrawlDomains(gl);
  const productQuery = buildProductQuery(query, gl);

  console.log(`  [Firecrawl] locale=${gl} | ${domains.length} brand domains | query: "${productQuery}"`);

  const urls = dedupeUrls(await findBrandProductUrls(productQuery, domains));

  if (!urls.length) {
    console.log('  [Firecrawl] No brand product URLs found from Tavily.');
    return { results: [], error: 'No product pages found on brand sites for this region.' };
  }

  // Scrape all URLs in parallel (Firecrawl handles its own rate limits)
  const scraped = await Promise.all(urls.map(scrapeProductPage));

  const results = scraped
    .filter(Boolean)
    .map(r => ({
      ...r,
      rating:   null,   // Firecrawl scrape doesn't reliably get ratings
      reviews:  null,
      delivery: null,
      metal:    null,
      stone:    null
    }));

  console.log(`  [Firecrawl] Complete. ${results.length}/${urls.length} pages scraped successfully.`);
  return { results, raw: { urls_found: urls } };
}
