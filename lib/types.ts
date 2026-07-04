export type ItemStatus = "todo" | "completed" | "deleted";

export interface TodoItem {
  id: string;
  text: string;
  status: ItemStatus;
  parentTaskId?: string | null;
  subtasksExpanded?: boolean;
  createdAt: number;
  clearedAt?: number | null;
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

export type SketchTool =
  | "select"
  | "pen"
  | "text"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "eraser";

export type SketchPoint = {
  x: number;
  y: number;
};

type SketchElementBase = {
  id: string;
  color: string;
  strokeWidth: number;
};

export type SketchElement =
  | (SketchElementBase & {
      type: "pen";
      points: SketchPoint[];
    })
  | (SketchElementBase & {
      type: "erase";
      points: SketchPoint[];
      radius: number;
    })
  | (SketchElementBase & {
      type: "line" | "arrow" | "rectangle" | "ellipse";
      start: SketchPoint;
      end: SketchPoint;
      fillColor?: string | null;
    })
  | (SketchElementBase & {
      type: "text";
      point: SketchPoint;
      text: string;
      fontSize: number;
    });

export interface Sketch {
  id: string;
  title: string;
  elements: SketchElement[];
  collectionId: string | null;
  previousCollectionId?: string | null;
  archivedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface SketchCollection {
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
  sketches: Sketch[];
  sketchCollections: SketchCollection[];
  lastUpdatedAt: number;
}

export type SyncStatus =
  | "offline"
  | "syncing"
  | "synced"
  | "idle"
  | "error"
  | "conflict";
