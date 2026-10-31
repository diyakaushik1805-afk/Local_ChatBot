# Local AI Chatbot

Chat app running Llama 3.2 locally through Ollama, with a Node.js/Express backend.

## Run it
1. Install Node.js 18+ and Ollama (https://ollama.com)
2. `ollama pull llama3.2`
3. In this folder: `npm install` then `npm start`
4. Open http://localhost:3000

## Features
- Local LLM via Ollama (no cloud API)
- Multi-turn conversation (history sent with every request)
- Streaming responses with a Stop button
- Voice input (Web Speech API; Chrome or Edge)
- Editable system prompts with presets

## Notes
- Chat text stays on your machine. Chrome/Edge voice recognition may send audio to the browser vendor's speech service.
- Planned: RAG-based document Q&A (not implemented).
- Config via env vars: `PORT`, `OLLAMA_URL`, `OLLAMA_MODEL`.
