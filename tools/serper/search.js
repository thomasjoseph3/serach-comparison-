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

const OUT_OF_STOCK = /out of stock|unavailable|discontinued|no longer available|sold out/i;

export async function searchSerper(query, cfg) {
  if (!process.env.SERP_API_KEY) {
    return { results: [], error: 'SERP_API_KEY not configured', raw: null };
  }

  const locale = cfg || detectLocale(query);
  console.log(`  [SerpAPI] query="${query}" locale=${locale.gl}`);

  const res = await axios.get(SERPAPI_URL, {
    params: {
      engine: 'google_shopping',
      q: query,
      api_key: process.env.SERP_API_KEY,
      num: 10,
      ...locale
    }
  });

  const raw = res.data;
  const items = raw.shopping_results || [];
  console.log(`  [SerpAPI] ${items.length} shopping results`);

  const results = items
    .map(r => {
      const availability = r.availability || null;
      const outOfStock   = (availability && OUT_OF_STOCK.test(availability)) || r.in_stock === false;

      const url = r.product_link || r.link || '';

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
    .filter(r => r.in_stock !== false && r.url)  // drop out-of-stock and products with no URL
    .slice(0, 10);

  console.log(`  [SerpAPI] ${results.length} results after filtering`);
  return { results, raw };
}
