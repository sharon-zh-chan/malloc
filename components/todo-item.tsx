"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TodoItem as TodoItemType } from "@/lib/types";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  GripVertical,
  ListPlus,
  Minus,
  Undo2,
} from "lucide-react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TodoItemProps {
  item: TodoItemType;
  subtasks: TodoItemType[];
  stickyId: string;
  onToggle: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onUpdateText: (text: string) => void;
  onAddSubtask: (text: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onUpdateSubtaskText: (subtaskId: string, text: string) => void;
  onSetExpanded: (expanded: boolean) => void;
}

function EditableTaskText({
  item,
  readOnly = false,
  onUpdateText,
}: {
  item: TodoItemType;
  readOnly?: boolean;
  onUpdateText: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setEditText(item.text), [item.text]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = () => {
    const trimmed = editText.trim();
    if (trimmed) onUpdateText(trimmed);
    else setEditText(item.text);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editText}
        onChange={(event) => setEditText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            setEditText(item.text);
            setEditing(false);
          }
        }}
        className="min-w-0 flex-1 rounded bg-background/50 px-2 py-0.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
        aria-label={`Edit ${item.text}`}
      />
    );
  }

  return (
    <span
      onClick={() => {
        if (!readOnly && item.status === "todo") setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !readOnly && item.status === "todo") {
          setEditing(true);
        }
      }}
      className={`min-w-0 flex-1 select-none text-sm ${
        item.status === "completed" || item.status === "deleted"
          ? "line-through text-muted-foreground"
          : "text-foreground"
      } ${!readOnly && item.status === "todo" ? "cursor-text" : ""}`}
      role={!readOnly && item.status === "todo" ? "button" : undefined}
      tabIndex={!readOnly && item.status === "todo" ? 0 : undefined}
      aria-label={!readOnly && item.status === "todo" ? `Edit ${item.text}` : undefined}
    >
      {item.text}
    </span>
  );
}

function SubtaskRow({
  item,
  stickyId,
  parentTaskId,
  readOnly,
  onToggle,
  onDelete,
  onUpdateText,
}: {
  item: TodoItemType;
  stickyId: string;
  parentTaskId: string;
  readOnly: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdateText: (text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      disabled: readOnly,
      data: { type: "subtask", stickyId, parentTaskId },
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="group/subtask relative flex min-w-0 items-center gap-2 rounded-md py-1 pr-1 transition-colors hover:bg-card/80"
    >
      <button
        {...attributes}
        {...listeners}
        disabled={readOnly}
        className="absolute -left-6 top-1/2 flex-shrink-0 -translate-y-1/2 cursor-grab touch-none p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/subtask:opacity-100 focus:opacity-100 disabled:pointer-events-none disabled:opacity-0"
        aria-label={`Reorder subtask ${item.text}`}
        title="Reorder within this task"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        disabled={readOnly}
        className="flex-shrink-0 text-primary transition-colors hover:text-primary/80 disabled:cursor-default"
        aria-label={
          item.status === "completed"
            ? `Mark subtask ${item.text} as todo`
            : `Complete subtask ${item.text}`
        }
      >
        {item.status === "completed" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>
      <EditableTaskText item={item} readOnly={readOnly} onUpdateText={onUpdateText} />
      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          className="flex-shrink-0 p-0.5 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover/subtask:opacity-100 focus:opacity-100"
          aria-label={`Delete subtask ${item.text}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function DeletedSubtaskRow({
  item,
  parentText,
  onUndo,
}: {
  item: TodoItemType;
  parentText: string;
  onUndo: () => void;
}) {
  return (
    <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 opacity-60">
      <div className="w-5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground line-through">{item.text}</p>
        <p className="truncate text-xs text-muted-foreground">
          Subtask of “{parentText}”
        </p>
      </div>
      <button
        type="button"
        onClick={onUndo}
        className="flex-shrink-0 rounded-full p-1 text-primary transition-colors hover:bg-primary/10"
        aria-label={`Restore subtask ${item.text}`}
        title="Restore subtask"
      >
        <Undo2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function TodoItemRow({
  item,
  subtasks,
  stickyId,
  onToggle,
  onDelete,
  onUndo,
  onUpdateText,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onUpdateSubtaskText,
  onSetExpanded,
}: TodoItemProps) {
  const [showAddInput, setShowAddInput] = useState(false);
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [completionMessage, setCompletionMessage] = useState("");
  const newSubtaskRef = useRef<HTMLInputElement>(null);
  const isReadOnly = item.status !== "todo";
  const visibleSubtasks = useMemo(
    () =>
      subtasks
        .filter((subtask) => !subtask.clearedAt && subtask.status !== "deleted")
        .sort((a, b) => a.order - b.order),
    [subtasks],
  );
  const nestedDeletedSubtasks = useMemo(
    () =>
      subtasks
        .filter((subtask) => !subtask.clearedAt)
        .sort((a, b) => a.order - b.order),
    [subtasks],
  );
  const displaySubtasks = item.status === "deleted" ? nestedDeletedSubtasks : visibleSubtasks;
  const completedCount = visibleSubtasks.filter(
    (subtask) => subtask.status === "completed",
  ).length;
  const pendingCount = visibleSubtasks.length - completedCount;
  const hasSubtasks = displaySubtasks.length > 0;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      data: { type: "task", stickyId, status: item.status },
    });

  useEffect(() => {
    if (showAddInput) newSubtaskRef.current?.focus();
  }, [showAddInput]);

  useEffect(() => {
    if (pendingCount === 0) setCompletionMessage("");
  }, [pendingCount]);

  const submitSubtask = () => {
    const trimmed = newSubtaskText.trim();
    if (!trimmed) return;
    onAddSubtask(trimmed);
    setNewSubtaskText("");
  };

  const toggleParent = () => {
    if (item.status === "todo" && pendingCount > 0) {
      setCompletionMessage(
        `Complete or delete ${pendingCount} remaining subtask${pendingCount === 1 ? "" : "s"} first.`,
      );
      return;
    }
    setCompletionMessage("");
    onToggle();
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="min-w-0"
    >
      <div
        className={`group relative flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-card/80 ${
          item.status === "deleted" ? "opacity-55" : ""
        }`}
      >
        <button
          {...attributes}
          {...listeners}
          className="absolute -left-4 top-1/2 flex-shrink-0 -translate-y-1/2 cursor-grab touch-none p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 active:cursor-grabbing"
          aria-label={`Drag ${item.text}`}
          title="Drag to move task"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {item.status === "deleted" ? (
          <span className="flex-shrink-0 p-0.5 text-muted-foreground">
            <Circle className="h-5 w-5" />
          </span>
        ) : (
          <button
            type="button"
            onClick={toggleParent}
            className="flex-shrink-0 p-0.5 text-primary transition-colors hover:text-primary/80"
            aria-label={
              item.status === "completed"
                ? `Reopen ${item.text}`
                : `Complete ${item.text}`
            }
          >
            {item.status === "completed" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Circle className="h-5 w-5" />
            )}
          </button>
        )}

        <EditableTaskText item={item} readOnly={isReadOnly} onUpdateText={onUpdateText} />

        {visibleSubtasks.length > 0 && (
          <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
            {completedCount}/{visibleSubtasks.length}
          </span>
        )}

        {hasSubtasks && (
          <button
            type="button"
            onClick={() => onSetExpanded(!item.subtasksExpanded)}
            className="flex-shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            aria-label={`${item.subtasksExpanded ? "Collapse" : "Expand"} subtasks for ${item.text}`}
          >
            {item.subtasksExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}

        {item.status === "todo" && (
          <button
            type="button"
            onClick={() => {
              setShowAddInput(true);
              onSetExpanded(true);
            }}
            className="flex-shrink-0 p-0.5 text-muted-foreground opacity-60 transition-all hover:text-primary focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            aria-label={`Add subtask to ${item.text}`}
            title="Add subtask"
          >
            <ListPlus className="h-4 w-4" />
          </button>
        )}

        {item.status === "deleted" ? (
          <button
            type="button"
            onClick={onUndo}
            className="flex-shrink-0 rounded-full p-1 text-primary transition-colors hover:bg-primary/10"
            aria-label={`Restore ${item.text}`}
            title="Restore"
          >
            <Undo2 className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            className="flex-shrink-0 p-0.5 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100 focus:opacity-100"
            aria-label={`Delete ${item.text}`}
          >
            <Minus className="h-4 w-4" />
          </button>
        )}
      </div>

      {completionMessage && (
        <p className="ml-10 pr-2 text-xs text-destructive" role="status">
          {completionMessage}
        </p>
      )}

      {item.subtasksExpanded && (hasSubtasks || showAddInput) && (
        <div className="ml-10">
          <SortableContext
            items={displaySubtasks.map((subtask) => subtask.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-0.5">
              {displaySubtasks.map((subtask) => (
                <SubtaskRow
                  key={subtask.id}
                  item={subtask}
                  stickyId={stickyId}
                  parentTaskId={item.id}
                  readOnly={isReadOnly}
                  onToggle={() => onToggleSubtask(subtask.id)}
                  onDelete={() => onDeleteSubtask(subtask.id)}
                  onUpdateText={(text) => onUpdateSubtaskText(subtask.id, text)}
                />
              ))}
            </div>
          </SortableContext>

          {showAddInput && item.status === "todo" && (
            <div className="flex items-center gap-2 py-1 pr-1">
              <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
              <input
                ref={newSubtaskRef}
                value={newSubtaskText}
                onChange={(event) => setNewSubtaskText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSubtask();
                  if (event.key === "Escape") {
                    setNewSubtaskText("");
                    setShowAddInput(false);
                  }
                }}
                onBlur={() => {
                  if (!newSubtaskText.trim()) setShowAddInput(false);
                }}
                placeholder="Add a subtask…"
                className="min-w-0 flex-1 rounded bg-background/50 px-2 py-1 text-sm text-foreground outline-none ring-primary/30 placeholder:text-muted-foreground focus:ring-2"
                aria-label={`New subtask for ${item.text}`}
              />
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={submitSubtask}
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
