"use client";

import { useState, useEffect } from "react";
import { useTodoStore } from "@/hooks/use-todo-store";
import { TodoBlockCard } from "./todo-block";
import { GlobalButtons } from "./global-buttons";
import { AuthBar } from "./auth-bar";
import { AuthScreen } from "./auth-screen";
import { LoggedOutScreen } from "./logged-out-screen";
import { TextBlocksPage } from "./text-blocks-page";
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

const LOGOUT_REDIRECT_KEY = "malloc_logout_redirect_pending";

function LoadingWorkspace() {
  return <div className="min-h-screen bg-background" aria-hidden="true" />;
}

function LogoutRedirect() {
  useEffect(() => {
    window.location.replace("/logged-out");
  }, []);

  return <LoadingWorkspace />;
}

export function Dashboard() {
  const {
    state,
    hydrated,
    authResolved,
    workspaceReady,
    user,
    syncStatus,
    onAuthChange,
    clearLocalWorkspace,
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
    clearStickyArchivedTasks,
    addTextBlock,
    updateTextBlockTitle,
    updateTextBlockContent,
    updateTextBlockCollection,
    archiveTextBlock,
    restoreTextBlock,
    deleteTextBlock,
    addMemoCollection,
    updateMemoCollectionTitle,
    deleteMemoCollection,
    trackProductEvent,
  } = useTodoStore();

  const [activeView, setActiveView] = useState<"stickies" | "memos">(
    "stickies",
  );
  const [selectedTextBlockId, setSelectedTextBlockId] = useState<string | null>(
    null,
  );
  const [logoutRedirecting, setLogoutRedirecting] = useState(false);
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
    if (
      selectedTextBlockId &&
      !state.textBlocks.some((block) => block.id === selectedTextBlockId)
    ) {
      setSelectedTextBlockId(null);
    }
  }, [selectedTextBlockId, state.textBlocks]);

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

  if (logoutRedirecting) {
    return <LoggedOutScreen clearLogoutRedirect={false} />;
  }

  if (!hydrated || !authResolved) {
    return <LoadingWorkspace />;
  }

  if (user && !workspaceReady) {
    return <AuthScreen onAuthChange={onAuthChange} />;
  }

  if (!user) {
    if (window.sessionStorage.getItem(LOGOUT_REDIRECT_KEY) === "true") {
      return <LogoutRedirect />;
    }

    return <AuthScreen onAuthChange={onAuthChange} />;
  }

  return (
    <div className="min-h-screen pb-8">
      <header className="border-b brand-rule bg-card px-4 py-4 md:px-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <img
            src="/brand/malloc-wordmark.svg"
            alt="malloc - Space for what's on your mind."
            className="h-16 w-auto sm:h-[76px]"
          />
          <div className="flex-shrink-0 w-full sm:w-auto">
            {/* Discard any password-manager DOM additions with the signed-out form. */}
            <AuthBar
              key={user.id}
              user={user}
              syncStatus={syncStatus}
              onAuthChange={onAuthChange}
              onLogout={clearLocalWorkspace}
              onLogoutStart={() => setLogoutRedirecting(true)}
            />
          </div>
        </div>
      </header>

      <section className="pb-5">
        <div className="flex min-h-9 items-stretch justify-between border-b border-foreground bg-card px-4 md:px-8">
          <div
            className="flex items-stretch"
            role="tablist"
            aria-label="Workspace view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "stickies"}
              onClick={() => {
                setActiveView("stickies");
                void trackProductEvent("view_switched", { view: "stickies" });
              }}
              className={`border-r border-foreground px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeView === "stickies"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
            >
              Stickies
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "memos"}
              onClick={() => {
                setActiveView("memos");
                void trackProductEvent("view_switched", { view: "memos" });
              }}
              className={`border-r border-foreground px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeView === "memos"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
            >
              Memos
            </button>
          </div>

          <GlobalButtons
            mode={activeView}
            blocks={state.blocks}
            textBlocks={state.textBlocks}
            memoCollections={state.memoCollections}
            onAddBlock={addBlock}
            onAddTextBlock={addTextBlock}
            onSelectTextBlock={setSelectedTextBlockId}
            onAddMemoCollection={addMemoCollection}
            onClearArchivedTasks={clearAndArchive}
          />
        </div>
      </section>

      {/* Main Workspace */}
      <main className="px-4 md:px-8">
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
                <div className="brand-panel-grid grid grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
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
                      onDeleteBlock={() => deleteBlock(block.id)}
                      onClearTasks={() => clearStickyArchivedTasks(block.id)}
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
            collections={state.memoCollections}
            selectedBlockId={selectedTextBlockId}
            onSelectBlock={setSelectedTextBlockId}
            onAddBlock={addTextBlock}
            onUpdateTitle={updateTextBlockTitle}
            onUpdateContent={updateTextBlockContent}
            onUpdateCollection={updateTextBlockCollection}
            onArchiveBlock={archiveTextBlock}
            onRestoreBlock={restoreTextBlock}
            onDeleteBlock={deleteTextBlock}
            onAddCollection={addMemoCollection}
            onUpdateCollectionTitle={updateMemoCollectionTitle}
            onDeleteCollection={deleteMemoCollection}
          />
        )}
      </main>

    </div>
  );
}
