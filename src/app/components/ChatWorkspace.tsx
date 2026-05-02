import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Copy, ChevronDown, ChevronUp, Loader2, Square, Plus, History, Trash2, X, Paperclip, Image as ImageIcon, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import type { Model } from './ModelSidebar';
import { chatCompletionStream, type ChatMessage as LLMChatMessage } from '../services/llm';
import {
  saveConversation,
  listConversations,
  loadConversation,
  deleteConversation,
  generateTitle,
  type Conversation,
  type StoredMessage,
} from '../services/chatHistory';
import type { AttachedFile } from '../App';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelId?: string;
  modelName?: string;
  timestamp: Date;
  tokens?: number;
  latency?: number;
  isStreaming?: boolean;
};

type Props = {
  selectedModels: string[];
  models: Model[];
  mode: 'single' | 'compare';
  activeModel: string | null;
  getModelTag: (modelId: string) => string;
  input: string;
  setInput: (val: string) => void;
  attachedFiles: AttachedFile[];
  onRemoveFile: (fileId: string) => void;
  onClearFiles: () => void;
  activeSupportsVision: boolean;
};

const categoryColors: Record<string, string> = {
  chat: 'text-blue-500',
  reasoning: 'text-purple-500',
  coding: 'text-orange-500',
  fast: 'text-green-500',
  embedding: 'text-cyan-500',
};

// ── Helpers ──────────────────────────────────────────────────────────

function messagesToStored(messages: Message[]): StoredMessage[] {
  return messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    modelId: m.modelId,
    modelName: m.modelName,
    timestamp: m.timestamp.toISOString(),
    tokens: m.tokens,
    latency: m.latency,
  }));
}

function storedToMessages(stored: StoredMessage[]): Message[] {
  return stored.map(s => ({
    id: s.id,
    role: s.role,
    content: s.content,
    modelId: s.modelId,
    modelName: s.modelName,
    timestamp: new Date(s.timestamp),
    tokens: s.tokens,
    latency: s.latency,
  }));
}

export function ChatWorkspace({ selectedModels, models, mode, activeModel, getModelTag, input, setInput, attachedFiles, onRemoveFile, onClearFiles, activeSupportsVision }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  // input state is now lifted to props
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // History of messages sent to backend (per conversation)
  const historyRef = useRef<LLMChatMessage[]>([]);

  // ── Chat history state ─────────────────────────────────────────────
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string>('New Chat');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load conversation list on mount
  useEffect(() => {
    listConversations().then(setConversations);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Persist current conversation to IndexedDB ─────────────────────
  const persistConversation = useCallback(
    async (msgs: Message[], title?: string) => {
      if (msgs.length === 0) return;

      const id = conversationId ?? crypto.randomUUID();
      if (!conversationId) setConversationId(id);

      const activeModelObj = models.find(m => m.id === activeModel);
      const convoTitle = title ?? conversationTitle;

      const conversation: Conversation = {
        id,
        title: convoTitle,
        modelId: activeModel ?? undefined,
        modelName: activeModelObj?.name,
        messages: messagesToStored(msgs),
        createdAt: conversations.find(c => c.id === id)?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveConversation(conversation);
      const updated = await listConversations();
      setConversations(updated);
    },
    [conversationId, conversationTitle, activeModel, models, conversations],
  );

  // ── New chat ───────────────────────────────────────────────────────
  const startNewChat = () => {
    if (isGenerating) return;
    setMessages([]);
    setConversationId(null);
    setConversationTitle('New Chat');
    historyRef.current = [];
    setShowHistory(false);
  };

  // ── Load a past conversation ───────────────────────────────────────
  const loadChat = async (id: string) => {
    const convo = await loadConversation(id);
    if (!convo) return;

    setMessages(storedToMessages(convo.messages));
    setConversationId(convo.id);
    setConversationTitle(convo.title);
    setShowHistory(false);

    // Rebuild chat history
    historyRef.current = convo.messages
      .filter(m => m.content)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  };

  // ── Delete a conversation ──────────────────────────────────────────
  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteConversation(id);
    const updated = await listConversations();
    setConversations(updated);

    // If we deleted the active conversation, start fresh
    if (conversationId === id) {
      startNewChat();
    }
  };

  // ── Stop generation ────────────────────────────────────────────────
  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setMessages(prev =>
      prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m)
    );
  };

  // ── Send message to a model ────────────────────────────────────────
  const sendToModel = async (
    modelId: string,
    modelName: string,
    userContent: string,
    msgId: string,
    images: string[] = [],
  ) => {
    const modelTag = getModelTag(modelId);
    const startTime = performance.now();

    const placeholderId = `${msgId}-${modelId}`;
    const placeholder: Message = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      modelId,
      modelName,
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, placeholder]);

    const userMsg: LLMChatMessage = { role: 'user', content: userContent };
    if (images.length > 0) {
      userMsg.images = images;
    }

    const chatMessages: LLMChatMessage[] = [
      ...historyRef.current,
      userMsg,
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await chatCompletionStream(
        modelTag,
        chatMessages,
        (token) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === placeholderId
                ? { ...m, content: m.content + token }
                : m
            )
          );
        },
        (stats) => {
          const latency = performance.now() - startTime;
          setMessages(prev => {
            const updated = prev.map(m =>
              m.id === placeholderId
                ? { ...m, isStreaming: false, tokens: stats.evalCount, latency }
                : m
            );

            // Save to history ref
            const found = updated.find(m => m.id === placeholderId);
            if (found?.content) {
              historyRef.current.push(
                { role: 'user', content: userContent },
                { role: 'assistant', content: found.content },
              );
            }

            // Persist to IndexedDB
            persistConversation(updated);

            return updated;
          });
        },
        controller.signal,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === placeholderId ? { ...m, isStreaming: false } : m
          )
        );
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setMessages(prev =>
          prev.map(m =>
            m.id === placeholderId
              ? {
                  ...m,
                  isStreaming: false,
                  content: `⚠️ Error: ${errorMsg}\n\nMake sure the backend server is running and the model "${modelTag}" is available.`,
                }
              : m
          )
        );
      }
    }
  };

  // ── Handle send ────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    // Guard: make sure we have at least one model
    if (models.length === 0) return;

    const userContent = input.trim();
    const msgId = Date.now().toString();

    // Build display content — if text files are attached, show their names
    const textFiles = attachedFiles.filter(f => !f.isImage);
    const imageFiles = attachedFiles.filter(f => f.isImage);
    let displayContent = userContent;
    if (textFiles.length > 0) {
      displayContent += '\n\n📎 ' + textFiles.map(f => f.name).join(', ');
    }
    if (imageFiles.length > 0) {
      displayContent += '\n\n🖼️ ' + imageFiles.map(f => f.name).join(', ');
    }

    const userMessage: Message = {
      id: msgId,
      role: 'user',
      content: displayContent,
      timestamp: new Date(),
    };

    // Build the actual prompt content (include text file contents)
    let promptContent = userContent;
    for (const tf of textFiles) {
      try {
        const decoded = atob(tf.base64);
        promptContent += `\n\n--- File: ${tf.name} ---\n${decoded}`;
      } catch {
        promptContent += `\n\n--- File: ${tf.name} (could not decode) ---`;
      }
    }

    // Collect base64 images for vision models
    const imageBase64s = activeSupportsVision ? imageFiles.map(f => f.base64) : [];

    // If this is the first message, set the conversation title
    const isFirstMessage = messages.length === 0;
    if (isFirstMessage) {
      setConversationTitle(generateTitle(userContent));
    }

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    onClearFiles();
    setIsGenerating(true);

    // Persist the user message immediately
    const title = isFirstMessage ? generateTitle(userContent) : conversationTitle;
    await persistConversation(updatedMessages, title);

    if (mode === 'compare' && selectedModels.length > 0) {
      const promises = selectedModels.map(modelId => {
        const model = models.find(m => m.id === modelId);
        if (!model) return Promise.resolve();
        return sendToModel(modelId, model.name, promptContent, msgId, model.supportsVision ? imageBase64s : []);
      });
      await Promise.allSettled(promises);
    } else {
      // Single mode — use the active model, fallback to first model
      const model = models.find(m => m.id === activeModel) ?? models[0];
      if (model) {
        await sendToModel(model.id, model.name, promptContent, msgId, model.supportsVision ? imageBase64s : []);
      }
    }

    setIsGenerating(false);
    abortRef.current = null;
  };

  const toggleExpand = (messageId: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      {/* ── Top bar: Chat history + status ── */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* New Chat button */}
            <Button
              variant="outline"
              size="sm"
              onClick={startNewChat}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>

            {/* History toggle */}
            <div className="relative">
              <Button
                variant={showHistory ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="gap-1.5"
              >
                <History className="w-4 h-4" />
                Chat History
                {conversations.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                    {conversations.length}
                  </Badge>
                )}
              </Button>

              {/* History dropdown */}
              {showHistory && (
                <div
                  className="absolute top-full left-0 mt-2 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Recent Conversations</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowHistory(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {conversations.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      No conversations yet
                    </div>
                  ) : (
                    conversations.map((convo) => (
                      <div
                        key={convo.id}
                        onClick={() => loadChat(convo.id)}
                        className={`p-3 cursor-pointer transition-colors hover:bg-accent border-b border-border/50 last:border-b-0 flex items-start justify-between gap-2 ${
                          conversationId === convo.id ? 'bg-accent/50' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{convo.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {convo.modelName && (
                              <span className="text-xs text-gray-500">{convo.modelName}</span>
                            )}
                            <span className="text-xs text-gray-600">
                              {convo.messages.length} msgs
                            </span>
                            <span className="text-xs text-gray-600">
                              {new Date(convo.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-gray-500 hover:text-red-400"
                          onClick={(e) => deleteChat(convo.id, e)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Current chat info */}
            <div className="ml-2">
              <p className="text-sm text-white font-medium">
                {mode === 'single' && `Active: ${models.find(m => m.id === activeModel)?.name || 'None'}`}
                {mode === 'compare' && `Comparing ${selectedModels.length} models`}
              </p>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            {isGenerating && (
              <Badge variant="outline" className="text-xs animate-pulse">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Generating...
              </Badge>
            )}
            <Badge variant="outline">{messages.length} messages</Badge>
          </div>
        </div>
      </div>

      {/* ── Chat messages area ── */}
      <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <p className="text-white text-lg mb-1">Start a conversation with your local LLMs</p>
              <p className="text-sm text-gray-500 mt-2">Connected to local LLM backend</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`${message.role === 'user' ? 'ml-auto max-w-2xl' : 'mr-auto max-w-full'}`}
            >
              {message.role === 'user' ? (
                <div
                  className="rounded-lg p-4"
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  }}
                >
                  <p className="whitespace-pre-wrap text-white">{message.content}</p>
                </div>
              ) : (
                <div className="border border-border rounded-lg p-4 bg-card">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${categoryColors[models.find(m => m.id === message.modelId)?.category || 'chat']}`}>
                        {message.modelName}
                      </span>
                      {message.isStreaming ? (
                        <Badge variant="secondary" className="text-xs animate-pulse">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          streaming
                        </Badge>
                      ) : (
                        <>
                          {message.tokens != null && (
                            <Badge variant="secondary" className="text-xs">
                              {message.tokens} tokens
                            </Badge>
                          )}
                          {message.latency != null && (
                            <Badge variant="secondary" className="text-xs">
                              {message.latency.toFixed(0)}ms
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyToClipboard(message.content)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(message.id)}
                      >
                        {expandedMessages.has(message.id) ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-100">
                    {message.content}
                    {message.isStreaming && (
                      <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse rounded-sm" />
                    )}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Attached files preview ── */}
      {attachedFiles.length > 0 && (
        <div className="border-t border-border px-4 py-2">
          <div className="max-w-4xl mx-auto flex gap-2 flex-wrap">
            {attachedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-300"
              >
                {file.isImage ? (
                  file.preview ? (
                    <img src={file.preview} alt={file.name} className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                  )
                ) : (
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                )}
                <span className="max-w-[120px] truncate">{file.name}</span>
                {file.isImage && !activeSupportsVision && (
                  <span className="text-yellow-400 text-[10px]">⚠</span>
                )}
                <button
                  onClick={() => onRemoveFile(file.id)}
                  className="ml-1 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="border-t border-border p-4">
        <div className="max-w-4xl mx-auto flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your message... (Shift+Enter for new line, Enter to send)"
            className="min-h-[60px] resize-none text-white placeholder:text-gray-500"
            disabled={isGenerating}
          />
          {isGenerating ? (
            <Button
              onClick={stopGeneration}
              size="icon"
              variant="destructive"
              className="h-[60px] w-[60px] shrink-0"
            >
              <Square className="w-5 h-5" />
            </Button>
          ) : (
            <Button onClick={handleSend} size="icon" className="h-[60px] w-[60px] shrink-0">
              <Send className="w-5 h-5" />
            </Button>
          )}
        </div>
        <div className="max-w-4xl mx-auto mt-2 text-xs text-gray-500">
          <kbd className="px-2 py-1 bg-muted rounded text-gray-400">⌘K</kbd> Quick commands
          <span className="mx-2">•</span>
          <kbd className="px-2 py-1 bg-muted rounded text-gray-400">⌘⇧P</kbd> Templates
        </div>
      </div>
    </div>
  );
}