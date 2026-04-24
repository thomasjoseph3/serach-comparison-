import axios from 'axios';

const EXA_URL = 'https://api.exa.ai/search';

function extractPrice(text = '') {
  const m = text.match(/[\$£₹€][\d,]+(?:\.\d{1,2})?/);
  return m ? m[0] : null;
}

export async function searchExa(query) {
  console.log(`  [Exa] querying: "${query}"`);

  const res = await axios.post(
    EXA_URL,
    {
      query,
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

  const results = raw.map(r => ({
    title: r.title || 'Untitled',
    url: r.url,
    price: extractPrice(r.text),
    retailer: new URL(r.url).hostname.replace('www.', ''),
    description: r.text?.slice(0, 400) || '',
    score: r.score ?? null,
    reviews: null,
    imageUrl: null,
    delivery: null
  }));

  return { results, raw: res.data };
}
