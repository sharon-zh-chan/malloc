"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { TodoBlock as TodoBlockType, TodoItem } from "@/lib/types";
import { TodoItemRow } from "./todo-item";
import { Plus, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface TodoBlockProps {
  block: TodoBlockType;
  isFirst: boolean;
  isLast: boolean;
  onUpdateTitle: (title: string) => void;
  onAddItem: (text: string) => void;
  onToggleItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onUndoItem: (itemId: string) => void;
  onUpdateItemText: (itemId: string, text: string) => void;
  onReorderItems: (newItems: TodoItem[]) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function TodoBlockCard({
  block,
  isFirst,
  isLast,
  onUpdateTitle,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onUndoItem,
  onUpdateItemText,
  onReorderItems,
  onMoveUp,
  onMoveDown,
}: TodoBlockProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(block.title);
  const [newItemText, setNewItemText] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const newItemRef = useRef<HTMLInputElement>(null);

  // Sensors for item drag-and-drop (within this block only)
  const itemSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (showAddInput && newItemRef.current) {
      newItemRef.current.focus();
    }
  }, [showAddInput]);

  const handleTitleSave = () => {
    const trimmed = titleText.trim();
    if (trimmed) {
      onUpdateTitle(trimmed);
    } else {
      setTitleText(block.title);
    }
    setEditingTitle(false);
  };

  const handleAddItem = () => {
    const trimmed = newItemText.trim();
    if (trimmed) {
      onAddItem(trimmed);
      setNewItemText("");
    }
  };

  const groupedItems = useMemo(() => {
    const todo = block.items
      .filter((i) => i.status === "todo")
      .sort((a, b) => a.order - b.order);
    const completed = block.items
      .filter((i) => i.status === "completed")
      .sort((a, b) => a.order - b.order);
    const deleted = block.items
      .filter((i) => i.status === "deleted")
      .sort((a, b) => a.order - b.order);
    return { todo, completed, deleted };
  }, [block.items]);

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const todoItems = groupedItems.todo;
      const oldIndex = todoItems.findIndex((item) => item.id === active.id);
      const newIndex = todoItems.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedTodo = arrayMove(todoItems, oldIndex, newIndex);
        // Combine reordered todo items with completed and deleted items
        const newItems = [
          ...reorderedTodo,
          ...groupedItems.completed,
          ...groupedItems.deleted,
        ];
        onReorderItems(newItems);
      }
    }
  };

  const hasCompleted = groupedItems.completed.length > 0;
  const hasDeleted = groupedItems.deleted.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="sketchy-card p-4"
    >
      {/* Block Header */}
      <div className="flex items-center gap-2 mb-3">
        {/* Drag Handle - visible on desktop, hidden on mobile */}
        <button
          {...attributes}
          {...listeners}
          className="hidden sm:flex flex-shrink-0 p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder block"
        >
          <GripVertical className="h-5 w-5" />
        </button>

        {/* Arrow buttons - visible on mobile, hidden on desktop */}
        <div className="flex flex-col flex-shrink-0 sm:hidden">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
            aria-label="Move block up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
            aria-label="Move block down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleText}
            onChange={(e) => setTitleText(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleSave();
              if (e.key === "Escape") {
                setTitleText(block.title);
                setEditingTitle(false);
              }
            }}
            className="flex-1 bg-background/50 text-base font-bold text-foreground px-2 py-1 rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <h3
            onClick={() => setEditingTitle(true)}
            className="flex-1 text-base font-bold text-foreground cursor-text select-none truncate"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") setEditingTitle(true);
            }}
            aria-label={`Edit title: ${block.title}`}
          >
            {block.title}
          </h3>
        )}

        <button
          onClick={() => setShowAddInput(!showAddInput)}
          className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
          aria-label="Add item to this block"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Add item input */}
      {showAddInput && (
        <div className="flex items-center gap-2 mb-3">
          <input
            ref={newItemRef}
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddItem();
              if (e.key === "Escape") {
                setNewItemText("");
                setShowAddInput(false);
              }
            }}
            placeholder="New task..."
            className="flex-1 bg-background/50 text-sm text-foreground px-3 py-1.5 rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
          />
          <button
            onClick={handleAddItem}
            className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            style={{ borderRadius: "8px 6px 10px 6px" }}
          >
            Add
          </button>
        </div>
      )}

      {/* Items list */}
      <div className="flex flex-col gap-0.5">
        {/* Todo items - draggable */}
        <DndContext
          sensors={itemSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleItemDragEnd}
        >
          <SortableContext
            items={groupedItems.todo.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {groupedItems.todo.map((item) => (
              <TodoItemRow
                key={item.id}
                item={item}
                onToggle={() => onToggleItem(item.id)}
                onDelete={() => onDeleteItem(item.id)}
                onUndo={() => onUndoItem(item.id)}
                onUpdateText={(text) => onUpdateItemText(item.id, text)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Gap between todo and completed */}
        {hasCompleted && groupedItems.todo.length > 0 && (
          <div className="h-3" aria-hidden="true" />
        )}

        {/* Completed items */}
        {hasCompleted && (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 pb-1">
              Completed
            </p>
            {groupedItems.completed.map((item) => (
              <TodoItemRow
                key={item.id}
                item={item}
                onToggle={() => onToggleItem(item.id)}
                onDelete={() => onDeleteItem(item.id)}
                onUndo={() => onUndoItem(item.id)}
                onUpdateText={(text) => onUpdateItemText(item.id, text)}
              />
            ))}
          </div>
        )}

        {/* Gap between completed and deleted */}
        {hasDeleted && (hasCompleted || groupedItems.todo.length > 0) && (
          <div className="h-3" aria-hidden="true" />
        )}

        {/* Deleted items */}
        {hasDeleted && (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 pb-1">
              Deleted
            </p>
            {groupedItems.deleted.map((item) => (
              <TodoItemRow
                key={item.id}
                item={item}
                onToggle={() => onToggleItem(item.id)}
                onDelete={() => onDeleteItem(item.id)}
                onUndo={() => onUndoItem(item.id)}
                onUpdateText={(text) => onUpdateItemText(item.id, text)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {block.items.length === 0 && !showAddInput && (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            No tasks yet. Click + to add one.
          </p>
        )}
      </div>
    </div>
  );
}
