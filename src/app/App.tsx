import { useState, useEffect, useCallback } from 'react';
import { ModelSidebar, type Model } from './components/ModelSidebar';
import { ChatWorkspace } from './components/ChatWorkspace';
import { TaskPanel } from './components/TaskPanel';
import { listModels, listRunningModels, pingBackend } from './services/llm';

// ── Model definitions matching the Python backend's model registry ───
// The `modelTag` field is the exact tag the backend expects.

export type AttachedFile = {
  id: string;
  name: string;
  type: string; // MIME type
  base64: string; // raw base64 data (no prefix)
  isImage: boolean;
  preview?: string; // data URL for image preview
};

const MODEL_DEFS: (Omit<Model, 'status'> & { modelTag: string })[] = [
  {
    id: 'llama3-8b',
    name: 'Llama 3 8B',
    modelTag: 'llama3:8b',
    category: 'chat',
    vram: 4.7,
    speed: 'medium',
    description: 'Chat / Edit',
    supportsVision: false,
  },
  {
    id: 'gemma-12b',
    name: 'Gemma 3 12B',
    modelTag: 'gemma3:12b',
    category: 'reasoning',
    vram: 7.2,
    speed: 'slow',
    description: 'Strong reasoning',
    supportsVision: false,
  },
  {
    id: 'deepseek-8b',
    name: 'DeepSeek 8B',
    modelTag: 'deepseek-r1:8b',
    category: 'reasoning',
    vram: 4.9,
    speed: 'medium',
    description: 'Advanced reasoning',
    supportsVision: false,
  },
  {
    id: 'qwen-7b',
    name: 'Qwen 7B',
    modelTag: 'qwen2.5:7b',
    category: 'chat',
    vram: 4.4,
    speed: 'medium',
    description: 'Balanced',
    supportsVision: false,
  },
  {
    id: 'phi3',
    name: 'Phi-3 Mini',
    modelTag: 'phi3:latest',
    category: 'fast',
    vram: 2.2,
    speed: 'fast',
    description: 'Fast responses',
    supportsVision: false,
  },
  {
    id: 'qwen-coder-1.5b',
    name: 'Qwen2.5-Coder 1.5B',
    modelTag: 'qwen2.5-coder:1.5b',
    category: 'coding',
    vram: 1.1,
    speed: 'fast',
    description: 'Autocomplete / Code',
    supportsVision: false,
  },
  {
    id: 'nomic-embed',
    name: 'Nomic Embed',
    modelTag: 'nomic-embed-text:latest',
    category: 'embedding',
    vram: 0.1,
    speed: 'fast',
    description: 'Embeddings',
    supportsVision: false,
  },
];

export default function App() {
  const [models, setModels] = useState<Model[]>(() =>
    MODEL_DEFS.map(d => ({ ...d, status: 'unloaded' as const }))
  );
  const [backendOnline, setBackendOnline] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>(['llama3-8b']);
  const [activeModel, setActiveModel] = useState<string | null>('llama3-8b');
  const [mode, setMode] = useState<'single' | 'compare'>('single');


  // ── Poll backend for model availability ─────────────────────────────
  const refreshStatus = useCallback(async () => {
    const online = await pingBackend();
    setBackendOnline(online);
    if (!online) {
      setModels(MODEL_DEFS.map(d => ({ ...d, status: 'unloaded' as const })));
      return;
    }

    try {
      const [available, running] = await Promise.all([
        listModels(),
        listRunningModels(),
      ]);

      const availableNames = new Set(available.map(m => m.name));
      const runningNames = new Set(running.map(m => m.name));

      // Check which models have been downloaded (extra field from our backend)
      const downloadedNames = new Set(
        available
          .filter(m => (m as any).downloaded)
          .map(m => m.name)
      );

      setModels(MODEL_DEFS.map(d => {
        const isAvailable = availableNames.has(d.modelTag) ||
          [...availableNames].some(n => n.startsWith(d.modelTag.split(':')[0]));
        const isDownloaded = downloadedNames.has(d.modelTag);
        const isRunning = runningNames.has(d.modelTag) ||
          [...runningNames].some(n => n.startsWith(d.modelTag.split(':')[0]));

        return {
          ...d,
          status: isDownloaded ? 'loaded' as const : 'unloaded' as const,
          // Update VRAM if we have running info
          vram: isRunning
            ? +(running.find(r => r.name === d.modelTag || r.name.startsWith(d.modelTag.split(':')[0]))?.size_vram ?? d.vram * 1e9) / 1e9
            : d.vram,
        };
      }));
    } catch (err) {
      console.error('Failed to refresh models:', err);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 10_000); // poll every 10s
    return () => clearInterval(interval);
  }, [refreshStatus]);

  // ── Lookup helper: model id → model tag ────────────────────────────
  const getModelTag = (modelId: string): string => {
    return MODEL_DEFS.find(d => d.id === modelId)?.modelTag ?? modelId;
  };

  // ── Selection logic ────────────────────────────────────────────────

  const handleToggleModel = (modelId: string) => {
    if (mode === 'single') {
      setSelectedModels([modelId]);
      setActiveModel(modelId);
    } else {
      setSelectedModels(prev =>
        prev.includes(modelId)
          ? prev.filter(id => id !== modelId)
          : [...prev, modelId]
      );
    }
  };

  const handleSelectModel = (modelId: string) => {
    setActiveModel(modelId);
    if (mode === 'single') {
      setSelectedModels([modelId]);
    } else {
      if (!selectedModels.includes(modelId)) {
        setSelectedModels(prev => [...prev, modelId]);
      }
    }
  };

  const handleModeChange = (newMode: 'single' | 'compare') => {
    setMode(newMode);
    if (newMode === 'single' && selectedModels.length > 1) {
      const keep = activeModel && selectedModels.includes(activeModel) ? activeModel : selectedModels[0];
      setSelectedModels([keep]);
    }
  };

  const [chatInput, setChatInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const handleSelectTemplate = (template: string) => {
    setChatInput(template);
  };

  const handleFilesAttached = (files: AttachedFile[]) => {
    setAttachedFiles(prev => [...prev, ...files]);
  };

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Check if active model supports vision
  const activeModelDef = MODEL_DEFS.find(d => d.id === activeModel);
  const activeSupportsVision = activeModelDef?.supportsVision ?? false;

  return (
    <div className="h-screen flex dark overflow-hidden">
      <ModelSidebar
        models={models}
        selectedModels={selectedModels}
        onToggleModel={handleToggleModel}
        onSelectModel={handleSelectModel}
        activeModel={activeModel}
        backendOnline={backendOnline}
      />
      <ChatWorkspace
        selectedModels={selectedModels}
        models={models}
        mode={mode}
        activeModel={activeModel}
        getModelTag={getModelTag}
        input={chatInput}
        setInput={setChatInput}
        attachedFiles={attachedFiles}
        onRemoveFile={handleRemoveFile}
        onClearFiles={() => setAttachedFiles([])}
        activeSupportsVision={activeSupportsVision}
      />
      <TaskPanel
        mode={mode}
        onModeChange={handleModeChange}
        onSelectTemplate={handleSelectTemplate}
        onFilesAttached={handleFilesAttached}
        activeSupportsVision={activeSupportsVision}
        activeModelName={activeModelDef?.name ?? 'None'}
      />
    </div>
  );
}