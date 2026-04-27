import axios from 'axios';

const EXA_URL = 'https://api.exa.ai/search';

function extractPrice(text = '') {
  const m = text.match(/[\$£₹€][\d,]+(?:\.\d{1,2})?/);
  return m ? m[0] : null;
}

function extractMetalAndStone(text = '') {
  const metals = ['white gold', 'yellow gold', 'rose gold', 'platinum', 'silver', 'gold'];
  const stones = ['diamond', 'sapphire', 'ruby', 'emerald', 'pearl', 'topaz', 'solitaire'];
  const lower  = text.toLowerCase();
  return {
    metal: metals.find(m => lower.includes(m)) || null,
    stone: stones.find(s => lower.includes(s)) || null
  };
}

// URL patterns that indicate non-product pages
const NON_PRODUCT = /\/(blog|article|news|guide|guides|review|reviews|post|posts|category|tag|tags|search|about|faq|help)\//i;

export async function searchExa(query, cfg) {
  if (!process.env.EXA_API_KEY) {
    return { results: [], error: 'EXA_API_KEY not configured', raw: null };
  }

  const finalQuery = cfg ? `${query} ${cfg.locale}` : query;
  console.log(`  [Exa] querying: "${finalQuery}"`);

  const res = await axios.post(
    EXA_URL,
    {
      query: finalQuery,
      numResults: 15,       // fetch more to allow for filtering down to 10
      useAutoprompt: true,
      type: 'neural',
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
  console.log(`  [Exa] ${raw.length} raw results`);

  const results = raw
    .filter(r => {
      if (!r.url?.startsWith('https://')) return false;  // HTTPS only
      if (NON_PRODUCT.test(r.url)) return false;         // skip non-product pages
      return true;
    })
    .map(r => {
      const { metal, stone } = extractMetalAndStone(r.text || r.title || '');
      const hostname  = new URL(r.url).hostname.replace('www.', '');
      // Only use image if it is itself HTTPS — HTTP images are blocked by browsers
      const image_url = r.image?.startsWith('https://') ? r.image : null;

      return {
        name:           r.title || 'Untitled',
        url:            r.url,
        price:          extractPrice(r.text || ''),
        retailer:       hostname,
        description:    (r.text || '').slice(0, 400),
        image_url,
        rating:         null,   // Exa score is relevance, not a star rating
        reviews:        null,
        delivery:       null,
        in_stock:       null,   // Exa does not know stock status
        metal,
        stone,
        availability:   'Check website'
      };
    })
    .slice(0, 10);

  console.log(`  [Exa] ${results.length} results after filtering`);
  return { results, raw: res.data };
}
