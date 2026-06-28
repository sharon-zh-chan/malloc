"use client";

import { useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import type { AppState, TextBlock, TodoBlock, TodoItem } from "@/lib/types";
import { ChevronDown, Eye, Trash2, Undo2, X } from "lucide-react";
import { ConfirmModal } from "./confirm-modal";

type BucketKey = "thisWeek" | "lastWeek" | "thisMonth" | "older";

interface HistoryPageProps {
  state: AppState;
  onRestoreTask: (stickyId: string, taskId: string) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onRestoreMemo: (memoId: string) => void;
  onDeleteMemo: (memoId: string) => void;
  onOpenRestoredMemo: (memoId: string) => void;
}

interface TaskEntry {
  sticky: TodoBlock;
  task: TodoItem;
  parentTask?: TodoItem;
  time: number;
}

interface BucketContent {
  completedTasks: TaskEntry[];
  deletedTasks: TaskEntry[];
  deletedMemos: TextBlock[];
}

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: "thisWeek", label: "This week" },
  { key: "lastWeek", label: "Last week" },
  { key: "thisMonth", label: "Earlier this month" },
  { key: "older", label: "Older" },
];

function emptyBucket(): BucketContent {
  return { completedTasks: [], deletedTasks: [], deletedMemos: [] };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function startOfMondayWeek(now: Date) {
  const start = new Date(startOfDay(now));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start.getTime();
}

function getBucketKey(time: number): BucketKey {
  const now = new Date();
  const thisWeekStart = startOfMondayWeek(now);
  const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  if (time >= thisWeekStart) return "thisWeek";
  if (time >= lastWeekStart && time < thisWeekStart) return "lastWeek";
  if (time >= monthStart && time < lastWeekStart) return "thisMonth";
  return "older";
}

function formatDate(time: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(time));
}

function bucketCount(bucket: BucketContent) {
  return (
    bucket.completedTasks.length +
    bucket.deletedTasks.length +
    bucket.deletedMemos.length
  );
}

function groupBySticky(entries: TaskEntry[]) {
  const groups = new Map<string, { sticky: TodoBlock; entries: TaskEntry[] }>();
  entries.forEach((entry) => {
    const { sticky } = entry;
    const group = groups.get(sticky.id);
    if (group) {
      group.entries.push(entry);
    } else {
      groups.set(sticky.id, { sticky, entries: [entry] });
    }
  });
  return Array.from(groups.values());
}

function memoFolderName(memo: TextBlock, state: AppState) {
  const collection = state.memoCollections.find(
    (candidate) => candidate.id === memo.previousCollectionId,
  );
  return collection?.title ?? "No folder";
}

export function HistoryPage({
  state,
  onRestoreTask,
  onDeleteTasks,
  onRestoreMemo,
  onDeleteMemo,
  onOpenRestoredMemo,
}: HistoryPageProps) {
  const [previewMemo, setPreviewMemo] = useState<TextBlock | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<TaskEntry[] | null>(null);

  const restoreEntries = (entries: TaskEntry[]) => {
    const reopensParent = entries.some(
      (entry) => entry.parentTask && entry.parentTask.status !== "todo",
    );
    if (reopensParent) {
      setPendingRestore(entries);
      return;
    }
    entries.forEach((entry) => onRestoreTask(entry.sticky.id, entry.task.id));
  };

  const buckets = useMemo(() => {
    const next: Record<BucketKey, BucketContent> = {
      thisWeek: emptyBucket(),
      lastWeek: emptyBucket(),
      thisMonth: emptyBucket(),
      older: emptyBucket(),
    };

    state.blocks.forEach((sticky) => {
      sticky.items.forEach((task) => {
        if (task.status !== "completed" && task.status !== "deleted") return;
        const parentTask = task.parentTaskId
          ? sticky.items.find((candidate) => candidate.id === task.parentTaskId)
          : undefined;
        if (task.parentTaskId && task.status !== "deleted") return;
        if (parentTask?.status === "deleted") return;
        const entry = {
          sticky,
          task,
          parentTask,
          time: task.order || task.createdAt,
        };
        const bucket = next[getBucketKey(entry.time)];
        if (task.status === "completed") bucket.completedTasks.push(entry);
        if (task.status === "deleted") bucket.deletedTasks.push(entry);
      });
    });

    state.textBlocks.forEach((memo) => {
      if (!memo.archivedAt) return;
      next[getBucketKey(memo.archivedAt)].deletedMemos.push(memo);
    });

    BUCKETS.forEach(({ key }) => {
      next[key].completedTasks.sort((a, b) => b.time - a.time);
      next[key].deletedTasks.sort((a, b) => b.time - a.time);
      next[key].deletedMemos.sort(
        (a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0),
      );
    });

    return next;
  }, [state]);

  const allTaskIds = BUCKETS.flatMap(({ key }) => [
    ...buckets[key].completedTasks.map((entry) => entry.task.id),
    ...buckets[key].deletedTasks.map((entry) => entry.task.id),
  ]);
  const allMemos = BUCKETS.flatMap(({ key }) => buckets[key].deletedMemos);
  const total = allTaskIds.length + allMemos.length;

  const deleteMemos = (memos: TextBlock[]) => {
    memos.forEach((memo) => onDeleteMemo(memo.id));
  };

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-foreground pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0
              ? "Completed and deleted content will appear here."
              : `${total} recoverable item${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          disabled={total === 0}
          onClick={() =>
            setPendingDelete({
              title: "Delete All History?",
              message:
                "Permanently delete everything in History? This can never be recovered.",
              onConfirm: () => {
                onDeleteTasks(allTaskIds);
                deleteMemos(allMemos);
              },
            })
          }
          className="inline-flex items-center gap-2 border border-foreground bg-card px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          Delete all
        </button>
      </div>

      {BUCKETS.map(({ key, label }, index) => {
        const bucket = buckets[key];
        const count = bucketCount(bucket);
        const bucketTaskIds = [
          ...bucket.completedTasks.map((entry) => entry.task.id),
          ...bucket.deletedTasks.map((entry) => entry.task.id),
        ];

        return (
          <details
            key={key}
            open={index === 0 || count > 0}
            className="border border-foreground bg-card"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
                <span className="truncate text-base font-bold text-foreground">
                  {label}
                </span>
                <span className="text-sm text-muted-foreground">({count})</span>
              </div>
              <button
                type="button"
                disabled={count === 0}
                onClick={(event) => {
                  event.preventDefault();
                  setPendingDelete({
                    title: `Delete ${label}?`,
                    message:
                      "Permanently delete everything in this block? This can never be recovered.",
                    onConfirm: () => {
                      onDeleteTasks(bucketTaskIds);
                      deleteMemos(bucket.deletedMemos);
                    },
                  });
                }}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`Delete ${label} permanently`}
                title={`Delete ${label} permanently`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </summary>

            <div className="flex flex-col gap-3 border-t border-foreground p-4">
              <TaskSection
                title="Completed tasks"
                entries={bucket.completedTasks}
                onRestoreEntries={restoreEntries}
                onDeleteTasks={onDeleteTasks}
                onRequestDelete={setPendingDelete}
              />
              <TaskSection
                title="Deleted tasks"
                entries={bucket.deletedTasks}
                onRestoreEntries={restoreEntries}
                onDeleteTasks={onDeleteTasks}
                onRequestDelete={setPendingDelete}
              />
              <details
                open={bucket.deletedMemos.length > 0}
                className="rounded-md border border-border"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate text-sm font-bold text-foreground">
                      Deleted notes
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({bucket.deletedMemos.length})
                    </span>
                  </div>
                </summary>
                <div className="flex flex-col gap-1 border-t border-border p-3">
                  {bucket.deletedMemos.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      Nothing here.
                    </p>
                  ) : (
                    bucket.deletedMemos.map((memo) => (
                      <div
                        key={memo.id}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-2 hover:bg-background/60"
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewMemo(memo)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-sm font-medium text-foreground">
                            {memo.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {memoFolderName(memo, state)} ·{" "}
                            {formatDate(memo.archivedAt ?? memo.updatedAt)}
                          </span>
                        </button>
                        <HistoryIconButton
                          label={`View ${memo.title}`}
                          onClick={() => setPreviewMemo(memo)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </HistoryIconButton>
                        <HistoryIconButton
                          label={`Recover ${memo.title}`}
                          onClick={() => {
                            onRestoreMemo(memo.id);
                            onOpenRestoredMemo(memo.id);
                          }}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </HistoryIconButton>
                        <HistoryIconButton
                          label={`Delete ${memo.title} permanently`}
                          destructive
                          onClick={() =>
                            setPendingDelete({
                              title: "Delete Note Permanently?",
                              message:
                                "Permanently delete this note? This can never be recovered.",
                              onConfirm: () => onDeleteMemo(memo.id),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </HistoryIconButton>
                      </div>
                    ))
                  )}
                </div>
              </details>
            </div>
          </details>
        );
      })}

      {previewMemo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={previewMemo.title}
          onClick={() => setPreviewMemo(null)}
        >
          <section
            className="sketchy-card flex max-h-[80vh] w-full max-w-2xl flex-col p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold text-foreground">
                  {previewMemo.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {memoFolderName(previewMemo, state)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMemo(null)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                aria-label="Close note preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              className="rich-text-editor mt-4 overflow-auto rounded-md bg-background/35 px-4 py-3 text-base leading-7 text-foreground"
              dangerouslySetInnerHTML={{ __html: previewMemo.content }}
            />
          </section>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingRestore)}
        title="Reopen parent task?"
        message={
          pendingRestore
            ? `Restoring ${pendingRestore.length === 1 ? `“${pendingRestore[0].task.text}”` : "these subtasks"} will also reopen ${
                pendingRestore.length === 1 && pendingRestore[0].parentTask
                  ? `“${pendingRestore[0].parentTask.text}”`
                  : "their completed parent tasks"
              }.`
            : ""
        }
        confirmLabel="Reopen and restore"
        onConfirm={() => {
          pendingRestore?.forEach((entry) =>
            onRestoreTask(entry.sticky.id, entry.task.id),
          );
          setPendingRestore(null);
        }}
        onCancel={() => setPendingRestore(null)}
      />
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title={pendingDelete?.title ?? ""}
        message={pendingDelete?.message ?? ""}
        confirmLabel="Delete permanently"
        onConfirm={() => {
          pendingDelete?.onConfirm();
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

function TaskSection({
  title,
  entries,
  onRestoreEntries,
  onDeleteTasks,
  onRequestDelete,
}: {
  title: string;
  entries: TaskEntry[];
  onRestoreEntries: (entries: TaskEntry[]) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onRequestDelete: (request: {
    title: string;
    message: string;
    onConfirm: () => void;
  }) => void;
}) {
  const groups = groupBySticky(entries);
  const taskIds = entries.map((entry) => entry.task.id);

  return (
    <details open={entries.length > 0} className="rounded-md border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
          <span className="truncate text-sm font-bold text-foreground">
            {title}
          </span>
          <span className="text-xs text-muted-foreground">({entries.length})</span>
        </div>
        <HistoryIconButton
          label={`Delete ${title} permanently`}
          destructive
          disabled={entries.length === 0}
          onClick={(event) => {
            event.preventDefault();
            onRequestDelete({
              title: `Delete ${title}?`,
              message:
                "Permanently delete these tasks? This can never be recovered.",
              onConfirm: () => onDeleteTasks(taskIds),
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </HistoryIconButton>
      </summary>
      <div className="border-t border-border p-3">
        {groups.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => (
              <div
                key={group.sticky.id}
                className="min-w-0 rounded-md border border-border bg-background/35 p-3"
              >
                <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-foreground">
                      {group.sticky.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {group.entries.length} task
                      {group.entries.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    <HistoryIconButton
                      compact
                      label={`Recover ${group.sticky.title}`}
                      onClick={() => onRestoreEntries(group.entries)}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </HistoryIconButton>
                    <HistoryIconButton
                      compact
                      label={`Delete ${group.sticky.title} permanently`}
                      destructive
                      onClick={() =>
                        onRequestDelete({
                          title: "Delete Sticky Tasks Permanently?",
                          message:
                            "Permanently delete these tasks? This can never be recovered.",
                          onConfirm: () =>
                            onDeleteTasks(
                              group.entries.map((entry) => entry.task.id),
                            ),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </HistoryIconButton>
                  </div>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {group.entries.map((entry) => {
                    const { task, parentTask } = entry;
                    const nestedSubtasks = group.sticky.items
                      .filter((candidate) => {
                        if (candidate.parentTaskId !== task.id) return false;
                        return task.status === "deleted"
                          ? true
                          : candidate.status === "completed";
                      })
                      .sort((a, b) => a.order - b.order);
                    return (
                    <div
                      key={task.id}
                      className="rounded-md px-2 py-1.5 hover:bg-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`truncate text-sm ${task.status === "deleted" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {task.text}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {parentTask ? `Subtask of “${parentTask.text}” · ` : ""}
                            {formatDate(task.order || task.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 gap-0.5">
                          <HistoryIconButton
                            compact
                            label={`Recover ${task.text}`}
                            onClick={() => onRestoreEntries([entry])}
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </HistoryIconButton>
                          <HistoryIconButton
                            compact
                            label={`Delete ${task.text} permanently`}
                            destructive
                            onClick={() =>
                              onRequestDelete({
                                title: "Delete Task Permanently?",
                                message:
                                  "Permanently delete this task? This can never be recovered.",
                                onConfirm: () => onDeleteTasks([task.id]),
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </HistoryIconButton>
                        </div>
                      </div>
                      {nestedSubtasks.length > 0 && (
                        <div className="mt-1 border-l border-border pl-3">
                          {nestedSubtasks.map((subtask) => (
                            <p
                              key={subtask.id}
                              className={`truncate py-0.5 text-xs ${
                                subtask.status === "completed"
                                  ? "line-through text-muted-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {subtask.text}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function HistoryIconButton({
  label,
  disabled,
  destructive = false,
  compact = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  compact?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex ${
        compact ? "h-7 w-7" : "h-8 w-8"
      } items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        destructive
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
