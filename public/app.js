// ── Auth state ────────────────────────────────────────────
let authToken = localStorage.getItem('auth_token');
let currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem('auth_user')); } catch {}

// ── Tool / Country meta ───────────────────────────────────
const TOOL_META = {
  serper:    { icon: '🔍', label: 'SerpAPI' },
  exa:       { icon: '✦',  label: 'Exa' },
  tavily:    { icon: '◈',  label: 'Tavily' },
  firecrawl: { icon: '🔥', label: 'Firecrawl' }
};
const COUNTRY_META = {
  in: { flag: '🇮🇳', label: 'India',  currency: 'INR' },
  us: { flag: '🇺🇸', label: 'USA',    currency: 'USD' },
  jp: { flag: '🇯🇵', label: 'Japan',  currency: 'JPY' }
};
let activeTool    = 'serper';
let activeCountry = 'in';
let isSending     = false;

// ── DOM ───────────────────────────────────────────────────
const loginScreen   = document.getElementById('loginScreen');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginError    = document.getElementById('loginError');
const btnLogin      = document.getElementById('btnLogin');

const overlay       = document.getElementById('toolOverlay');
const welcomeName   = document.getElementById('welcomeName');
const appEl         = document.getElementById('app');
const messagesEl    = document.getElementById('messages');
const inputEl       = document.getElementById('input');
const btnSend       = document.getElementById('btnSend');
const btnClear      = document.getElementById('btnClear');
const btnLogout     = document.getElementById('btnLogout');
const btnCompare    = document.getElementById('btnCompare');
const countryBadge  = document.getElementById('countryBadge');
const userBadge     = document.getElementById('userBadge');
const activeToolBtn = document.getElementById('activeToolBtn');
const activeToolIcon= document.getElementById('activeToolIcon');
const activeToolName= document.getElementById('activeToolName');
const toolDropdown  = document.getElementById('toolDropdown');
const compareModal  = document.getElementById('compareModal');
const compareSearches = document.getElementById('compareSearches');
const compareClose  = document.getElementById('compareClose');

// ── Boot ──────────────────────────────────────────────────
if (authToken && currentUser) {
  showToolOverlay();
} else {
  loginScreen.style.display = 'flex';
}

// ── Login ─────────────────────────────────────────────────
btnLogin.addEventListener('click', doLogin);
loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  if (!username || !password) { showLoginError('Enter username and password'); return; }

  btnLogin.disabled = true;
  btnLogin.textContent = 'Signing in…';
  loginError.style.display = 'none';

  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { showLoginError(data.error || 'Login failed'); return; }

    authToken   = data.token;
    currentUser = { name: data.name, username: data.username };
    localStorage.setItem('auth_token', authToken);
    localStorage.setItem('auth_user', JSON.stringify(currentUser));

    loginScreen.style.display = 'none';
    showToolOverlay();
  } catch {
    showLoginError('Network error — please try again');
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Sign in →';
  }
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.style.display = 'block';
}

// ── Logout ────────────────────────────────────────────────
btnLogout.addEventListener('click', () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  location.reload();
});

// ── Tool overlay (shown after login) ─────────────────────
function showToolOverlay() {
  if (currentUser) {
    welcomeName.textContent = `Welcome back, ${currentUser.name}`;
  }
  overlay.style.display = 'flex';
}

document.querySelectorAll('.tool-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool = btn.dataset.tool;
  });
});

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
  if (currentUser) {
    userBadge.title = currentUser.name;
    userBadge.textContent = currentUser.name.slice(0, 1).toUpperCase();
  }
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
  'Best brands for classic gold look',
  'Diamond rings under ₹1 lakh',
  'Show me gold necklaces',
  'Sapphire earrings for gifting'
];

function showWelcome() {
  const div = document.createElement('div');
  div.className = 'welcome-msg';
  div.innerHTML = `
    <h2>How can I help you today?</h2>
    <p>Ask about jewelry, brands, or let me find the perfect piece for you.</p>
    <div class="suggestion-chips">
      ${SUGGESTIONS.map(s => `<button class="chip">${esc(s)}</button>`).join('')}
    </div>`;
  div.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      inputEl.value = chip.textContent;
      sendMessage();
    });
  });
  messagesEl.appendChild(div);
}

function appendSystemNote(text) {
  const p = document.createElement('p');
  p.style.cssText = 'text-align:center;font-size:11px;color:var(--muted);padding:4px 0;';
  p.textContent = `— ${text} —`;
  messagesEl.appendChild(p);
  scrollBottom();
}

// ── Auth helper ───────────────────────────────────────────
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
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
      headers: authHeaders(),
      body: JSON.stringify({ message: text, activeTool, country: activeCountry })
    });

    if (res.status === 401) {
      loadingRow.remove();
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      location.reload();
      return;
    }

    const data = await res.json();
    loadingRow.remove();

    if (!res.ok) {
      appendAIMsg(`Something went wrong: ${data.error}`, null);
    } else {
      appendAIMsg(data.reply, data.searchQuery);
      if (data.searchQuery) {
        btnCompare.style.display = 'flex';
      }
    }
  } catch {
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

  // Parse <cards> and <brands> blocks
  const parts = text.split(/(<cards>[\s\S]*?<\/cards>|<brands>[\s\S]*?<\/brands>)/g);
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
    } else if (part.startsWith('<brands>')) {
      const json = part.slice('<brands>'.length, -'</brands>'.length).trim();
      try {
        const brands = JSON.parse(json);
        bubble.appendChild(renderBrandChips(brands));
      } catch { /* skip malformed */ }
    } else {
      const trimmed = part.trim();
      if (trimmed) {
        // Catch stray disclaimer JSON the AI occasionally emits outside <cards>
        if (trimmed.startsWith('{"type":"disclaimer"')) {
          try {
            const d = JSON.parse(trimmed);
            const dis = document.createElement('div');
            dis.className = 'disclaimer';
            dis.textContent = d.text;
            bubble.appendChild(dis);
            continue;
          } catch { /* fall through to plain text */ }
        }
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

// ── Render brand chips ────────────────────────────────────
function renderBrandChips(brands) {
  const wrap = document.createElement('div');
  wrap.className = 'brand-chips';

  const label = document.createElement('p');
  label.className = 'brand-chips-label';
  label.textContent = 'Tap a brand to see its products:';
  wrap.appendChild(label);

  const row = document.createElement('div');
  row.className = 'brand-chips-row';

  for (const brand of brands) {
    const btn = document.createElement('button');
    btn.className = 'brand-chip';
    btn.textContent = brand;
    btn.addEventListener('click', () => {
      inputEl.value = `Show me ${brand} jewelry`;
      sendMessage();
    });
    row.appendChild(btn);
  }

  wrap.appendChild(row);
  return wrap;
}

// ── Render product cards ──────────────────────────────────
function renderCards(items) {
  const wrap = document.createElement('div');
  wrap.className = 'cards-wrap';

  const products    = items.filter(i => i.type === 'product');
  const disclaimers = items.filter(i => i.type === 'disclaimer');

  if (!products.length) return wrap;

  const scroll = document.createElement('div');
  scroll.className = 'cards-scroll';

  for (const p of products) {
    const card = document.createElement('div');
    card.className = 'p-card';
    card.style.cursor = 'pointer';

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

    if (p.url) {
      card.addEventListener('click', e => {
        if (e.target.tagName !== 'A') window.open(p.url, '_blank', 'noopener,noreferrer');
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

// ── Clear (new conversation) ──────────────────────────────
btnClear.addEventListener('click', async () => {
  await fetch('/api/chat/session', {
    method: 'DELETE',
    headers: authHeaders()
  }).catch(() => {});
  messagesEl.innerHTML = '';
  btnCompare.style.display = 'none';
  showWelcome();
});

// ── Search history modal ──────────────────────────────────
btnCompare.addEventListener('click', showHistoryModal);
compareClose.addEventListener('click', () => compareModal.classList.add('hidden'));
compareModal.addEventListener('click', e => {
  if (e.target === compareModal) compareModal.classList.add('hidden');
});

async function showHistoryModal() {
  compareSearches.innerHTML = '<div class="compare-empty"><p>Loading…</p></div>';
  compareModal.classList.remove('hidden');

  try {
    const res     = await fetch('/api/chat/history', { headers: authHeaders() });
    const data    = await res.json();
    const searches = data.searches || [];

    if (!searches.length) {
      compareSearches.innerHTML = '<div class="compare-empty"><p>No searches yet. Start searching!</p></div>';
      return;
    }

    compareSearches.innerHTML = searches.map(s => {
      const when = new Date(s.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const toolMeta = TOOL_META[s.tool] || TOOL_META.serper;
      const countryMeta = COUNTRY_META[s.country] || COUNTRY_META.in;

      const previewCards = (s.results || []).slice(0, 3).map(r => `
        <div class="result-preview">
          ${r.image_url ? `<img src="${esc(r.image_url)}" class="result-preview-img" loading="lazy" onerror="this.style.display='none'" />` : ''}
          <div class="result-preview-info">
            <div class="result-preview-title">${esc(r.name || 'Untitled')}</div>
            ${r.price    ? `<div class="result-preview-price">${esc(r.price)}</div>` : ''}
            ${r.retailer ? `<small>${esc(r.retailer)}</small>` : ''}
          </div>
        </div>`).join('');

      return `
        <div class="search-item">
          <div class="search-item-header">
            <div class="search-query">${esc(s.query)}</div>
            <div class="search-meta-row">
              <span>${toolMeta.icon} ${toolMeta.label}</span>
              <span>${countryMeta.flag} ${countryMeta.label}</span>
              <span>📊 ${s.resultCount || 0} results</span>
              <span>🕐 ${when}</span>
            </div>
          </div>
          ${previewCards ? `<div class="search-results-preview">${previewCards}</div>` : ''}
        </div>`;
    }).join('');
  } catch {
    compareSearches.innerHTML = '<div class="compare-empty"><p>Failed to load history.</p></div>';
  }
}

// ── Auto-resize textarea ──────────────────────────────────
function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}
inputEl.addEventListener('input', autoResize);

// ── Keyboard ──────────────────────────────────────────────
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
btnSend.addEventListener('click', sendMessage);

// ── Helpers ───────────────────────────────────────────────
function scrollBottom() {
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
