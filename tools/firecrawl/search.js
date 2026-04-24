import axios from 'axios';

const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/search';

function extractPrice(text = '') {
  const m = text.match(/[\$£₹€][\d,]+(?:\.\d{1,2})?/);
  return m ? m[0] : null;
}

export async function searchFirecrawl(query) {
  console.log(`  [Firecrawl] querying: "${query}"`);

  const res = await axios.post(
    FIRECRAWL_URL,
    { query, limit: 8 },
    {
      headers: {
        Authorization: `Bearer ${process.env.FIRE_CRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = res.data.data || [];
  console.log(`  [Firecrawl] returned ${data.length} results`);

  const results = data.map(r => {
    const text = r.markdown || r.description || r.metadata?.description || '';
    return {
      title: r.title || r.metadata?.title || 'Untitled',
      url: r.url,
      price: extractPrice(text),
      retailer: r.metadata?.siteName || new URL(r.url).hostname.replace('www.', ''),
      description: r.description || r.metadata?.description || text.slice(0, 400),
      score: null,
      reviews: null,
      imageUrl: r.metadata?.ogImage || null,
      delivery: null
    };
  });

  return { results, raw: res.data };
}
