// ── State ─────────────────────────────────────────────────
const SESSION_ID = crypto.randomUUID();
const TOOL_META = {
  serper:    { icon: '🔍', label: 'SerpAPI' },
  exa:       { icon: '✦',  label: 'Exa' },
  tavily:    { icon: '◈',  label: 'Tavily' },
  firecrawl: { icon: '🔥', label: 'Firecrawl' }
};
const COUNTRY_META = {
  in: { flag: '🇮🇳', label: 'India',  currency: 'INR', locale: 'India' },
  us: { flag: '🇺🇸', label: 'USA',    currency: 'USD', locale: 'USA'   },
  jp: { flag: '🇯🇵', label: 'Japan',  currency: 'JPY', locale: 'Japan' }
};
let activeTool    = 'serper';
let activeCountry = 'in';
let isSending     = false;

// ── DOM ───────────────────────────────────────────────────
const countryBadge  = document.getElementById('countryBadge');
const overlay       = document.getElementById('toolOverlay');
const appEl         = document.getElementById('app');
const messagesEl    = document.getElementById('messages');
const inputEl       = document.getElementById('input');
const btnSend       = document.getElementById('btnSend');
const btnClear      = document.getElementById('btnClear');
const btnCompare    = document.getElementById('btnCompare');
const activeToolBtn = document.getElementById('activeToolBtn');
const activeToolIcon= document.getElementById('activeToolIcon');
const activeToolName= document.getElementById('activeToolName');
const toolDropdown  = document.getElementById('toolDropdown');
const compareModal  = document.getElementById('compareModal');
const compareSearches = document.getElementById('compareSearches');
const compareClose  = document.getElementById('compareClose');

// ── Tool selector overlay ─────────────────────────────────
document.querySelectorAll('.tool-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool = btn.dataset.tool;
  });
});

// Country selector
document.querySelectorAll('.country-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.country-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCountry = btn.dataset.country;
  });
});

document.getElementById('btnStart').addEventListener('click', () => {
  overlay.style.display = 'none';
  appEl.style.display   = 'flex';
  updateToolBadge();
  countryBadge.textContent = COUNTRY_META[activeCountry].flag;
  countryBadge.title = COUNTRY_META[activeCountry].label;
  showWelcome();
  inputEl.focus();
});

// ── Header tool switcher ──────────────────────────────────
activeToolBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = toolDropdown.style.display !== 'none';
  toolDropdown.style.display = open ? 'none' : 'block';
});

document.addEventListener('click', () => { toolDropdown.style.display = 'none'; });

document.querySelectorAll('.dropdown-item').forEach(item => {
  item.addEventListener('click', () => {
    activeTool = item.dataset.tool;
    updateToolBadge();
    toolDropdown.style.display = 'none';
    appendSystemNote(`Switched to ${TOOL_META[activeTool].label}`);
  });
});

function updateToolBadge() {
  const m = TOOL_META[activeTool];
  activeToolIcon.textContent = m.icon;
  activeToolName.textContent = m.label;
  document.querySelectorAll('.dropdown-item').forEach(i => {
    i.classList.toggle('current', i.dataset.tool === activeTool);
  });
}

// ── Welcome screen ────────────────────────────────────────
const SUGGESTIONS = [
  'Diamond rings under $500',
  'Show me gold necklaces',
  'Sapphire earrings for gifting',
  'Engagement rings under $2000',
];

function showWelcome() {
  const div = document.createElement('div');
  div.className = 'welcome-msg';
  div.innerHTML = `
    <h2>How can I help you today?</h2>
    <p>Tell me your style, budget, or occasion — I'll find the perfect piece.</p>
    <div class="suggestion-chips">
      ${SUGGESTIONS.map(s => `<button class="chip">${s}</button>`).join('')}
    </div>`;
  div.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      inputEl.value = chip.textContent;
      sendMessage();
    });
  });
  messagesEl.appendChild(div);
}

// ── Append system note (tool switch, etc.) ────────────────
function appendSystemNote(text) {
  const p = document.createElement('p');
  p.style.cssText = 'text-align:center;font-size:11px;color:var(--muted);padding:4px 0;';
  p.textContent = `— ${text} —`;
  messagesEl.appendChild(p);
  scrollBottom();
}

// ── Send message ──────────────────────────────────────────
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isSending) return;
  isSending = true;
  inputEl.value = '';
  autoResize();

  appendUserMsg(text);
  const loadingRow = appendTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: SESSION_ID, activeTool, country: activeCountry })
    });
    const data = await res.json();
    loadingRow.remove();

    if (!res.ok) {
      appendAIMsg(`Something went wrong: ${data.error}`, null);
    } else {
      appendAIMsg(data.reply, data.searchQuery);
    }
  } catch (err) {
    loadingRow.remove();
    appendAIMsg('Network error — please try again.', null);
  } finally {
    isSending = false;
    btnSend.disabled = false;
    inputEl.focus();
  }
}

// ── Append user message ───────────────────────────────────
function appendUserMsg(text) {
  const row = document.createElement('div');
  row.className = 'msg-row user';
  row.innerHTML = `<span class="msg-label">You</span><div class="bubble">${esc(text)}</div>`;
  messagesEl.appendChild(row);
  scrollBottom();
}

// ── Typing indicator ──────────────────────────────────────
function appendTyping() {
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.innerHTML = `
    <span class="msg-label">The Salesperson</span>
    <div class="bubble loading"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(row);
  scrollBottom();
  return row;
}

// ── Append AI message ─────────────────────────────────────
function appendAIMsg(text, searchQuery) {
  const row = document.createElement('div');
  row.className = 'msg-row ai';

  const label = document.createElement('span');
  label.className = 'msg-label';
  label.textContent = 'The Salesperson';
  row.appendChild(label);

  // Tool badge if a search happened
  if (searchQuery) {
    const m = TOOL_META[activeTool];
    const badge = document.createElement('div');
    badge.className = 'tool-badge';
    badge.innerHTML = `${m.icon} Searched via ${m.label}`;
    row.appendChild(badge);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  row.appendChild(bubble);

  // Parse <cards> blocks out of text
  const parts = text.split(/(<cards>[\s\S]*?<\/cards>)/g);
  for (const part of parts) {
    if (part.startsWith('<cards>')) {
      const json = part.slice('<cards>'.length, -'</cards>'.length).trim();
      try {
        const items = JSON.parse(json);
        bubble.appendChild(renderCards(items));
      } catch {
        const pre = document.createElement('pre');
        pre.style.cssText = 'font-size:11px;color:var(--muted);overflow:auto;';
        pre.textContent = json;
        bubble.appendChild(pre);
      }
    } else {
      const trimmed = part.trim();
      if (trimmed) {
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-wrap';
        p.textContent = trimmed;
        bubble.appendChild(p);
      }
    }
  }

  messagesEl.appendChild(row);
  scrollBottom();
}

// ── Render product cards ──────────────────────────────────
function renderCards(items) {
  const wrap = document.createElement('div');
  wrap.className = 'cards-wrap';

  const products = items.filter(i => i.type === 'product');
  const disclaimers = items.filter(i => i.type === 'disclaimer');

  if (!products.length) return wrap;

  const scroll = document.createElement('div');
  scroll.className = 'cards-scroll';

  for (const p of products) {
    const card = document.createElement('div');
    card.className = 'p-card';
    card.style.cursor = 'pointer';

    // Image
    if (p.image_url) {
      const img = document.createElement('img');
      img.className = 'p-card-img';
      img.src = p.image_url;
      img.alt = p.name;
      img.loading = 'lazy';
      img.onerror = () => img.replaceWith(gemPlaceholder());
      card.appendChild(img);
    } else {
      card.appendChild(gemPlaceholder());
    }

    // Body
    const body = document.createElement('div');
    body.className = 'p-card-body';
    body.innerHTML = `
      <div class="p-card-name">${esc(p.name)}</div>
      <div class="p-card-price">${esc(p.price || 'See website')}</div>
      ${p.original_price ? `<div class="p-card-orig">${esc(p.original_price)}</div>` : ''}
      ${p.discount       ? `<div class="p-card-disc">${esc(p.discount)}</div>`       : ''}
      ${p.retailer       ? `<div class="p-card-store">${esc(p.retailer)}</div>`      : ''}
      ${p.rating         ? `<div class="p-card-rating">★ ${p.rating}${p.reviews ? ` (${p.reviews})` : ''}</div>` : ''}
      ${p.why            ? `<div class="p-card-why">${esc(p.why)}</div>`             : ''}
      ${p.url            ? `<a class="p-card-link" href="${esc(p.url)}" target="_blank" rel="noopener">View product ↗</a>` : ''}
    `;
    card.appendChild(body);

    // Click interaction: open product link
    if (p.url) {
      card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'A') {
          window.open(p.url, '_blank', 'noopener,noreferrer');
        }
      });
    }

    scroll.appendChild(card);
  }

  wrap.appendChild(scroll);

  for (const d of disclaimers) {
    const dis = document.createElement('div');
    dis.className = 'disclaimer';
    dis.textContent = d.text;
    wrap.appendChild(dis);
  }

  return wrap;
}

function gemPlaceholder() {
  const d = document.createElement('div');
  d.className = 'p-card-img-placeholder';
  d.textContent = '💎';
  return d;
}

// ── Auto-resize textarea ──────────────────────────────────
function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}
inputEl.addEventListener('input', autoResize);

// ── Keyboard ──────────────────────────────────────────────
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
btnSend.addEventListener('click', sendMessage);

// ── Clear ─────────────────────────────────────────────────
btnClear.addEventListener('click', async () => {
  await fetch('/api/chat/session', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID })
  }).catch(() => {});
  messagesEl.innerHTML = '';
  showWelcome();
});

// ── Comparison Modal ──────────────────────────────────────
async function loadSearchHistory() {
  try {
    const res = await fetch(`/api/chat/history/${SESSION_ID}`);
    const data = await res.json();
    return data.searches || [];
  } catch {
    return [];
  }
}

async function showCompareModal() {
  const searches = await loadSearchHistory();
  
  if (!searches.length) {
    compareSearches.innerHTML = '<div class="compare-empty"><p>No searches yet. Start searching to compare!</p></div>';
  } else {
    compareSearches.innerHTML = searches.map(s => {
      const timestamp = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const toolLabel = TOOL_META[s.tool].label;
      const countryLabel = COUNTRY_META[s.country]?.label || s.country;
      
      return `
        <div class="search-item">
          <div class="search-item-header">
            <div class="search-query">${esc(s.query)}</div>
          </div>
          <div class="search-meta">
            <span>${TOOL_META[s.tool].icon} ${toolLabel}</span>
            <span>🌍 ${countryLabel}</span>
            <span>📊 ${s.resultCount} results</span>
            <span>🕐 ${timestamp}</span>
          </div>
          ${s.results?.length ? `
            <div class="search-results-preview">
              ${s.results.slice(0, 3).map(r => `
                <div class="result-preview">
                  <div class="result-preview-title">${esc(r.title || 'Untitled')}</div>
                  ${r.price ? `<div class="result-preview-price">${esc(r.price)}</div>` : ''}
                  ${r.retailer ? `<small>${esc(r.retailer)}</small>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }
  
  compareModal.classList.remove('hidden');
}

btnCompare.addEventListener('click', showCompareModal);
compareClose.addEventListener('click', () => compareModal.classList.add('hidden'));
compareModal.addEventListener('click', (e) => {
  if (e.target === compareModal) compareModal.classList.add('hidden');
});

// Show compare button after first search
let searchCount = 0;
const originalAppendAIMsg = window.appendAIMsg;
window.appendAIMsg = function(text, searchQuery) {
  if (searchQuery) {
    searchCount++;
    if (searchCount > 0) {
      btnCompare.style.display = 'flex';
    }
  }
  return originalAppendAIMsg(text, searchQuery);
};

// ── Helpers ───────────────────────────────────────────────
function scrollBottom() {
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
