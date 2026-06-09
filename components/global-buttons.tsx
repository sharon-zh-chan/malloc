"use client";

import { useEffect, useRef, useState } from "react";
import type { MemoCollection, TextBlock, TodoBlock } from "@/lib/types";
import { BrushCleaning, Plus } from "lucide-react";
import { MemoCollectionPicker } from "./memo-collection-picker";
import { ConfirmModal } from "./confirm-modal";

interface GlobalButtonsProps {
  mode: "stickies" | "memos";
  blocks: TodoBlock[];
  textBlocks: TextBlock[];
  memoCollections: MemoCollection[];
  onAddBlock: (title: string) => void;
  onAddTextBlock: (title: string, collectionId?: string | null) => string | null;
  onSelectTextBlock: (blockId: string | null) => void;
  onAddMemoCollection: (title: string) => string | null;
  onClearArchivedTasks: () => void;
}

export function GlobalButtons({
  mode,
  blocks,
  textBlocks,
  memoCollections,
  onAddBlock,
  onAddTextBlock,
  onSelectTextBlock,
  onAddMemoCollection,
  onClearArchivedTasks,
}: GlobalButtonsProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [selectedMemoCollectionId, setSelectedMemoCollectionId] = useState<
    string | null
  >(null);
  const blockInputRef = useRef<HTMLInputElement>(null);
  const isAtLimit = mode === "memos" && textBlocks.length >= 30;
  const canClearArchivedTasks = blocks.some((block) =>
    block.items.some((item) => item.status !== "todo"),
  );

  useEffect(() => {
    if (showAddModal) blockInputRef.current?.focus();
  }, [showAddModal]);

  const closeModal = () => {
    setShowAddModal(false);
    setNewBlockTitle("");
    setSelectedMemoCollectionId(null);
  };

  const handleAddBlock = () => {
    const trimmed = newBlockTitle.trim();
    if (!trimmed) return;

    if (mode === "memos") {
      const newBlockId = onAddTextBlock(trimmed, selectedMemoCollectionId);
      if (newBlockId) onSelectTextBlock(newBlockId);
    } else {
      onAddBlock(trimmed);
    }

    closeModal();
  };

  return (
    <>
      <div className="flex items-stretch border-l border-foreground">
        {mode === "stickies" && (
          <button
            type="button"
            onClick={() => setShowCleanupConfirm(true)}
            disabled={!canClearArchivedTasks}
            className="flex h-9 w-9 items-center justify-center border-r border-foreground bg-card text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Clear completed and deleted tasks from all stickies"
            title="Clear completed and deleted tasks from all stickies"
          >
            <BrushCleaning className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          disabled={isAtLimit}
          className="flex h-9 w-9 items-center justify-center bg-card text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={mode === "memos" ? "Add note" : "Add sticky"}
          title={mode === "memos" ? "Add note" : "Add sticky"}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={mode === "memos" ? "Add note" : "Add sticky"}
        >
          <div className="sketchy-card mx-4 w-72 p-5">
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-bold text-foreground">
                New {mode === "memos" ? "Note" : "Sticky"}
              </h2>
              <input
                ref={blockInputRef}
                value={newBlockTitle}
                onChange={(event) => setNewBlockTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAddBlock();
                  if (event.key === "Escape") closeModal();
                }}
                placeholder={`${mode === "memos" ? "Note" : "Sticky"} title...`}
                className="bg-background/50 px-3 py-2 text-sm text-foreground sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
              />
              {mode === "memos" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Collection
                  </label>
                  <MemoCollectionPicker
                    collections={memoCollections}
                    value={selectedMemoCollectionId}
                    onChange={setSelectedMemoCollectionId}
                    onCreateCollection={onAddMemoCollection}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddBlock}
                  className="flex-1 bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Add {mode === "memos" ? "Note" : "Sticky"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showCleanupConfirm}
        title="Clear Completed And Deleted Tasks?"
        message="Move all completed and deleted tasks from every sticky to History? You can recover them later or delete them permanently from History."
        confirmLabel="Clear Tasks"
        onConfirm={() => {
          onClearArchivedTasks();
          setShowCleanupConfirm(false);
        }}
        onCancel={() => setShowCleanupConfirm(false)}
      />
    </>
  );
}
