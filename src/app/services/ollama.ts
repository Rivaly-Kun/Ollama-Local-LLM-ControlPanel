// ── Ollama REST API service ──────────────────────────────────────────
// All requests go through the Vite dev-server proxy (/ollama → localhost:11434)
// so there are no CORS issues in the browser.

const BASE = '/ollama';

// ── Types ────────────────────────────────────────────────────────────

export type OllamaModel = {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
};

export type OllamaRunningModel = {
  name: string;
  model: string;
  size: number;
  size_vram: number;
  expires_at: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64-encoded images for vision models
};

// ── List all locally-available models (/api/tags) ────────────────────

export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${BASE}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
  const data = await res.json();
  return data.models ?? [];
}

// ── List currently-loaded (running) models (/api/ps) ─────────────────

export async function listRunningModels(): Promise<OllamaRunningModel[]> {
  const res = await fetch(`${BASE}/api/ps`);
  if (!res.ok) throw new Error(`Ollama /api/ps failed: ${res.status}`);
  const data = await res.json();
  return data.models ?? [];
}

// ── Chat completion (non-streaming) ──────────────────────────────────

export async function chatCompletion(
  model: string,
  messages: ChatMessage[],
): Promise<{ content: string; totalDuration: number; evalCount: number }> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama /api/chat failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    content: data.message?.content ?? '',
    totalDuration: data.total_duration ?? 0,   // nanoseconds
    evalCount: data.eval_count ?? 0,
  };
}

// ── Streaming chat completion ────────────────────────────────────────

export async function chatCompletionStream(
  model: string,
  messages: ChatMessage[],
  onToken: (token: string) => void,
  onDone: (stats: { totalDuration: number; evalCount: number }) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama /api/chat failed (${res.status}): ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No readable stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let lastStats = { totalDuration: 0, evalCount: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Ollama sends newline-delimited JSON
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          onToken(json.message.content);
        }
        if (json.done) {
          lastStats = {
            totalDuration: json.total_duration ?? 0,
            evalCount: json.eval_count ?? 0,
          };
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  onDone(lastStats);
}

// ── Check if Ollama is reachable ─────────────────────────────────────

export async function pingOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
