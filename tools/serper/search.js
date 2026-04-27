import axios from 'axios';

const SERPAPI_URL = 'https://serpapi.com/search.json';

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

async function fetchShopping(query, locale) {
  const res = await axios.get(SERPAPI_URL, {
    params: { engine: 'google_shopping', q: query, api_key: process.env.SERP_API_KEY, num: 8, ...locale }
  });
  const items = res.data.shopping_results || [];
  return { items, raw: res.data };
}

async function fetchOrganic(query, locale) {
  const res = await axios.get(SERPAPI_URL, {
    params: { engine: 'google', q: query, api_key: process.env.SERP_API_KEY, num: 8, ...locale }
  });
  const items = res.data.organic_results || [];
  return { items, raw: res.data };
}

export async function searchSerper(query, cfg) {
  if (!process.env.SERP_API_KEY) {
    return { results: [], error: 'SERP_API_KEY not configured', raw: null };
  }

  const locale = cfg || detectLocale(query);
  console.log(`  [SerpAPI] query="${query}" locale=${locale.gl}`);

  // Try Google Shopping first
  let { items, raw } = await fetchShopping(query, locale);

  // Fall back to organic search if shopping returns nothing
  if (!items.length) {
    console.log(`  [SerpAPI] 0 shopping results → falling back to organic`);
    ({ items, raw } = await fetchOrganic(query, locale));
  }

  console.log(`  [SerpAPI] returned ${items.length} results`);

  const OUT_OF_STOCK_PATTERN = /out of stock|unavailable|discontinued|no longer available|sold out/i;

  // Normalise both shopping and organic result shapes with enhanced details
  const results = items
    .map(r => {
      const availability = r.availability || null;
      const explicitlyOutOfStock = availability && OUT_OF_STOCK_PATTERN.test(availability);
      // Only mark in_stock true when Google explicitly says so; unknown stays null
      const in_stock = r.in_stock === true ? true : r.in_stock === false || explicitlyOutOfStock ? false : null;

      return {
        name:         r.title || r.product_title || 'Untitled',
        price:        r.price || r.extracted_price || null,
        original_price: r.original_price || null,
        rating:       (r.rating || r.average_rating) ?? null,
        reviews:      (r.review_count || r.reviews) ?? null,
        retailer:     r.source || r.displayed_link || new URL(r.link || '').hostname || 'Unknown',
        url:          r.link || r.product_link || '',
        image_url:    r.thumbnail || r.image || r.product_image || null,
        description:  r.snippet || r.description || r.product_snippet || '',
        delivery:     r.delivery || null,
        availability,
        in_stock,
        metal:        r.attributes?.metal || null,
        stone:        r.attributes?.stone || null,
        carat:        r.attributes?.carat || r.attributes?.weight || null,
        clarity:      r.attributes?.clarity || null
      };
    })
    .filter(r => r.in_stock !== false);  // drop anything explicitly out of stock

  console.log(`  [SerpAPI] ${results.length} results after availability filter`);
  return { results, raw };
}
