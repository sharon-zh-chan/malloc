"use client";

import { useState, useEffect } from "react";
import { useTodoStore } from "@/hooks/use-todo-store";
import type { TodoItem } from "@/lib/types";
import { TodoBlockCard } from "./todo-block";
import { GlobalButtons } from "./global-buttons";
import { AuthBar } from "./auth-bar";
import { AuthScreen } from "./auth-screen";
import { LoggedOutScreen } from "./logged-out-screen";
import { TextBlocksPage } from "./text-blocks-page";
import { HistoryPage } from "./history-page";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

const LOGOUT_REDIRECT_KEY = "malloc_logout_redirect_pending";

type DragData = {
  type?: "sticky" | "task";
  stickyId?: string;
  status?: TodoItem["status"];
};

const taskStatuses = ["todo", "completed", "deleted"] as const;

function getGroupedTasks(items: TodoItem[]) {
  return {
    todo: items
      .filter((item) => item.status === "todo")
      .sort((a, b) => a.order - b.order),
    completed: items
      .filter((item) => item.status === "completed")
      .sort((a, b) => a.order - b.order),
    deleted: items
      .filter((item) => item.status === "deleted")
      .sort((a, b) => a.order - b.order),
  };
}

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
    moveItem,
    addItem,
    updateItemText,
    toggleItemStatus,
    softDeleteItem,
    undoDeleteItem,
    clearAndArchive,
    clearStickyArchivedTasks,
    restoreTaskToTodo,
    deleteTasksPermanently,
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

  const [activeView, setActiveView] = useState<"stickies" | "memos" | "history">(
    "stickies",
  );
  const [selectedTextBlockId, setSelectedTextBlockId] = useState<string | null>(
    null,
  );
  const [logoutRedirecting, setLogoutRedirecting] = useState(false);
  const [taskDropTargetStickyId, setTaskDropTargetStickyId] = useState<
    string | null
  >(null);
  const [localPreviewEnabled, setLocalPreviewEnabled] = useState(false);
  const activeBlocks = state.blocks.map((block) => ({
    ...block,
    items: block.items.filter((item) => !item.clearedAt),
  }));
  const activeTextBlocks = state.textBlocks.filter((block) => !block.archivedAt);
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
      !activeTextBlocks.some((block) => block.id === selectedTextBlockId)
    ) {
      setSelectedTextBlockId(null);
    }
  }, [activeTextBlocks, selectedTextBlockId]);

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

  const getStickyIdFromDragTarget = (
    target: DragEndEvent["over"] | DragOverEvent["over"],
  ) => {
    if (!target) return null;

    const data = target.data.current as DragData | undefined;
    if (data?.stickyId) return data.stickyId;

    const targetId = String(target.id);
    return state.blocks.some((block) => block.id === targetId)
      ? targetId
      : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data?.type === "task") {
      setTaskDropTargetStickyId(null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data?.type !== "task" || !data.stickyId) return;

    const targetStickyId = getStickyIdFromDragTarget(event.over);
    setTaskDropTargetStickyId(
      targetStickyId && targetStickyId !== data.stickyId
        ? targetStickyId
        : null,
    );
  };

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as DragData | undefined;
    const fromStickyId = activeData?.stickyId;
    const toStickyId = getStickyIdFromDragTarget(over);
    const taskId = String(active.id);

    if (!fromStickyId || !toStickyId || !over) return;

    if (fromStickyId !== toStickyId) {
      moveItem(fromStickyId, toStickyId, taskId);
      return;
    }

    const overData = over.data.current as DragData | undefined;
    if (overData?.type !== "task" || active.id === over.id) return;

    const sticky = state.blocks.find((block) => block.id === fromStickyId);
    const activeTask = sticky?.items.find((item) => item.id === taskId);
    const overTask = sticky?.items.find((item) => item.id === String(over.id));

    if (!sticky || !activeTask || !overTask) return;
    if (activeTask.status !== overTask.status) return;

    const groupedTasks = getGroupedTasks(sticky.items);
    const statusTasks = groupedTasks[activeTask.status];
    const oldIndex = statusTasks.findIndex((item) => item.id === taskId);
    const newIndex = statusTasks.findIndex((item) => item.id === overTask.id);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reorderedStatusTasks = arrayMove(statusTasks, oldIndex, newIndex);
    const newItems = taskStatuses.flatMap((status) =>
      status === activeTask.status ? reorderedStatusTasks : groupedTasks[status],
    );
    reorderItems(fromStickyId, newItems);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as DragData | undefined;

    setTaskDropTargetStickyId(null);

    if (activeData?.type === "task") {
      handleTaskDragEnd(event);
      return;
    }

    if (over && active.id !== over.id) {
      const activeStickyId = activeData?.stickyId ?? String(active.id);
      const targetStickyId = getStickyIdFromDragTarget(over);
      const oldIndex = state.blocks.findIndex((b) => b.id === activeStickyId);
      const newIndex = state.blocks.findIndex((b) => b.id === targetStickyId);

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

    if (!localPreviewEnabled) {
      return (
        <AuthScreen
          onAuthChange={onAuthChange}
          onStartLocalPreview={() => setLocalPreviewEnabled(true)}
        />
      );
    }
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
              key={user?.id ?? "local-preview"}
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
              Notepad
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "history"}
              onClick={() => {
                setActiveView("history");
                void trackProductEvent("view_switched", { view: "history" });
              }}
              className={`border-r border-foreground px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeView === "history"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
            >
              History
            </button>
          </div>

          {activeView !== "history" && (
            <GlobalButtons
              mode={activeView}
              blocks={activeBlocks}
              textBlocks={activeTextBlocks}
              memoCollections={state.memoCollections}
              onAddBlock={addBlock}
              onAddTextBlock={addTextBlock}
              onSelectTextBlock={setSelectedTextBlockId}
              onAddMemoCollection={addMemoCollection}
              onClearArchivedTasks={clearAndArchive}
            />
          )}
        </div>
      </section>

      {/* Main Workspace */}
      <main className="px-4 md:px-8">
        {activeView === "stickies" ? (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setTaskDropTargetStickyId(null)}
            >
              <SortableContext
                items={activeBlocks.map((b) => b.id)}
                strategy={rectSortingStrategy}
              >
                <div className="brand-panel-grid grid grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {activeBlocks.map((block, index) => (
                    <TodoBlockCard
                      key={block.id}
                      block={block}
                      isFirst={index === 0}
                      isLast={index === activeBlocks.length - 1}
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
                      onMoveUp={() => moveBlock(index, "up")}
                      onMoveDown={() => moveBlock(index, "down")}
                      onDeleteBlock={() => deleteBlock(block.id)}
                      onClearTasks={() => clearStickyArchivedTasks(block.id)}
                      isTaskDropTarget={taskDropTargetStickyId === block.id}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {activeBlocks.length === 0 && (
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
        ) : activeView === "memos" ? (
          <TextBlocksPage
            blocks={activeTextBlocks}
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
        ) : (
          <HistoryPage
            state={state}
            onRestoreTask={restoreTaskToTodo}
            onDeleteTasks={deleteTasksPermanently}
            onRestoreMemo={restoreTextBlock}
            onDeleteMemo={deleteTextBlock}
            onOpenRestoredMemo={(memoId) => {
              setActiveView("memos");
              setSelectedTextBlockId(memoId);
            }}
          />
        )}
      </main>

    </div>
  );
}
