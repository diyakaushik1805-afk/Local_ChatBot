const PERSONAS = {
  general: 'You are a helpful, accurate assistant. Answer clearly and say so when you are unsure.',
  coder: 'You are a senior software engineer. Give correct, minimal code with brief explanations.',
  tutor: 'You are a patient tutor. Explain step by step in simple language with short examples.',
  concise: 'Answer in at most three sentences unless the user asks for more detail.',
};

const $ = (id) => document.getElementById(id);
const chat = $('chat'), input = $('input'), sendBtn = $('sendBtn'), micBtn = $('micBtn');
const promptBox = $('customPrompt'), statusEl = $('status');
let history = [];
let controller = null;

// ---- System prompt presets ----
promptBox.value = PERSONAS.general;
document.querySelectorAll('input[name=persona]').forEach((r) =>
  r.addEventListener('change', () => { promptBox.value = PERSONAS[r.value]; })
);

// ---- Rendering ----
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function render(text) {
  return text.split('```').map((part, i) =>
    i % 2
      ? '<pre><code>' + esc(part.replace(/^\w*\n/, '')) + '</code></pre>'
      : esc(part).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  ).join('');
}
function addMsg(role, text) {
  const empty = $('empty'); if (empty) empty.remove();
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  role === 'user' ? (el.textContent = text) : (el.innerHTML = render(text));
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}
function resize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; }
function setBusy(b) { sendBtn.textContent = b ? 'Stop' : 'Send'; }

// ---- Sending with streaming ----
async function send() {
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; resize();
  history.push({ role: 'user', content: text });
  addMsg('user', text);
  const el = addMsg('assistant', '');
  el.classList.add('typing');
  let reply = '', failed = false;
  controller = new AbortController();
  setBusy(true);
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, systemPrompt: promptBox.value.trim() }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
    const reader = res.body.getReader(), dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      reply += dec.decode(value, { stream: true });
      el.innerHTML = render(reply);
      chat.scrollTop = chat.scrollHeight;
    }
  } catch (err) {
    if (err.name !== 'AbortError') { failed = true; el.classList.add('error'); el.textContent = err.message; }
  } finally {
    el.classList.remove('typing');
    if (reply) history.push({ role: 'assistant', content: reply });
    else { history.pop(); if (!failed) el.remove(); }
    controller = null; setBusy(false); input.focus();
  }
}

$('form').addEventListener('submit', (e) => { e.preventDefault(); controller ? controller.abort() : send(); });
input.addEventListener('input', resize);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!controller) send(); }
});
$('clearBtn').addEventListener('click', () => {
  if (controller) controller.abort();
  history = []; chat.innerHTML = '<p class="empty" id="empty">Type a question, or press Voice and speak.</p>';
});

// ---- Voice input (Web Speech API) ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  micBtn.disabled = true; micBtn.title = 'Voice input needs Chrome or Edge';
} else {
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = true;
  let base = '', listening = false;
  rec.onstart = () => { listening = true; base = input.value; micBtn.classList.add('live'); micBtn.textContent = 'Listening'; };
  rec.onresult = (e) => {
    let t = ''; for (const r of e.results) t += r[0].transcript;
    input.value = (base + ' ' + t).trim(); resize();
  };
  rec.onend = () => { listening = false; micBtn.classList.remove('live'); micBtn.textContent = 'Voice'; };
  rec.onerror = (e) => addMsg('assistant error', 'Voice input failed: ' + e.error);
  micBtn.addEventListener('click', () => (listening ? rec.stop() : rec.start()));
}

// ---- Ollama status ----
async function checkHealth() {
  const set = (cls, msg) => { statusEl.className = 'status ' + cls; statusEl.textContent = msg; };
  try {
    const h = await (await fetch('/api/health')).json();
    if (!h.ollama) set('bad', 'Ollama is not running. Start it, then reload.');
    else if (!h.modelReady) set('warn', 'Model not found. Run: ollama pull ' + h.model);
    else set('ok', 'Connected: ' + h.model);
  } catch { set('bad', 'Server unreachable.'); }
}
checkHealth();
