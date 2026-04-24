import axios from 'axios';

const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/search';
const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v1/scrape';

function extractPrice(text = '') {
  const m = text.match(/[\$£₹€][\d,]+(?:\.\d{1,2})?/);
  return m ? m[0] : null;
}

function extractMetalAndStone(text = '') {
  const metals = ['gold', 'silver', 'platinum', 'white gold', 'yellow gold', 'rose gold'];
  const stones = ['diamond', 'sapphire', 'ruby', 'emerald', 'pearl', 'topaz'];
  
  const metal = metals.find(m => text.toLowerCase().includes(m)) || null;
  const stone = stones.find(s => text.toLowerCase().includes(s)) || null;
  
  return { metal, stone };
}

async function scrapeProductDetails(url) {
  try {
    const res = await axios.post(
      FIRECRAWL_SCRAPE_URL,
      { url, formats: ['markdown'] },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIRE_CRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    if (res.data?.success && res.data.data) {
      const text = res.data.data.markdown || res.data.data.content || '';
      return {
        description: text.slice(0, 500),
        image_url: res.data.data.ogImage || null,
        title: res.data.data.title || null
      };
    }
  } catch (err) {
    // Silently fail, use fallback data
  }
  return { description: '', image_url: null, title: null };
}

export async function searchFirecrawl(query, cfg) {
  const finalQuery = cfg ? `${query} ${cfg.locale}` : query;
  console.log(`  [Firecrawl] querying: "${finalQuery}" locale=${cfg?.locale || 'default'}`);

  const res = await axios.post(
    FIRECRAWL_URL,
    { query: finalQuery, limit: 8 },
    {
      headers: {
        Authorization: `Bearer ${process.env.FIRE_CRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = res.data.data || [];
  console.log(`  [Firecrawl] returned ${data.length} results`);

  const results = await Promise.all(data.map(async r => {
    const text = r.markdown || r.description || r.metadata?.description || '';
    const { metal, stone } = extractMetalAndStone(text);
    const hostname = r.metadata?.siteName || new URL(r.url).hostname.replace('www.', '');
    
    // Try to crawl for more details (non-blocking)
    const crawled = await scrapeProductDetails(r.url);
    
    return {
      name:         crawled.title || r.title || r.metadata?.title || 'Untitled',
      url:          r.url,
      price:        extractPrice(text),
      retailer:     hostname,
      description:  crawled.description || r.description || r.metadata?.description || text.slice(0, 400),
      image_url:    crawled.image_url || r.metadata?.ogImage || null,
      rating:       null,
      reviews:      null,
      delivery:     null,
      in_stock:     true,
      metal:        metal,
      stone:        stone,
      availability: 'Check website'
    };
  }));

  return { results, raw: res.data };
}
