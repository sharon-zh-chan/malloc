"use client";

import React from "react"

import { useState, useRef, useEffect } from "react";
import type { TodoItem as TodoItemType } from "@/lib/types";
import { Circle, CheckCircle2, Minus, Undo2, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TodoItemProps {
  item: TodoItemType;
  stickyId: string;
  onToggle: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onUpdateText: (text: string) => void;
}

export function TodoItemRow({
  item,
  stickyId,
  onToggle,
  onDelete,
  onUndo,
  onUpdateText,
}: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { type: "task", stickyId, status: item.status },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = editText.trim();
    if (trimmed) {
      onUpdateText(trimmed);
    } else {
      setEditText(item.text);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditText(item.text);
      setEditing(false);
    }
  };

  if (item.status === "deleted") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-2 py-1.5 px-2 rounded-md group opacity-50"
      >
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Drag to move task"
          title="Drag to move task"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="line-through text-sm text-muted-foreground flex-1">
          {item.text}
        </span>
        <button
          onClick={onUndo}
          className="flex-shrink-0 p-1 rounded-full text-primary hover:bg-primary/10 transition-colors"
          aria-label={`Undo delete ${item.text}`}
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-1.5 px-2 rounded-md group hover:bg-card/80 transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag to move task"
        title="Drag to move task"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        onClick={onToggle}
        className="flex-shrink-0 p-0.5 text-primary hover:text-primary/80 transition-colors"
        aria-label={
          item.status === "completed"
            ? `Mark ${item.text} as todo`
            : `Mark ${item.text} as completed`
        }
      >
        {item.status === "completed" ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-background/50 text-sm text-foreground px-2 py-0.5 rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30"
        />
      ) : (
        <span
          onClick={() => {
            if (item.status !== "completed") {
              setEditing(true);
            }
          }}
          className={`flex-1 text-sm cursor-text select-none ${
            item.status === "completed"
              ? "line-through text-muted-foreground"
              : "text-foreground"
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" && item.status !== "completed") {
              setEditing(true);
            }
          }}
          aria-label={`Edit ${item.text}`}
        >
          {item.text}
        </span>
      )}

      {item.status !== "completed" && (
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
          aria-label={`Delete ${item.text}`}
        >
          <Minus className="h-4 w-4" />
        </button>
      )}
      {item.status === "completed" && (
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
          aria-label={`Delete ${item.text}`}
        >
          <Minus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
