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
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface AppState {
  timeRange: string;
  blocks: TodoBlock[];
  textBlocks: TextBlock[];
  lastUpdatedAt: number;
}

export type SyncStatus = "offline" | "syncing" | "synced" | "idle" | "conflict";
