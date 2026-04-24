import axios from 'axios';

const EXA_URL = 'https://api.exa.ai/search';

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

export async function searchExa(query, cfg) {
  const finalQuery = cfg ? `${query} ${cfg.locale}` : query;
  console.log(`  [Exa] querying: "${finalQuery}" locale=${cfg?.locale || 'default'}`);

  const res = await axios.post(
    EXA_URL,
    {
      query: finalQuery,
      numResults: 8,
      useAutoprompt: true,
      type: 'auto',
      contents: { text: { maxCharacters: 500 } }
    },
    {
      headers: {
        'x-api-key': process.env.EXA_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );

  const raw = res.data.results || [];
  console.log(`  [Exa] returned ${raw.length} results`);

  const results = raw.map(r => {
    const { metal, stone } = extractMetalAndStone(r.text);
    const hostname = new URL(r.url).hostname.replace('www.', '');
    
    return {
      name:         r.title || 'Untitled',
      url:          r.url,
      price:        extractPrice(r.text),
      retailer:     hostname,
      description:  r.text?.slice(0, 400) || '',
      image_url:    r.image || null,
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
