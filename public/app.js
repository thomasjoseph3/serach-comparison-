// ── Auth state ────────────────────────────────────────────
let authToken = localStorage.getItem('auth_token');
let currentUser = null;
try { currentUser = JSON.parse(localStorage.getItem('auth_user')); } catch {}

// ── Tool / Country meta ───────────────────────────────────
const TOOL_META = {
  serpapi:   { icon: '🔍', label: 'SerpAPI' },
  exa:       { icon: '✦',  label: 'Exa' },
  tavily:    { icon: '◈',  label: 'Tavily' },
  firecrawl: { icon: '🔥', label: 'Firecrawl' }
};
const COUNTRY_META = {
  in: { flag: '🇮🇳', label: 'India',  currency: 'INR' },
  us: { flag: '🇺🇸', label: 'USA',    currency: 'USD' },
  jp: { flag: '🇯🇵', label: 'Japan',  currency: 'JPY' }
};
let activeTool    = localStorage.getItem('pref_tool')    || 'serpapi';
let activeCountry = localStorage.getItem('pref_country') || 'in';
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
  loginScreen.style.display = 'none';
  const returning = !!localStorage.getItem('pref_tool');
  if (returning) {
    launchApp();
  } else {
    showToolOverlay();
  }
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
  localStorage.removeItem('pref_tool');
  localStorage.removeItem('pref_country');
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

document.getElementById('btnStart').addEventListener('click', async () => {
  // Save preferences so next visit skips this overlay
  localStorage.setItem('pref_tool', activeTool);
  localStorage.setItem('pref_country', activeCountry);
  overlay.style.display = 'none';
  await launchApp();
});

async function launchApp() {
  appEl.style.display = 'flex';
  updateToolBadge();
  countryBadge.textContent = COUNTRY_META[activeCountry].flag;
  countryBadge.title = COUNTRY_META[activeCountry].label;
  if (currentUser) {
    userBadge.title = currentUser.name;
    userBadge.textContent = currentUser.name.slice(0, 1).toUpperCase();
  }
  await restoreSession();
  inputEl.focus();
}

async function restoreSession() {
  try {
    const res  = await fetch('/api/chat/session', { headers: authHeaders() });
    const data = await res.json();
    const msgs = data.messages || [];

    if (!msgs.length) { showWelcome(); return; }

    // Show a divider so the user knows this is restored history
    const divider = document.createElement('p');
    divider.style.cssText = 'text-align:center;font-size:11px;color:var(--muted);padding:8px 0;';
    divider.textContent = '— Previous conversation —';
    messagesEl.appendChild(divider);

    for (const msg of msgs) {
      if (msg.role === 'user') {
        appendUserMsg(msg.content);
      } else {
        appendAIMsg(msg.content, null);
      }
    }

    btnCompare.style.display = 'flex';

    // Divider before new messages
    const newDivider = document.createElement('p');
    newDivider.style.cssText = 'text-align:center;font-size:11px;color:var(--muted);padding:8px 0;';
    newDivider.textContent = '— Continue below —';
    messagesEl.appendChild(newDivider);

    scrollBottom();
  } catch {
    showWelcome();
  }
}

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
  let hasBubbleContent = false;
  const afterBubble = []; // cards & brands render outside the bubble (full-width)

  const parts = text.split(/(<cards>[\s\S]*?<\/cards>|<brands>[\s\S]*?<\/brands>)/g);
  for (const part of parts) {
    if (part.startsWith('<cards>')) {
      const json = part.slice('<cards>'.length, -'</cards>'.length).trim();
      try {
        afterBubble.push(renderCards(JSON.parse(json)));
      } catch {
        const pre = document.createElement('pre');
        pre.style.cssText = 'font-size:11px;color:var(--muted);overflow:auto;';
        pre.textContent = json;
        bubble.appendChild(pre);
        hasBubbleContent = true;
      }
    } else if (part.startsWith('<brands>')) {
      const json = part.slice('<brands>'.length, -'</brands>'.length).trim();
      try { afterBubble.push(renderBrandChips(JSON.parse(json))); } catch {}
    } else {
      const trimmed = part.trim();
      if (trimmed) {
        if (trimmed.startsWith('{"type":"disclaimer"')) {
          try {
            const d = JSON.parse(trimmed);
            const dis = document.createElement('div');
            dis.className = 'disclaimer';
            dis.textContent = d.text;
            afterBubble.push(dis);
            continue;
          } catch {}
        }
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-wrap';
        p.textContent = trimmed;
        bubble.appendChild(p);
        hasBubbleContent = true;
      }
    }
  }

  if (hasBubbleContent) row.appendChild(bubble);
  for (const el of afterBubble) row.appendChild(el);

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
  wrap.className = 'cards-outer';

  const products    = items.filter(i => i.type === 'product');
  const disclaimers = items.filter(i => i.type === 'disclaimer');

  if (!products.length) return wrap;

  const scroll = document.createElement('div');
  scroll.className = 'cards-scroll';

  for (const p of products) {
    const card = document.createElement('div');
    card.className = 'p-card';

    // ── Image section ────────────────────────────────────
    const imgWrap = document.createElement('div');
    imgWrap.className = 'p-card-img-wrap';

    if (p.image_url) {
      const img = document.createElement('img');
      img.className = 'p-card-img';
      img.src = p.image_url;
      img.alt = p.name || '';
      img.loading = 'lazy';
      img.onerror = () => { imgWrap.innerHTML = '💎'; imgWrap.classList.add('p-card-no-img'); };
      imgWrap.appendChild(img);

      // Dark gradient so overlaid text is readable
      const grad = document.createElement('div');
      grad.className = 'p-card-img-gradient';
      imgWrap.appendChild(grad);

      // Price overlaid bottom-left
      if (p.price) {
        const priceEl = document.createElement('div');
        priceEl.className = 'p-card-price-overlay';
        priceEl.textContent = p.price;
        imgWrap.appendChild(priceEl);
      }

      // Rating overlaid bottom-right
      if (p.rating) {
        const ratingEl = document.createElement('div');
        ratingEl.className = 'p-card-rating-overlay';
        ratingEl.textContent = `★ ${p.rating}`;
        imgWrap.appendChild(ratingEl);
      }

      // Discount badge top-right
      if (p.discount) {
        const discEl = document.createElement('div');
        discEl.className = 'p-card-discount-badge';
        discEl.textContent = p.discount;
        imgWrap.appendChild(discEl);
      }
    } else {
      imgWrap.classList.add('p-card-no-img');
      imgWrap.textContent = '💎';
      // Show price in placeholder
      if (p.price) {
        const priceEl = document.createElement('div');
        priceEl.className = 'p-card-price-no-img';
        priceEl.textContent = p.price;
        imgWrap.appendChild(priceEl);
      }
    }

    card.appendChild(imgWrap);

    // ── Body section ─────────────────────────────────────
    const body = document.createElement('div');
    body.className = 'p-card-body';

    const name = document.createElement('div');
    name.className = 'p-card-name';
    name.textContent = p.name || 'Untitled';
    body.appendChild(name);

    if (p.retailer) {
      const retailer = document.createElement('div');
      retailer.className = 'p-card-retailer';
      retailer.textContent = p.retailer;
      body.appendChild(retailer);
    }

    if (p.why) {
      const why = document.createElement('div');
      why.className = 'p-card-why';
      why.textContent = p.why;
      body.appendChild(why);
    }

    if (p.url) {
      const link = document.createElement('a');
      link.className = 'p-card-btn';
      link.href = p.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'View product ↗';
      link.addEventListener('click', e => e.stopPropagation());
      body.appendChild(link);
    }

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

function extractCardsFromReply(aiReply) {
  if (!aiReply) return null;
  const m = aiReply.match(/<cards>([\s\S]*?)<\/cards>/);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

async function showHistoryModal() {
  compareSearches.innerHTML = '<div class="compare-empty"><p>Loading…</p></div>';
  compareModal.classList.remove('hidden');

  try {
    const res      = await fetch('/api/chat/history', { headers: authHeaders() });
    const data     = await res.json();
    const searches = data.searches || [];

    if (!searches.length) {
      compareSearches.innerHTML = '<div class="compare-empty"><p>No searches yet. Start searching!</p></div>';
      return;
    }

    compareSearches.innerHTML = '';

    for (const s of searches) {
      const when        = new Date(s.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const toolMeta    = TOOL_META[s.tool] || TOOL_META.serpapi;
      const countryMeta = COUNTRY_META[s.country] || COUNTRY_META.in;

      const item = document.createElement('div');
      item.className = 'search-item';

      // Header
      item.innerHTML = `
        <div class="search-item-header">
          <div class="search-query">${esc(s.query)}</div>
          <div class="search-meta-row">
            <span>${toolMeta.icon} ${toolMeta.label}</span>
            <span>${countryMeta.flag} ${countryMeta.label}</span>
            <span>📊 ${s.resultCount || 0} results</span>
            <span>🕐 ${when}</span>
          </div>
        </div>`;

      // Cards — parse from aiReply so images/data match exactly what was shown in chat
      const parsed = extractCardsFromReply(s.aiReply);
      if (parsed?.length) {
        item.appendChild(renderCards(parsed));
      } else if (s.results?.length) {
        // Fallback: build card-compatible objects from raw DB results
        const fallback = s.results.map(r => ({ type: 'product', ...r }));
        item.appendChild(renderCards(fallback));
      }

      compareSearches.appendChild(item);
    }
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
