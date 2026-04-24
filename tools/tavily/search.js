import axios from 'axios';

const TAVILY_URL = 'https://api.tavily.com/search';

function extractPrice(text = '') {
  const m = text.match(/[\$£₹€][\d,]+(?:\.\d{1,2})?/);
  return m ? m[0] : null;
}

export async function searchTavily(query) {
  console.log(`  [Tavily] querying: "${query}"`);

  const res = await axios.post(TAVILY_URL, {
    api_key: process.env.TAVILY_API_KEY,
    query,
    search_depth: 'basic',
    max_results: 8,
    include_answer: false,
    include_images: true,
    include_image_descriptions: true
  });

  const raw = res.data.results || [];
  const images = res.data.images || [];
  console.log(`  [Tavily] returned ${raw.length} results, ${images.length} images`);

  const results = raw.map((r, i) => ({
    title: r.title || 'Untitled',
    url: r.url,
    price: extractPrice(r.content),
    retailer: new URL(r.url).hostname.replace('www.', ''),
    description: r.content || '',
    score: r.score ?? null,
    reviews: null,
    imageUrl: images[i]?.url || null,
    delivery: null
  }));

  return { results, raw: res.data };
}
