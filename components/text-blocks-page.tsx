"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { MemoCollection, TextBlock } from "@/lib/types";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Italic,
  List,
  ListOrdered,
  Menu,
  Pencil,
  Plus,
  SquareMinus,
  SquarePlus,
  Table2,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Strikethrough,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { MemoCollectionPicker } from "./memo-collection-picker";
import { ConfirmModal } from "./confirm-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface TextBlocksPageProps {
  blocks: TextBlock[];
  collections: MemoCollection[];
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string | null) => void;
  onAddBlock: (title: string, collectionId?: string | null) => string | null;
  onUpdateTitle: (blockId: string, title: string) => void;
  onUpdateContent: (blockId: string, content: string) => void;
  onUpdateCollection: (blockId: string, collectionId: string | null) => void;
  onArchiveBlock: (blockId: string) => void;
  onRestoreBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onAddCollection: (title: string) => string | null;
  onUpdateCollectionTitle: (collectionId: string, title: string) => void;
  onDeleteCollection: (collectionId: string) => void;
}

const DEFAULT_BLOCK_TITLE = "Untitled Note";
const UNFILED_LABEL = "No folder";
const ARCHIVE_LABEL = "Deleted";
const UNFILED_COLLECTION_KEY = "__unfiled";
const ARCHIVE_COLLECTION_KEY = "__archive";
const FONT_SIZE_OPTIONS = {
  "12": { label: "12", fontSize: "12px" },
  "14": { label: "14", fontSize: "14px" },
  "16": { label: "16", fontSize: "16px" },
  "18": { label: "18", fontSize: "18px" },
  "24": { label: "24", fontSize: "24px" },
  "32": { label: "32", fontSize: "32px" },
} as const;

const FONT_OPTIONS = {
  inter: {
    label: "Inter",
    fontFamily: "var(--font-inter), Arial, sans-serif",
  },
  lora: {
    label: "Lora",
    fontFamily: "var(--font-lora), Georgia, serif",
  },
  mono: {
    label: "IBM Plex Mono",
    fontFamily: "var(--font-ibm-plex-mono), monospace",
  },
  caveat: {
    label: "Caveat",
    fontFamily: "var(--font-caveat), cursive",
  },
} as const;

type FontSizeOption = keyof typeof FONT_SIZE_OPTIONS;
type FontOption = keyof typeof FONT_OPTIONS;

interface FormattingState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
}

const DEFAULT_FORMATTING_STATE: FormattingState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  justifyLeft: true,
  justifyCenter: false,
  justifyRight: false,
};

export function TextBlocksPage({
  blocks,
  collections,
  selectedBlockId,
  onSelectBlock,
  onAddBlock,
  onUpdateTitle,
  onUpdateContent,
  onUpdateCollection,
  onArchiveBlock,
  onRestoreBlock,
  onDeleteBlock,
  onAddCollection,
  onUpdateCollectionTitle,
  onDeleteCollection,
}: TextBlocksPageProps) {
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [addingCollection, setAddingCollection] = useState(false);
  const [newCollectionTitle, setNewCollectionTitle] = useState("");
  const [memoPendingDelete, setMemoPendingDelete] = useState<TextBlock | null>(
    null,
  );
  const [collapsedCollectionKeys, setCollapsedCollectionKeys] = useState<
    Set<string>
  >(new Set());
  const [draggedMemoId, setDraggedMemoId] = useState<string | null>(null);
  const [dragOverCollectionKey, setDragOverCollectionKey] = useState<
    string | null
  >(null);
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
  const sortedCollections = useMemo(
    () =>
      [...collections].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      ),
    [collections],
  );
  const selectedBlock =
    sortedBlocks.find((block) => block.id === selectedBlockId) ?? null;
  const collectionIds = new Set(collections.map((collection) => collection.id));
  const activeBlocks = sortedBlocks.filter((block) => !block.archivedAt);
  const archivedBlocks = sortedBlocks.filter((block) => block.archivedAt);
  const unfiledBlocks = activeBlocks.filter(
    (block) => !block.collectionId || !collectionIds.has(block.collectionId),
  );

  const handleAddMemoToGroup = (
    collectionId: string | null,
    collectionKey: string,
  ) => {
    const newBlockId = onAddBlock(DEFAULT_BLOCK_TITLE, collectionId);
    if (!newBlockId) return;

    onSelectBlock(newBlockId);
    setCollapsedCollectionKeys((current) => {
      if (!current.has(collectionKey)) return current;

      const next = new Set(current);
      next.delete(collectionKey);
      return next;
    });
  };

  const handleQuickAdd = () => {
    handleAddMemoToGroup(null, UNFILED_COLLECTION_KEY);
  };

  const handleAddCollection = () => {
    const collectionId = onAddCollection(newCollectionTitle);
    if (collectionId) {
      setNewCollectionTitle("");
      setAddingCollection(false);
    }
  };

  const toggleCollection = (collectionKey: string) => {
    setCollapsedCollectionKeys((current) => {
      const next = new Set(current);
      if (next.has(collectionKey)) {
        next.delete(collectionKey);
      } else {
        next.add(collectionKey);
      }
      return next;
    });
  };

  const moveMemoToCollection = (
    blockId: string,
    collectionKey: string,
    collectionId?: string,
  ) => {
    if (collectionKey === ARCHIVE_COLLECTION_KEY) {
      onArchiveBlock(blockId);
      return;
    }

    onUpdateCollection(
      blockId,
      collectionKey === UNFILED_COLLECTION_KEY ? null : collectionId ?? null,
    );
  };

  return (
    <div
      className={`grid grid-cols-1 gap-4 ${
        menuCollapsed
          ? "lg:grid-cols-[64px_minmax(0,1fr)]"
          : "lg:grid-cols-[280px_minmax(0,1fr)]"
      }`}
    >
      <aside className="sketchy-card p-3 h-fit lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          {!menuCollapsed && (
            <h2 className="text-sm font-bold text-foreground">Notepad</h2>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuCollapsed((collapsed) => !collapsed)}
              className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
              aria-label={
                menuCollapsed ? "Expand notepad menu" : "Collapse notepad menu"
              }
              title={menuCollapsed ? "Expand menu" : "Collapse menu"}
            >
              <Menu className="h-4 w-4" />
            </button>
            {!menuCollapsed && (
              <>
                <button
                  type="button"
                  onClick={() => setAddingCollection((adding) => !adding)}
                  className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
                  aria-label="Add collection"
                  title="Add collection"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {!menuCollapsed && (
          <>
            {addingCollection && (
              <div className="mb-3 flex items-center gap-1">
                <input
                  value={newCollectionTitle}
                  onChange={(event) => setNewCollectionTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAddCollection();
                    if (event.key === "Escape") {
                      setAddingCollection(false);
                      setNewCollectionTitle("");
                    }
                  }}
                  placeholder="Collection name..."
                  className="min-w-0 flex-1 bg-background/50 px-2 py-1.5 text-sm text-foreground rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddCollection}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-primary hover:bg-primary/10 transition-colors"
                  aria-label="Save collection"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            )}

            <nav className="flex flex-col gap-3" aria-label="Notepad collections">
              <CollectionGroup
                title={UNFILED_LABEL}
                collectionKey={UNFILED_COLLECTION_KEY}
                blocks={unfiledBlocks}
                selectedBlockId={selectedBlockId}
                collapsed={collapsedCollectionKeys.has(
                  UNFILED_COLLECTION_KEY,
                )}
                isDragTarget={
                  dragOverCollectionKey === UNFILED_COLLECTION_KEY
                }
                onSelectBlock={onSelectBlock}
                onToggleCollapse={toggleCollection}
                onDropMemo={moveMemoToCollection}
                onDragStartMemo={setDraggedMemoId}
                onDragEndMemo={() => {
                  setDraggedMemoId(null);
                  setDragOverCollectionKey(null);
                }}
                onDragOverCollection={setDragOverCollectionKey}
                onArchiveBlock={onArchiveBlock}
                onRestoreBlock={onRestoreBlock}
                onRequestDelete={setMemoPendingDelete}
                onAddMemo={() =>
                  handleAddMemoToGroup(null, UNFILED_COLLECTION_KEY)
                }
                draggedMemoId={draggedMemoId}
              />

              {sortedCollections.map((collection) => (
                <CollectionGroup
                  key={collection.id}
                  title={collection.title}
                  collectionKey={collection.id}
                  collectionId={collection.id}
                  blocks={activeBlocks.filter(
                    (block) => block.collectionId === collection.id,
                  )}
                  selectedBlockId={selectedBlockId}
                  collapsed={collapsedCollectionKeys.has(collection.id)}
                  isDragTarget={dragOverCollectionKey === collection.id}
                  onSelectBlock={onSelectBlock}
                  onToggleCollapse={toggleCollection}
                  onDropMemo={moveMemoToCollection}
                  onDragStartMemo={setDraggedMemoId}
                  onDragEndMemo={() => {
                    setDraggedMemoId(null);
                    setDragOverCollectionKey(null);
                  }}
                  onDragOverCollection={setDragOverCollectionKey}
                  onArchiveBlock={onArchiveBlock}
                  onRestoreBlock={onRestoreBlock}
                  onRequestDelete={setMemoPendingDelete}
                  onUpdateCollectionTitle={onUpdateCollectionTitle}
                  onAddMemo={() =>
                    handleAddMemoToGroup(collection.id, collection.id)
                  }
                  onDeleteCollection={onDeleteCollection}
                  draggedMemoId={draggedMemoId}
                />
              ))}
              <CollectionGroup
                title={ARCHIVE_LABEL}
                collectionKey={ARCHIVE_COLLECTION_KEY}
                blocks={archivedBlocks}
                selectedBlockId={selectedBlockId}
                collapsed={collapsedCollectionKeys.has(ARCHIVE_COLLECTION_KEY)}
                isDragTarget={dragOverCollectionKey === ARCHIVE_COLLECTION_KEY}
                onSelectBlock={onSelectBlock}
                onToggleCollapse={toggleCollection}
                onDropMemo={moveMemoToCollection}
                onDragStartMemo={setDraggedMemoId}
                onDragEndMemo={() => {
                  setDraggedMemoId(null);
                  setDragOverCollectionKey(null);
                }}
                onDragOverCollection={setDragOverCollectionKey}
                onArchiveBlock={onArchiveBlock}
                onRestoreBlock={onRestoreBlock}
                onRequestDelete={setMemoPendingDelete}
                draggedMemoId={draggedMemoId}
                archived
              />
            </nav>
          </>
        )}
      </aside>

      {selectedBlock ? (
        <TextBlockEditor
          key={selectedBlock.id}
          block={selectedBlock}
          collections={collections}
          onUpdateTitle={(title) => onUpdateTitle(selectedBlock.id, title)}
          onUpdateContent={(content) =>
            onUpdateContent(selectedBlock.id, content)
          }
          onUpdateCollection={(collectionId) =>
            onUpdateCollection(selectedBlock.id, collectionId)
          }
          onArchive={() => onArchiveBlock(selectedBlock.id)}
          onRestore={() => onRestoreBlock(selectedBlock.id)}
          onRequestDelete={() => setMemoPendingDelete(selectedBlock)}
          onAddCollection={onAddCollection}
        />
      ) : (
        <div className="sketchy-card min-h-[420px] flex items-center justify-center p-6">
          <button
            type="button"
            onClick={handleQuickAdd}
            className="flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Add your first note"
          >
            <span className="sketchy-btn h-14 w-14 flex items-center justify-center">
              <Plus className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium">Add a new note</span>
          </button>
        </div>
      )}

      <ConfirmModal
        open={Boolean(memoPendingDelete)}
        title="Delete Note"
        message={`Permanently delete "${memoPendingDelete?.title ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (memoPendingDelete) {
            onDeleteBlock(memoPendingDelete.id);
            if (memoPendingDelete.id === selectedBlockId) {
              onSelectBlock(null);
            }
          }
          setMemoPendingDelete(null);
        }}
        onCancel={() => setMemoPendingDelete(null)}
      />
    </div>
  );
}

interface CollectionGroupProps {
  title: string;
  collectionKey: string;
  collectionId?: string;
  blocks: TextBlock[];
  selectedBlockId: string | null;
  collapsed: boolean;
  isDragTarget: boolean;
  onSelectBlock: (blockId: string | null) => void;
  onToggleCollapse: (collectionKey: string) => void;
  onDropMemo: (
    blockId: string,
    collectionKey: string,
    collectionId?: string,
  ) => void;
  onDragStartMemo: (blockId: string) => void;
  onDragEndMemo: () => void;
  onDragOverCollection: (collectionKey: string | null) => void;
  onArchiveBlock: (blockId: string) => void;
  onRestoreBlock: (blockId: string) => void;
  onRequestDelete: (block: TextBlock) => void;
  draggedMemoId: string | null;
  onUpdateCollectionTitle?: (collectionId: string, title: string) => void;
  onAddMemo?: () => void;
  onDeleteCollection?: (collectionId: string) => void;
  archived?: boolean;
}

function CollectionGroup({
  title,
  collectionKey,
  collectionId,
  blocks,
  selectedBlockId,
  collapsed,
  isDragTarget,
  onSelectBlock,
  onToggleCollapse,
  onDropMemo,
  onDragStartMemo,
  onDragEndMemo,
  onDragOverCollection,
  onArchiveBlock,
  onRestoreBlock,
  onRequestDelete,
  draggedMemoId,
  onUpdateCollectionTitle,
  onAddMemo,
  onDeleteCollection,
  archived = false,
}: CollectionGroupProps) {
  const [editing, setEditing] = useState(false);
  const [titleText, setTitleText] = useState(title);

  useEffect(() => {
    setTitleText(title);
  }, [title]);

  const saveTitle = () => {
    const trimmed = titleText.trim();
    if (collectionId && trimmed) {
      onUpdateCollectionTitle?.(collectionId, trimmed);
    } else {
      setTitleText(title);
    }
    setEditing(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const blockId = event.dataTransfer.getData("text/plain") || draggedMemoId;
    if (blockId) onDropMemo(blockId, collectionKey, collectionId);
    onDragOverCollection(null);
  };

  return (
    <section
      onDragOver={(event) => {
        if (!draggedMemoId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOverCollection(collectionKey);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onDragOverCollection(null);
        }
      }}
      onDrop={handleDrop}
      className={`rounded-md transition-colors ${
        isDragTarget ? "bg-primary/10 ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="group flex items-center justify-between gap-1 px-2 pb-1">
        {editing ? (
          <input
            value={titleText}
            onChange={(event) => setTitleText(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveTitle();
              if (event.key === "Escape") {
                setTitleText(title);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 bg-background/50 px-2 py-1 text-xs font-bold text-foreground rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => onToggleCollapse(collectionKey)}
            className="min-w-0 flex-1 inline-flex items-center gap-1.5 rounded px-0.5 py-1 text-left text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate normal-case">
              {title}
              <span className="ml-1 font-normal">({blocks.length})</span>
            </span>
          </button>
        )}

        {(onAddMemo || collectionId) && !editing && (
          <div className="flex items-center opacity-70 transition-opacity group-hover:opacity-100">
            {onAddMemo && (
              <button
                type="button"
                onClick={onAddMemo}
                className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                aria-label={`Add note to ${title}`}
                title="Add note"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
            {collectionId && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                  aria-label={`Rename ${title}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCollection?.(collectionId)}
                  className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}
        {editing && (
          <button
            type="button"
            onClick={() => {
              setTitleText(title);
              setEditing(false);
            }}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
            aria-label="Cancel rename"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="ml-4 flex flex-col gap-1">
          {blocks.map((block) => (
            <div
              key={block.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", block.id);
                onDragStartMemo(block.id);
              }}
              onDragEnd={onDragEndMemo}
              className={`group/memo flex cursor-grab items-center gap-1 rounded-md transition-colors active:cursor-grabbing ${
                block.id === selectedBlockId
                  ? "bg-primary/10"
                  : "hover:bg-secondary"
              } ${draggedMemoId === block.id ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSelectBlock(block.id)}
                className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                  block.id === selectedBlockId
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground group-hover/memo:text-foreground"
                }`}
              >
                {block.title}
              </button>
              {archived ? (
                <>
                  <button
                    type="button"
                    onClick={() => onRestoreBlock(block.id)}
                    className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                    aria-label={`Restore ${block.title}`}
                    title="Restore"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestDelete(block)}
                    className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${block.title}`}
                    title="Delete permanently"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onArchiveBlock(block.id)}
                  className="h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-primary/10 hover:text-foreground group-hover/memo:opacity-100"
                  aria-label={`Delete ${block.title}`}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

interface TextBlockEditorProps {
  block: TextBlock;
  collections: MemoCollection[];
  onUpdateTitle: (title: string) => void;
  onUpdateContent: (content: string) => void;
  onUpdateCollection: (collectionId: string | null) => void;
  onArchive: () => void;
  onRestore: () => void;
  onRequestDelete: () => void;
  onAddCollection: (title: string) => string | null;
}

function TextBlockEditor({
  block,
  collections,
  onUpdateTitle,
  onUpdateContent,
  onUpdateCollection,
  onArchive,
  onRestore,
  onRequestDelete,
  onAddCollection,
}: TextBlockEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [isCursorInTable, setIsCursorInTable] = useState(false);
  const [formattingState, setFormattingState] = useState<FormattingState>(
    DEFAULT_FORMATTING_STATE,
  );

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== block.content) {
      editorRef.current.innerHTML = block.content;
      savedRangeRef.current = null;
    }
  }, [block.content]);

  const selectionIsInEditor = (selection: Selection | null) => {
    const editor = editorRef.current;
    if (!editor || !selection?.rangeCount) return false;

    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer);
  };

  const captureEditorSelection = () => {
    const selection = window.getSelection();
    if (!selectionIsInEditor(selection)) return;

    savedRangeRef.current = selection?.getRangeAt(0).cloneRange() ?? null;
  };

  const restoreEditorSelection = () => {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor || !range || !editor.contains(range.startContainer)) return;

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const getSelectedElement = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.anchorNode) return null;

    let node: Node | null = selection.anchorNode;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    if (!(node instanceof HTMLElement) || !editor.contains(node)) return null;

    return node;
  };

  const getSelectedTableCell = () => {
    const node = getSelectedElement();

    return node?.closest("td, th") as HTMLTableCellElement | null;
  };

  const readCommandState = (command: string) => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };

  const syncEditorState = () => {
    if (selectionIsInEditor(window.getSelection())) {
      captureEditorSelection();
    }

    setIsCursorInTable(Boolean(getSelectedTableCell()));
    setFormattingState({
      bold: readCommandState("bold"),
      italic: readCommandState("italic"),
      underline: readCommandState("underline"),
      strikeThrough: readCommandState("strikeThrough"),
      justifyLeft: readCommandState("justifyLeft"),
      justifyCenter: readCommandState("justifyCenter"),
      justifyRight: readCommandState("justifyRight"),
    });
  };

  const runFormatCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    restoreEditorSelection();
    document.execCommand(command, false, value);
    onUpdateContent(editorRef.current?.innerHTML ?? "");
    captureEditorSelection();
    syncEditorState();
  };

  const placeCaretInCell = (cell: HTMLTableCellElement | null) => {
    if (!cell) return;

    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(cell);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();
  };

  const saveEditorContent = () => {
    onUpdateContent(editorRef.current?.innerHTML ?? "");
    captureEditorSelection();
    syncEditorState();
  };

  const createBodyCell = () => {
    const cell = document.createElement("td");
    cell.dataset.placeholder = "Cell";
    cell.innerHTML = "<p><br></p>";

    return cell;
  };

  const insertNodeAtSelection = (node: Node) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) {
      editor?.appendChild(node);
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
  };

  const insertTable = () => {
    const editor = editorRef.current;
    if (!editor) return;

    const table = document.createElement("table");
    const tableBody = document.createElement("tbody");
    const trailingParagraph = document.createElement("p");
    trailingParagraph.innerHTML = "<br>";

    for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
      const row = document.createElement("tr");
      for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
        row.appendChild(createBodyCell());
      }
      tableBody.appendChild(row);
    }

    table.appendChild(tableBody);
    editorRef.current?.focus();
    restoreEditorSelection();
    const selectedBlock = getSelectedBlockElement();
    const selectedTagName = selectedBlock?.tagName.toLowerCase();
    if (selectedBlock && selectedTagName && /^h[1-6]$/.test(selectedTagName)) {
      selectedBlock.after(table, trailingParagraph);
    } else {
      const fragment = document.createDocumentFragment();
      fragment.append(table, trailingParagraph);
      insertNodeAtSelection(fragment);
    }
    placeCaretInCell(table.querySelector("td, th"));
    saveEditorContent();
  };

  const updateSelectedTable = (
    updateTable: (
      cell: HTMLTableCellElement,
      row: HTMLTableRowElement,
      table: HTMLTableElement,
    ) => HTMLTableCellElement | null,
  ) => {
    restoreEditorSelection();
    const cell = getSelectedTableCell();
    const row = cell?.parentElement;
    const table = cell?.closest("table");
    if (!cell || !(row instanceof HTMLTableRowElement) || !table) return;

    const nextCell = updateTable(cell, row, table);
    editorRef.current?.focus();
    placeCaretInCell(nextCell);
    saveEditorContent();
  };

  const addTableRow = () => {
    updateSelectedTable((cell, row) => {
      const nextRow = row.cloneNode(false) as HTMLTableRowElement;
      const columnCount = row.cells.length || cell.cellIndex + 1;

      for (let index = 0; index < columnCount; index += 1) {
        nextRow.appendChild(createBodyCell());
      }

      row.after(nextRow);
      return nextRow.cells[Math.min(cell.cellIndex, nextRow.cells.length - 1)];
    });
  };

  const addTableColumn = () => {
    updateSelectedTable((cell, selectedRow, table) => {
      const targetIndex = cell.cellIndex + 1;
      let nextCell: HTMLTableCellElement | null = null;

      Array.from(table.rows).forEach((row) => {
        const insertedCell = row.insertCell(
          Math.min(targetIndex, row.cells.length),
        );
        insertedCell.dataset.placeholder = "Cell";
        insertedCell.innerHTML = "<p><br></p>";
        if (row === selectedRow) {
          nextCell = insertedCell;
        }
      });

      return nextCell;
    });
  };

  const deleteTableRow = () => {
    updateSelectedTable((cell, row, table) => {
      if (table.rows.length <= 1) {
        table.remove();
        return null;
      }

      const nextRow =
        row.nextElementSibling instanceof HTMLTableRowElement
          ? row.nextElementSibling
          : row.previousElementSibling instanceof HTMLTableRowElement
            ? row.previousElementSibling
            : null;
      const nextCell =
        nextRow?.cells[Math.min(cell.cellIndex, nextRow.cells.length - 1)] ??
        null;

      row.remove();
      return nextCell;
    });
  };

  const deleteTableColumn = () => {
    updateSelectedTable((cell, selectedRow, table) => {
      if (table.rows[0]?.cells.length <= 1) {
        table.remove();
        return null;
      }

      const targetIndex = cell.cellIndex;
      const nextColumnIndex = Math.max(targetIndex - 1, 0);
      let nextCell: HTMLTableCellElement | null = null;

      Array.from(table.rows).forEach((row) => {
        if (row.cells[targetIndex]) {
          row.deleteCell(targetIndex);
        }
        if (row === selectedRow) {
          nextCell = row.cells[Math.min(nextColumnIndex, row.cells.length - 1)];
        }
      });

      return nextCell;
    });
  };

  const deleteTable = () => {
    updateSelectedTable((_cell, _row, table) => {
      table.remove();
      return null;
    });
  };

  const getSelectedBlockElement = () => {
    const editor = editorRef.current;
    let node: Node | null = getSelectedElement();

    while (node && node !== editor) {
      if (node instanceof HTMLElement) {
        const tagName = node.tagName.toLowerCase();
        if (/^(h[1-6]|p|div|li)$/.test(tagName)) {
          return node;
        }
      }
      node = node.parentElement;
    }

    return null;
  };

  const applyInlineStyle = (
    command: "fontName" | "fontSize",
    commandValue: string,
    styleProperty: "fontFamily" | "fontSize",
    styleValue: string,
  ) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    restoreEditorSelection();
    const selection = window.getSelection();
    const target = getSelectedTableCell() ?? getSelectedBlockElement();

    if (!selection?.rangeCount || selection.isCollapsed) {
      if (!target) return;
      target.style[styleProperty] = styleValue;
      saveEditorContent();
      return;
    }

    const existingFontElements = new Set(editor.querySelectorAll("font"));
    document.execCommand(command, false, commandValue);

    Array.from(editor.querySelectorAll("font")).forEach((fontElement) => {
      if (existingFontElements.has(fontElement)) return;

      const span = document.createElement("span");
      span.style[styleProperty] = styleValue;
      while (fontElement.firstChild) {
        span.appendChild(fontElement.firstChild);
      }
      fontElement.replaceWith(span);
    });

    saveEditorContent();
  };

  const applyFontSize = (size: FontSizeOption) => {
    applyInlineStyle(
      "fontSize",
      "7",
      "fontSize",
      FONT_SIZE_OPTIONS[size].fontSize,
    );
  };

  const applyFont = (font: FontOption) => {
    const fontFamily = FONT_OPTIONS[font].fontFamily;
    applyInlineStyle("fontName", fontFamily, "fontFamily", fontFamily);
  };

  const applyList = (type: "bullet" | "decimal" | "alpha") => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    restoreEditorSelection();
    const selectedElement = getSelectedElement();
    const currentList = selectedElement?.closest("ol, ul") as
      | HTMLOListElement
      | HTMLUListElement
      | null;

    if (type === "bullet") {
      document.execCommand("insertUnorderedList");
    } else if (currentList?.tagName === "OL") {
      const selectedStyle = type === "alpha" ? "lower-alpha" : "decimal";
      if (currentList.style.listStyleType === selectedStyle) {
        document.execCommand("insertOrderedList");
      } else {
        currentList.style.listStyleType = selectedStyle;
      }
    } else {
      document.execCommand("insertOrderedList");
      const orderedList = getSelectedElement()?.closest("ol");
      if (orderedList instanceof HTMLOListElement) {
        orderedList.style.listStyleType =
          type === "alpha" ? "lower-alpha" : "decimal";
      }
    }

    saveEditorContent();
  };

  const handleEditorTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    event.preventDefault();
    const cell = getSelectedTableCell();
    if (cell) {
      const table = cell.closest("table");
      if (!table) return;

      const cells = Array.from(
        table.querySelectorAll<HTMLTableCellElement>("td, th"),
      );
      const currentIndex = cells.indexOf(cell);
      const nextIndex = currentIndex + (event.shiftKey ? -1 : 1);

      if (cells[nextIndex]) {
        placeCaretInCell(cells[nextIndex]);
        syncEditorState();
        return;
      }

      if (!event.shiftKey) {
        const lastRow = table.rows[table.rows.length - 1];
        const newRow = lastRow.cloneNode(false) as HTMLTableRowElement;
        const columnCount = lastRow.cells.length || 1;
        for (let index = 0; index < columnCount; index += 1) {
          newRow.appendChild(createBodyCell());
        }
        lastRow.after(newRow);
        placeCaretInCell(newRow.cells[0]);
        saveEditorContent();
      }
      return;
    }

    const selectedElement = getSelectedElement();
    if (selectedElement?.closest("li")) {
      document.execCommand(event.shiftKey ? "outdent" : "indent");
      saveEditorContent();
      return;
    }

    const blockElement = getSelectedBlockElement();
    if (!blockElement) return;

    const currentIndent = Number.parseFloat(blockElement.style.marginLeft) || 0;
    const nextIndent = Math.max(
      0,
      currentIndent + (event.shiftKey ? -1.5 : 1.5),
    );
    blockElement.style.marginLeft = nextIndent ? `${nextIndent}rem` : "";
    saveEditorContent();
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      if (selectionIsInEditor(window.getSelection())) {
        syncEditorState();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  });

  return (
    <section className="sketchy-card p-4 min-h-[520px] flex flex-col">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <TitleEditor
          title={block.title}
          onUpdateTitle={onUpdateTitle}
          onEnter={() => editorRef.current?.focus()}
        />
        <div className="flex flex-wrap items-center gap-1 self-start sm:self-auto">
          <MemoCollectionPicker
            collections={collections}
            value={block.collectionId}
            onChange={onUpdateCollection}
            onCreateCollection={onAddCollection}
            includeArchive
            isArchived={Boolean(block.archivedAt)}
            onArchive={onArchive}
            compact
          />
          {block.archivedAt ? (
            <>
              <button
                type="button"
                onClick={onRestore}
                className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/80 hover:bg-primary/10 hover:text-foreground transition-colors"
                aria-label="Restore note"
                title="Restore note"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onRequestDelete}
                className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="Delete note permanently"
                title="Delete permanently"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onArchive}
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/80 hover:bg-primary/10 hover:text-foreground transition-colors"
              aria-label="Delete note"
              title="Delete note"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-y border-primary/20 py-2">
        <select
          aria-label="Font"
          title="Font"
          defaultValue=""
          onMouseDown={captureEditorSelection}
          onChange={(event) => {
            const value = event.currentTarget.value as FontOption;
            if (!value) return;
            applyFont(value);
            event.currentTarget.value = "";
          }}
          className="h-8 max-w-32 rounded-md border border-primary/20 bg-background/50 px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-foreground focus:ring-2 focus:ring-primary/20"
        >
          <option value="" disabled>
            Font
          </option>
          {Object.entries(FONT_OPTIONS).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Font size"
          title="Font size"
          defaultValue=""
          onMouseDown={captureEditorSelection}
          onChange={(event) => {
            const value = event.currentTarget.value as FontSizeOption;
            if (!value) return;
            applyFontSize(value);
            event.currentTarget.value = "";
          }}
          className="h-8 rounded-md border border-primary/20 bg-background/50 px-2 text-xs text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-foreground focus:ring-2 focus:ring-primary/20"
        >
          <option value="" disabled>
            Size
          </option>
          {Object.entries(FONT_SIZE_OPTIONS).map(([value, option]) => (
            <option key={value} value={value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="mx-1 h-5 w-px bg-primary/20" aria-hidden />
        <ToolbarButton
          label="Bold"
          onClick={() => runFormatCommand("bold")}
          active={formattingState.bold}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          onClick={() => runFormatCommand("italic")}
          active={formattingState.italic}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          onClick={() => runFormatCommand("underline")}
          active={formattingState.underline}
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          onClick={() => runFormatCommand("strikeThrough")}
          active={formattingState.strikeThrough}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-primary/20" aria-hidden />
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) captureEditorSelection();
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onPointerDown={captureEditorSelection}
              className="flex h-8 items-center justify-center gap-0.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
              aria-label="List options"
              title="Lists"
            >
              <List className="h-4 w-4" />
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              editorRef.current?.focus();
              restoreEditorSelection();
              syncEditorState();
            }}
          >
            <DropdownMenuItem onSelect={() => applyList("bullet")}>
              <List />
              Bullets
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => applyList("decimal")}>
              <ListOrdered />
              1, 2, 3
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => applyList("alpha")}>
              <span className="flex h-4 w-4 items-center justify-center text-xs font-semibold">
                a.
              </span>
              a, b, c
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolbarButton
          label="Align left"
          onClick={() => runFormatCommand("justifyLeft")}
          active={formattingState.justifyLeft}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Align centre"
          onClick={() => runFormatCommand("justifyCenter")}
          active={formattingState.justifyCenter}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Align right"
          onClick={() => runFormatCommand("justifyRight")}
          active={formattingState.justifyRight}
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-primary/20" aria-hidden />
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) captureEditorSelection();
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onPointerDown={captureEditorSelection}
              className="flex h-8 items-center justify-center gap-0.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
              aria-label="Table options"
              title="Table"
            >
              <Table2 className="h-4 w-4" />
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-44"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              editorRef.current?.focus();
              restoreEditorSelection();
              syncEditorState();
            }}
          >
            <DropdownMenuItem onSelect={insertTable}>
              <Table2 />
              Insert 3 × 3 table
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!isCursorInTable} onSelect={addTableRow}>
              <TableRowsSplit />
              Add row below
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!isCursorInTable}
              onSelect={addTableColumn}
            >
              <TableColumnsSplit />
              Add column right
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!isCursorInTable}
              onSelect={deleteTableRow}
            >
              <SquareMinus />
              Delete row
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!isCursorInTable}
              onSelect={deleteTableColumn}
            >
              <SquarePlus className="rotate-45" />
              Delete column
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!isCursorInTable}
              onSelect={deleteTable}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 />
              Delete table
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onClick={syncEditorState}
        onKeyDown={handleEditorTab}
        onKeyUp={syncEditorState}
        onSelect={syncEditorState}
        onInput={(event) => {
          onUpdateContent(event.currentTarget.innerHTML);
          syncEditorState();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          onUpdateContent(event.currentTarget.innerHTML);
          syncEditorState();
        }}
        className="rich-text-editor mt-4 flex-1 min-h-[380px] rounded-md bg-background/35 px-4 py-3 text-base leading-7 text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        aria-label={`Write content for ${block.title}`}
        data-placeholder="Write paragraphs here..."
      />
    </section>
  );
}

interface TitleEditorProps {
  title: string;
  onUpdateTitle: (title: string) => void;
  onEnter: () => void;
}

function TitleEditor({ title, onUpdateTitle, onEnter }: TitleEditorProps) {
  const [titleText, setTitleText] = useState(title);

  useEffect(() => {
    setTitleText(title);
  }, [title]);

  const saveTitle = () => {
    const trimmed = titleText.trim();
    if (trimmed) {
      onUpdateTitle(trimmed);
    } else {
      setTitleText(title);
    }
  };

  return (
    <input
      value={titleText}
      onChange={(event) => setTitleText(event.target.value)}
      onBlur={saveTitle}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveTitle();
          onEnter();
        }
        if (event.key === "Escape") {
          setTitleText(title);
          event.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 bg-transparent text-xl font-bold text-foreground outline-none rounded px-1 py-1 focus:bg-background/40 focus:ring-2 focus:ring-primary/20"
      aria-label="Note title"
    />
  );
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
}

function ToolbarButton({
  label,
  onClick,
  children,
  disabled = false,
  active = false,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors hover:bg-primary/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-35 ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground"
      }`}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </button>
  );
}
