// ── Chat History persistence via IndexedDB ──────────────────────────
// Uses the `idb` library for a clean promise-based API.
// Database: "ollama-chat-history", Object store: "conversations"

import { openDB, type IDBPDatabase } from 'idb';

// ── Types ────────────────────────────────────────────────────────────

export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelId?: string;
  modelName?: string;
  timestamp: string; // ISO string (Date doesn't serialize well in IDB)
  tokens?: number;
  latency?: number;
};

export type Conversation = {
  id: string;
  title: string;
  modelId?: string;
  modelName?: string;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
};

// ── Database setup ───────────────────────────────────────────────────

const DB_NAME = 'ollama-chat-history';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      },
    });
  }
  return dbPromise;
}

// ── CRUD operations ──────────────────────────────────────────────────

/** Save (create or update) a conversation */
export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, conversation);
}

/** Load a single conversation by ID */
export async function loadConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

/** List all conversations, most recent first */
export async function listConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  // Sort newest first
  return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Delete a conversation */
export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

/** Generate a title from the first user message */
export function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (trimmed.length <= 50) return trimmed;
  return trimmed.slice(0, 47) + '...';
}
