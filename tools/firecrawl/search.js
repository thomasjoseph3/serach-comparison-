import axios from 'axios';
import { ONLINE_BRAND_DOMAINS } from '../../brands.js';

const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v1/scrape';
const TAVILY_URL = 'https://api.tavily.com/search';

/**
 * STEP 1: Use Tavily to find the most accurate product URL.
 * Tavily is better at finding direct product pages than Google.
 */
async function findBestUrls(query) {
  if (!process.env.TAVILY_API_KEY) {
    console.error("  [Discovery] TAVILY_API_KEY missing");
    return [];
  }
  
  try {
    const res = await axios.post(TAVILY_URL, {
      api_key: process.env.TAVILY_API_KEY,
      query: query,
      search_depth: "advanced",
      include_domains: ONLINE_BRAND_DOMAINS.slice(0, 50), // Tavily has a limit on domain count per query
      max_results: 5
    });

    // Filter results again against our full list just to be sure
    return (res.data.results || [])
      .map(r => r.url)
      .filter(url => {
        try {
          const hostname = new URL(url).hostname.replace('www.', '');
          return ONLINE_BRAND_DOMAINS.includes(hostname);
        } catch { return false; }
      })
      .slice(0, 3);
  } catch (err) {
    console.error("  [Tavily Discovery Error]", err.response?.data || err.message);
    return [];
  }
}

/**
 * STEP 2: Use Firecrawl to get live JS-rendered data from that specific URL.
 */
async function scrapeUrl(url) {
  try {
    const res = await axios.post(
      FIRECRAWL_SCRAPE_URL,
      { 
        url, 
        formats: ['markdown'],
        scrapeOptions: { onlyMainContent: true }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIRE_CRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000 
      }
    );

    if (res.data?.success && res.data.data) {
      const d = res.data.data;
      const metadata = d.metadata || {};
      return {
        name: metadata.title || d.title || 'Untitled',
        url: url,
        price: metadata.price || extractPriceFromText(d.markdown || ''),
        retailer: new URL(url).hostname.replace('www.', ''),
        description: (d.markdown || metadata.description || '').slice(0, 400),
        image_url: metadata.ogImage || metadata.image || null,
        in_stock: true
      };
    }
  } catch (err) {
    console.error(`  [Scrape Error for ${url}]`, err.message);
  }
  return null;
}

function extractPriceFromText(text) {
  const m = text.match(/[\$£₹€][\d,]+(?:\.\d{1,2})?/);
  return m ? m[0] : null;
}

export async function searchFirecrawl(query, cfg) {
  console.log(`  [Firecrawl+Tavily Hybrid] 1. Finding URLs with Tavily: "${query}"`);
  
  const urls = await findBestUrls(query);
  
  if (!urls.length) {
    console.log(`  [Firecrawl+Tavily Hybrid] No matching product URLs found.`);
    return { results: [], error: "Product not found on authorized retailers." };
  }

  console.log(`  [Firecrawl+Tavily Hybrid] 2. Scraping ${urls.length} sites via Firecrawl...`);

  const scrapers = urls.map(url => scrapeUrl(url));
  const scrapedResults = await Promise.all(scrapers);

  const results = scrapedResults.filter(Boolean).map(r => ({
    ...r,
    rating: null,
    reviews: null,
    delivery: null,
    metal: null,
    stone: null,
    availability: 'In Stock'
  }));

  console.log(`  [Firecrawl+Tavily Hybrid] Done. Found ${results.length} high-accuracy results.`);
  return { results, raw: { urls_found: urls } };
}
