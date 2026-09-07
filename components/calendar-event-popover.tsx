"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Edit3, Plus, Trash2, X } from "lucide-react";
import type { CalendarEvent, CalendarRecurrenceFrequency } from "@/lib/types";

export type EventDraft = Omit<
  CalendarEvent,
  "id" | "createdAt" | "updatedAt" | "order"
>;

const RECURRENCE_OPTIONS: Array<{
  value: CalendarRecurrenceFrequency;
  label: string;
}> = [
  { value: "none", label: "One off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export function createDefaultEventDraft(date: string): EventDraft {
  return {
    title: "",
    date,
    endDate: null,
    startTime: null,
    endTime: null,
    categoryId: null,
    recurrence: {
      frequency: "none",
      interval: 1,
      untilDate: null,
    },
    description: "",
    location: null,
    deletedOccurrenceDates: [],
    source: { type: "manual" },
  };
}

function draftFromEvent(event: CalendarEvent): EventDraft {
  return {
    title: event.title,
    date: event.date,
    endDate: event.endDate ?? null,
    startTime: event.startTime,
    endTime: event.endTime,
    categoryId: event.categoryId,
    recurrence: event.recurrence,
    description: event.description,
    location: event.location,
    deletedOccurrenceDates: event.deletedOccurrenceDates,
    source: event.source ?? { type: "manual" },
  };
}

type CalendarEventPopoverProps = {
  open: boolean;
  date: string;
  event: CalendarEvent | null;
  position?: { left: number; top: number } | null;
  onClose: () => void;
  onAddEvent: (event: EventDraft) => string | null;
  onUpdateEvent: (event: CalendarEvent) => void;
  onRequestDelete?: (event: CalendarEvent, date: string) => void;
};

export function CalendarEventPopover({
  open,
  date,
  event,
  position = null,
  onClose,
  onAddEvent,
  onUpdateEvent,
  onRequestDelete,
}: CalendarEventPopoverProps) {
  const [draft, setDraft] = useState<EventDraft>(() =>
    createDefaultEventDraft(date),
  );
  const startDateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const startTimeInputRef = useRef<HTMLInputElement>(null);
  const endTimeInputRef = useRef<HTMLInputElement>(null);
  const untilDateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(event ? draftFromEvent(event) : createDefaultEventDraft(date));
  }, [date, event, open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  if (!open) return null;

  const isEditing = Boolean(event);

  const submitEvent = () => {
    const startDate = startDateInputRef.current?.value || draft.date;
    const rawEndDate = endDateInputRef.current?.value || null;
    const rawStartTime = startTimeInputRef.current?.value || null;
    const rawEndTime = endTimeInputRef.current?.value || null;
    const rawUntilDate = untilDateInputRef.current?.value || null;

    if (!draft.title.trim() || !startDate) return;
    const normalizedDraft = {
      ...draft,
      date: startDate,
      endDate: rawEndDate && rawEndDate > startDate ? rawEndDate : null,
      startTime: rawStartTime,
      endTime: rawEndTime,
      recurrence: {
        ...draft.recurrence,
        untilDate:
          draft.recurrence.frequency === "none" ? null : rawUntilDate,
      },
    };

    if (event) {
      onUpdateEvent({
        ...event,
        ...normalizedDraft,
        deletedOccurrenceDates: normalizedDraft.deletedOccurrenceDates,
      });
    } else {
      const eventId = onAddEvent(normalizedDraft);
      if (!eventId) return;
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-transparent"
      role="presentation"
      onClick={onClose}
    >
      <section
        className={`sketchy-card pointer-events-auto fixed w-[min(92vw,460px)] overflow-auto p-4 shadow-[0_18px_50px_hsl(var(--foreground)/0.22)] ${
          position ? "" : "left-1/2 top-4 max-h-[calc(100vh-2rem)] -translate-x-1/2"
        }`}
        style={
          position
            ? {
                left: position.left,
                top: position.top,
                maxHeight: `calc(100vh - ${position.top + 16}px)`,
              }
            : undefined
        }
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? "Edit calendar event" : "Add calendar event"}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <Edit3 className="h-4 w-4 text-primary" />
            ) : (
              <CalendarPlus className="h-4 w-4 text-primary" />
            )}
            <h2 className="text-sm font-bold">
              {isEditing ? "Edit Event" : "Add Event"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-foreground"
            aria-label="Close event"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="brand-label">Title</span>
            <input
              value={draft.title}
              autoFocus
              onChange={(inputEvent) =>
                setDraft((current) => ({
                  ...current,
                  title: inputEvent.target.value,
                }))
              }
              className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="brand-label">Starts date</span>
              <input
                ref={startDateInputRef}
                type="date"
                value={draft.date}
                onChange={(inputEvent) =>
                  setDraft((current) => ({
                    ...current,
                    date: inputEvent.target.value,
                    endDate:
                      current.endDate &&
                      current.endDate < inputEvent.target.value
                        ? inputEvent.target.value
                        : current.endDate,
                  }))
                }
                className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </label>
            <label className="block">
              <span className="brand-label">Ends date</span>
              <input
                ref={endDateInputRef}
                type="date"
                value={draft.endDate ?? ""}
                min={draft.date}
                onChange={(inputEvent) =>
                  setDraft((current) => ({
                    ...current,
                    endDate: inputEvent.target.value || null,
                  }))
                }
                className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="brand-label">Start time</span>
              <input
                ref={startTimeInputRef}
                type="time"
                value={draft.startTime ?? ""}
                onChange={(inputEvent) =>
                  setDraft((current) => ({
                    ...current,
                    startTime: inputEvent.target.value || null,
                  }))
                }
                className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </label>
            <label className="block">
              <span className="brand-label">End time</span>
              <input
                ref={endTimeInputRef}
                type="time"
                value={draft.endTime ?? ""}
                onChange={(inputEvent) =>
                  setDraft((current) => ({
                    ...current,
                    endTime: inputEvent.target.value || null,
                  }))
                }
                className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </label>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
            <label className="block">
              <span className="brand-label">Repeats</span>
              <select
                value={draft.recurrence.frequency}
                onChange={(inputEvent) =>
                  setDraft((current) => ({
                    ...current,
                    recurrence: {
                      ...current.recurrence,
                      frequency: inputEvent.target
                        .value as CalendarRecurrenceFrequency,
                    },
                  }))
                }
                className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              >
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="brand-label">Every</span>
              <input
                type="number"
                min={1}
                value={draft.recurrence.interval}
                disabled={draft.recurrence.frequency === "none"}
                onChange={(inputEvent) =>
                  setDraft((current) => ({
                    ...current,
                    recurrence: {
                      ...current.recurrence,
                      interval: Math.max(1, Number(inputEvent.target.value) || 1),
                    },
                  }))
                }
                className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground disabled:opacity-40"
              />
            </label>
          </div>
          <label className="block">
            <span className="brand-label">Until</span>
            <input
              ref={untilDateInputRef}
              type="date"
              value={draft.recurrence.untilDate ?? ""}
              disabled={draft.recurrence.frequency === "none"}
              onChange={(inputEvent) =>
                setDraft((current) => ({
                  ...current,
                  recurrence: {
                    ...current.recurrence,
                    untilDate: inputEvent.target.value || null,
                  },
                }))
              }
              className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground disabled:opacity-40"
            />
          </label>
          <label className="block">
            <span className="brand-label">Location</span>
            <input
              value={draft.location ?? ""}
              onChange={(inputEvent) =>
                setDraft((current) => ({
                  ...current,
                  location: inputEvent.target.value || null,
                }))
              }
              className="mt-1 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </label>
          <label className="block">
            <span className="brand-label">Description</span>
            <textarea
              value={draft.description}
              onChange={(inputEvent) =>
                setDraft((current) => ({
                  ...current,
                  description: inputEvent.target.value,
                }))
              }
              rows={3}
              className="mt-1 w-full resize-none border border-input bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </label>
          <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
            {event && onRequestDelete && (
              <button
                type="button"
                onClick={() => onRequestDelete(event, date)}
                className="flex h-9 items-center gap-2 px-3 text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={submitEvent}
              className="ml-auto flex h-9 items-center gap-2 bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {isEditing ? (
                <Edit3 className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isEditing ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
