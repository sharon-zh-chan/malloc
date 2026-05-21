export type ItemStatus = "todo" | "completed" | "deleted";

export interface TodoItem {
  id: string;
  text: string;
  status: ItemStatus;
  createdAt: number;
  order: number;
}

export interface TodoBlock {
  id: string;
  title: string;
  items: TodoItem[];
  order: number;
}

export interface TextBlock {
  id: string;
  title: string;
  content: string;
  collectionId: string | null;
  previousCollectionId?: string | null;
  archivedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface MemoCollection {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface AppState {
  timeRange: string;
  blocks: TodoBlock[];
  textBlocks: TextBlock[];
  memoCollections: MemoCollection[];
  lastUpdatedAt: number;
}

export type SyncStatus = "offline" | "syncing" | "synced" | "idle" | "conflict";
