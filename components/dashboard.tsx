"use client";

import { useState, useRef, useEffect } from "react";
import { useTodoStore } from "@/hooks/use-todo-store";
import { TodoBlockCard } from "./todo-block";
import { GlobalButtons } from "./global-buttons";
import { AuthBar } from "./auth-bar";
import { TextBlocksPage } from "./text-blocks-page";
import { Pencil } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

export function Dashboard() {
  const {
    state,
    hydrated,
    user,
    syncStatus,
    onAuthChange,
    setTimeRange,
    addBlock,
    updateBlockTitle,
    deleteBlock,
    reorderBlocks,
    reorderItems,
    addItem,
    updateItemText,
    toggleItemStatus,
    softDeleteItem,
    undoDeleteItem,
    clearAndArchive,
    addTextBlock,
    updateTextBlockTitle,
    updateTextBlockContent,
    deleteTextBlock,
  } = useTodoStore();

  const [editingTimeRange, setEditingTimeRange] = useState(false);
  const [timeRangeText, setTimeRangeText] = useState(state.timeRange);
  const [activeView, setActiveView] = useState<"stickies" | "memos">(
    "stickies",
  );
  const [selectedTextBlockId, setSelectedTextBlockId] = useState<string | null>(
    null,
  );
  const timeRangeRef = useRef<HTMLInputElement>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag before activating
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setTimeRangeText(state.timeRange);
  }, [state.timeRange]);

  useEffect(() => {
    if (editingTimeRange && timeRangeRef.current) {
      timeRangeRef.current.focus();
      timeRangeRef.current.select();
    }
  }, [editingTimeRange]);

  useEffect(() => {
    if (
      selectedTextBlockId &&
      !state.textBlocks.some((block) => block.id === selectedTextBlockId)
    ) {
      setSelectedTextBlockId(null);
    }
  }, [selectedTextBlockId, state.textBlocks]);

  const handleTimeRangeSave = () => {
    setTimeRange(timeRangeText.trim());
    setEditingTimeRange(false);
  };

  const moveBlock = (index: number, direction: "up" | "down") => {
    const newBlocks = [...state.blocks];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;
    [newBlocks[index], newBlocks[targetIndex]] = [
      newBlocks[targetIndex],
      newBlocks[index],
    ];
    reorderBlocks(newBlocks);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = state.blocks.findIndex((b) => b.id === active.id);
      const newIndex = state.blocks.findIndex((b) => b.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newBlocks = arrayMove(state.blocks, oldIndex, newIndex);
        reorderBlocks(newBlocks);
      }
    }
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-lg animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {/* Header */}
      <header className="px-4 md:px-8 pt-6 pb-4 md:mr-24">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground text-balance">
            To Do at One Glance
          </h1>
          <div className="flex-shrink-0 w-full sm:w-auto">
            <AuthBar
              user={user}
              syncStatus={syncStatus}
              onAuthChange={onAuthChange}
            />
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Time Range */}
          <div className="flex items-center gap-2">
            {editingTimeRange ? (
              <input
                ref={timeRangeRef}
                value={timeRangeText}
                onChange={(e) => setTimeRangeText(e.target.value)}
                onBlur={handleTimeRangeSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTimeRangeSave();
                  if (e.key === "Escape") {
                    setTimeRangeText(state.timeRange);
                    setEditingTimeRange(false);
                  }
                }}
                placeholder="e.g. Feb 3 - Feb 9, 2025"
                className="text-sm text-foreground bg-background/50 px-3 py-1.5 rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 w-64 placeholder:text-muted-foreground"
              />
            ) : (
              <button
                onClick={() => setEditingTimeRange(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>{state.timeRange || "Set a time range..."}</span>
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div
            className="inline-flex h-9 w-fit items-center rounded-md bg-secondary/70 p-1"
            role="tablist"
            aria-label="Workspace view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "stickies"}
              onClick={() => setActiveView("stickies")}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                activeView === "stickies"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Stickies
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "memos"}
              onClick={() => setActiveView("memos")}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                activeView === "memos"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Memos
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="px-4 md:px-8 md:mr-24">
        {activeView === "stickies" ? (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={state.blocks.map((b) => b.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {state.blocks.map((block, index) => (
                    <TodoBlockCard
                      key={block.id}
                      block={block}
                      isFirst={index === 0}
                      isLast={index === state.blocks.length - 1}
                      onUpdateTitle={(title) =>
                        updateBlockTitle(block.id, title)
                      }
                      onAddItem={(text) => addItem(block.id, text)}
                      onToggleItem={(itemId) =>
                        toggleItemStatus(block.id, itemId)
                      }
                      onDeleteItem={(itemId) =>
                        softDeleteItem(block.id, itemId)
                      }
                      onUndoItem={(itemId) => undoDeleteItem(block.id, itemId)}
                      onUpdateItemText={(itemId, text) =>
                        updateItemText(block.id, itemId, text)
                      }
                      onReorderItems={(newItems) =>
                        reorderItems(block.id, newItems)
                      }
                      onMoveUp={() => moveBlock(index, "up")}
                      onMoveDown={() => moveBlock(index, "down")}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {state.blocks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-lg text-muted-foreground mb-2">
                  No stickies yet.
                </p>
                <p className="text-sm text-muted-foreground">
                  Click the + button to add your first sticky.
                </p>
              </div>
            )}
          </>
        ) : (
          <TextBlocksPage
            blocks={state.textBlocks}
            selectedBlockId={selectedTextBlockId}
            onSelectBlock={setSelectedTextBlockId}
            onAddBlock={addTextBlock}
            onUpdateTitle={updateTextBlockTitle}
            onUpdateContent={updateTextBlockContent}
          />
        )}
      </main>

      {/* Global Action Buttons */}
      <GlobalButtons
        mode={activeView}
        blocks={state.blocks}
        textBlocks={state.textBlocks}
        onClearAndArchive={clearAndArchive}
        onAddBlock={addBlock}
        onAddItemToBlock={addItem}
        onDeleteBlock={deleteBlock}
        onAddTextBlock={addTextBlock}
        onDeleteTextBlock={deleteTextBlock}
        onSelectTextBlock={setSelectedTextBlockId}
      />
    </div>
  );
}
