const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Reports whether Ollama is running and the model is installed.
app.get('/api/health', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await r.json();
    const names = (data.models || []).map((m) => m.name);
    res.json({ ollama: true, model: MODEL, modelReady: names.some((n) => n.startsWith(MODEL)) });
  } catch {
    res.json({ ollama: false, model: MODEL, modelReady: false });
  }
});

// Streams the model's reply to the browser as plain text chunks.
app.post('/api/chat', async (req, res) => {
  const { messages = [], systemPrompt = '' } = req.body;
  const payload = {
    model: MODEL,
    stream: true,
    messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...messages],
  };

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  try {
    const upstream = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `Ollama error: ${await upstream.text()}` });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message && json.message.content) res.write(json.message.content);
        } catch { /* ignore partial line */ }
      }
    }
    res.end();
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not reach Ollama. Make sure it is running (ollama serve).' });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => console.log(`Local AI Chat running at http://localhost:${PORT}  (model: ${MODEL})`));
