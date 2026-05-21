"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { MemoCollection, TextBlock } from "@/lib/types";
import {
  Archive,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Menu,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { MemoCollectionPicker } from "./memo-collection-picker";
import { ConfirmModal } from "./confirm-modal";

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

const DEFAULT_BLOCK_TITLE = "Untitled Memo";
const UNFILED_LABEL = "Unfiled";
const ARCHIVE_LABEL = "Archive";
const UNFILED_COLLECTION_KEY = "__unfiled";
const ARCHIVE_COLLECTION_KEY = "__archive";

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

  const handleQuickAdd = () => {
    const newBlockId = onAddBlock(DEFAULT_BLOCK_TITLE, null);
    if (newBlockId) onSelectBlock(newBlockId);
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
            <h2 className="text-sm font-bold text-foreground">Memos</h2>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuCollapsed((collapsed) => !collapsed)}
              className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
              aria-label={
                menuCollapsed ? "Expand memos menu" : "Collapse memos menu"
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
                <button
                  type="button"
                  onClick={handleQuickAdd}
                  className="h-8 w-8 flex items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
                  aria-label="Add a new memo"
                  title="Add memo"
                >
                  <Plus className="h-4 w-4" />
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

            <nav className="flex flex-col gap-3" aria-label="Memo collections">
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
            aria-label="Add your first memo"
          >
            <span className="sketchy-btn h-14 w-14 flex items-center justify-center">
              <Plus className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium">Add a new memo</span>
          </button>
        </div>
      )}

      <ConfirmModal
        open={Boolean(memoPendingDelete)}
        title="Delete Memo"
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

        {collectionId && !editing && (
          <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
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
                  aria-label={`Archive ${block.title}`}
                  title="Archive"
                >
                  <Archive className="h-3.5 w-3.5" />
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

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== block.content) {
      editorRef.current.innerHTML = block.content;
    }
  }, [block.content]);

  const runFormatCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    onUpdateContent(editorRef.current?.innerHTML ?? "");
  };

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
                aria-label="Restore memo"
                title="Restore memo"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onRequestDelete}
                className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="Delete memo permanently"
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
              aria-label="Archive memo"
              title="Archive memo"
            >
              <Archive className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1 border-y border-primary/20 py-2">
        <ToolbarButton
          label="Heading"
          onClick={() => runFormatCommand("formatBlock", "h2")}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Bold" onClick={() => runFormatCommand("bold")}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          onClick={() => runFormatCommand("italic")}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          onClick={() => runFormatCommand("insertUnorderedList")}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onClick={() => runFormatCommand("insertOrderedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => onUpdateContent(event.currentTarget.innerHTML)}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          onUpdateContent(event.currentTarget.innerHTML);
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
      aria-label="Memo title"
    />
  );
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({ label, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
