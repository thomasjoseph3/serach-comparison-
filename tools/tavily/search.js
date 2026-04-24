import axios from 'axios';

const TAVILY_URL = 'https://api.tavily.com/search';

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

export async function searchTavily(query, cfg) {
  const finalQuery = cfg ? `${query} ${cfg.locale}` : query;
  console.log(`  [Tavily] querying: "${finalQuery}" locale=${cfg?.locale || 'default'}`);

  const res = await axios.post(TAVILY_URL, {
    api_key: process.env.TAVILY_API_KEY,
    query: finalQuery,
    search_depth: 'basic',
    max_results: 8,
    include_answer: false,
    include_images: true,
    include_image_descriptions: true
  });

  const raw = res.data.results || [];
  const images = res.data.images || [];
  console.log(`  [Tavily] returned ${raw.length} results, ${images.length} images`);

  const results = raw.map((r, i) => {
    const { metal, stone } = extractMetalAndStone(r.content);
    const hostname = new URL(r.url).hostname.replace('www.', '');
    
    return {
      name:         r.title || 'Untitled',
      url:          r.url,
      price:        extractPrice(r.content),
      retailer:     hostname,
      description:  r.content || '',
      image_url:    images[i]?.url || r.thumbnail || null,
      rating:       (r.score) ?? null,
      reviews:      null,
      delivery:     null,
      in_stock:     true,
      metal:        metal,
      stone:        stone,
      availability: 'Check website'
    };
  });

  return { results, raw: res.data };
}
