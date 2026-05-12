"use client";

import { useState, useRef, useEffect } from "react";
import type { TodoBlock } from "@/lib/types";
import { Archive, Plus, Minus } from "lucide-react";
import { ConfirmModal } from "./confirm-modal";

interface GlobalButtonsProps {
  blocks: TodoBlock[];
  onClearAndArchive: () => void;
  onAddBlock: (title: string) => void;
  onAddItemToBlock: (blockId: string, text: string) => void;
  onDeleteBlock: (blockId: string) => void;
}

type AddStep = "choose" | "block-input" | "task-select" | "task-input";

export function GlobalButtons({
  blocks,
  onClearAndArchive,
  onAddBlock,
  onAddItemToBlock,
  onDeleteBlock,
}: GlobalButtonsProps) {
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("choose");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [newTaskText, setNewTaskText] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [deleteBlockId, setDeleteBlockId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const blockInputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addStep === "block-input" && blockInputRef.current) {
      blockInputRef.current.focus();
    }
  }, [addStep]);

  useEffect(() => {
    if (addStep === "task-input" && taskInputRef.current) {
      taskInputRef.current.focus();
    }
  }, [addStep]);

  const resetAddModal = () => {
    setShowAddModal(false);
    setAddStep("choose");
    setNewBlockTitle("");
    setNewTaskText("");
    setSelectedBlockId(null);
  };

  const handleAddBlock = () => {
    const trimmed = newBlockTitle.trim();
    if (trimmed) {
      onAddBlock(trimmed);
      resetAddModal();
    }
  };

  const handleAddTask = () => {
    const trimmed = newTaskText.trim();
    if (trimmed && selectedBlockId) {
      onAddItemToBlock(selectedBlockId, trimmed);
      resetAddModal();
    }
  };

  const handleDeleteBlock = () => {
    if (deleteBlockId) {
      onDeleteBlock(deleteBlockId);
      setDeleteBlockId(null);
      setShowDeleteConfirm(false);
      setShowDeleteModal(false);
    }
  };

  // Shared action buttons (rendered identically for desktop and mobile)
  const actionButtons = (size: "lg" | "sm") => {
    const btnSize = size === "lg" ? "h-14 w-14" : "h-12 w-12";
    const iconSize = size === "lg" ? "h-5 w-5" : "h-5 w-5";
    const iconSizePlus = size === "lg" ? "h-6 w-6" : "h-5 w-5";

    return (
      <>
        <button
          type="button"
          onClick={() => setShowArchiveConfirm(true)}
          className={`sketchy-btn ${btnSize} flex items-center justify-center`}
          aria-label="Clear and archive all completed and deleted items"
          title="Clear & Archive"
        >
          <Archive className={iconSize} />
        </button>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className={`sketchy-btn ${btnSize} flex items-center justify-center`}
          aria-label="Add task or block"
          title="Add"
        >
          <Plus className={iconSizePlus} />
        </button>

        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className={`sketchy-btn ${btnSize} flex items-center justify-center`}
          aria-label="Remove a block"
          title="Remove Block"
        >
          <Minus className={iconSizePlus} />
        </button>
      </>
    );
  };

  return (
    <>
      {/* Desktop: fixed right side buttons */}
      <div className="hidden md:flex fixed right-6 top-1/2 -translate-y-1/2 flex-col gap-4 z-40">
        {actionButtons("lg")}
      </div>

      {/* Mobile: floating bottom-right buttons */}
      <div className="md:hidden fixed right-4 bottom-6 flex flex-col gap-3 z-40">
        {actionButtons("sm")}
      </div>

      {/* Add Modal (block or task) */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20"
          onClick={(e) => {
            if (e.target === e.currentTarget) resetAddModal();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") resetAddModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Add task or block"
        >
          <div className="sketchy-card p-5 w-72 mx-4">
            {addStep === "choose" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-base font-bold text-foreground">
                  What would you like to add?
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    if (blocks.length === 0) {
                      // No blocks to add a task to - show message
                      return;
                    }
                    setAddStep("task-select");
                  }}
                  className="text-left text-sm font-medium px-3 py-2.5 rounded-md hover:bg-secondary text-foreground transition-colors"
                  disabled={blocks.length === 0}
                >
                  Add Task
                  {blocks.length === 0 && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Create a block first
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setAddStep("block-input")}
                  className="text-left text-sm font-medium px-3 py-2.5 rounded-md hover:bg-secondary text-foreground transition-colors"
                  disabled={blocks.length >= 10}
                >
                  Add Block
                  {blocks.length >= 10 && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Maximum 10 blocks reached
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetAddModal}
                  className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {addStep === "block-input" && (
              <div className="flex flex-col gap-3">
                <h2 className="text-base font-bold text-foreground">
                  New Block
                </h2>
                <input
                  ref={blockInputRef}
                  value={newBlockTitle}
                  onChange={(e) => setNewBlockTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddBlock();
                    if (e.key === "Escape") resetAddModal();
                  }}
                  placeholder="Block title..."
                  className="text-sm text-foreground bg-background/50 px-3 py-2 rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddBlock}
                    className="flex-1 text-sm font-medium bg-primary text-primary-foreground px-3 py-2 hover:bg-primary/90 transition-colors"
                    style={{ borderRadius: "8px 6px 10px 6px" }}
                  >
                    Add Block
                  </button>
                  <button
                    type="button"
                    onClick={resetAddModal}
                    className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {addStep === "task-select" && (
              <div className="flex flex-col gap-2">
                <h2 className="text-base font-bold text-foreground">
                  Add task to which block?
                </h2>
                {blocks.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => {
                      setSelectedBlockId(b.id);
                      setAddStep("task-input");
                    }}
                    className="text-left text-sm px-3 py-2 rounded-md hover:bg-secondary text-foreground transition-colors truncate"
                  >
                    {b.title}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={resetAddModal}
                  className="text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {addStep === "task-input" && selectedBlockId && (
              <div className="flex flex-col gap-3">
                <h2 className="text-base font-bold text-foreground">
                  New Task
                </h2>
                <p className="text-xs text-muted-foreground -mt-1">
                  Adding to: {blocks.find((b) => b.id === selectedBlockId)?.title}
                </p>
                <input
                  ref={taskInputRef}
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTask();
                    if (e.key === "Escape") resetAddModal();
                  }}
                  placeholder="Task text..."
                  className="text-sm text-foreground bg-background/50 px-3 py-2 rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddTask}
                    className="flex-1 text-sm font-medium bg-primary text-primary-foreground px-3 py-2 hover:bg-primary/90 transition-colors"
                    style={{ borderRadius: "8px 6px 10px 6px" }}
                  >
                    Add Task
                  </button>
                  <button
                    type="button"
                    onClick={resetAddModal}
                    className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Block Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowDeleteModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Delete a block"
        >
          <div className="sketchy-card p-5 w-72 mx-4">
            <h2 className="text-base font-bold text-foreground mb-3">
              Delete a block
            </h2>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No blocks to delete.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {blocks.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => {
                      setDeleteBlockId(b.id);
                      setShowDeleteConfirm(true);
                    }}
                    className="text-left text-sm px-3 py-2 rounded-md hover:bg-destructive/10 text-foreground hover:text-destructive transition-colors truncate"
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Clear & Archive Confirmation */}
      <ConfirmModal
        open={showArchiveConfirm}
        title="Clear & Archive"
        message="This will permanently remove all completed and deleted items across every block. Only todo items will remain."
        confirmLabel="Clear All"
        onConfirm={() => {
          onClearAndArchive();
          setShowArchiveConfirm(false);
        }}
        onCancel={() => setShowArchiveConfirm(false)}
      />

      {/* Delete Block Confirmation */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Block"
        message={`Are you sure you want to delete "${blocks.find((b) => b.id === deleteBlockId)?.title || ""}" and all its items? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteBlock}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteBlockId(null);
        }}
      />
    </>
  );
}
