"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import type { CalendarEvent } from "@/lib/types";
import {
  CalendarEventPopover,
  type EventDraft,
} from "./calendar-event-popover";

const MALLOC_BLUE = "#0057d9";
const RECURRING_GREY = "#8a8f98";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type CalendarView = "month" | "week" | "list";
type DateScope = "key" | "all";

type CalendarPageProps = {
  events: CalendarEvent[];
  onAddEvent: (event: EventDraft) => string | null;
  onUpdateEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onDeleteOccurrence: (eventId: string, date: string) => void;
  onDeleteFutureOccurrences: (eventId: string, fromDate: string) => void;
};

type CalendarOccurrence = {
  id: string;
  date: string;
  event: CalendarEvent;
  isRecurringFollowUp: boolean;
};

type PendingDelete = {
  event: CalendarEvent;
  date: string;
} | null;

type EventComposerState = {
  date: string;
  eventId: string | null;
  position: { left: number; top: number } | null;
} | null;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateId(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function parseDateId(dateId: string) {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonthsClamped(date: Date, months: number) {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function dayLabel(dateId: string) {
  return parseDateId(dateId).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function longDayLabel(dateId: string) {
  return parseDateId(dateId).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatEventTime(event: CalendarEvent) {
  if (!event.startTime && !event.endTime) return "Any time";
  if (event.startTime && event.endTime) return `${event.startTime}-${event.endTime}`;
  return event.startTime ?? event.endTime ?? "Any time";
}

function compareDateIds(a: string, b: string) {
  return a.localeCompare(b);
}

function daysBetween(a: Date, b: Date) {
  const start = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const end = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / 86_400_000);
}

function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
}

function occursOn(event: CalendarEvent, dateId: string) {
  if (event.deletedOccurrenceDates.includes(dateId)) return false;
  if (event.recurrence.untilDate && compareDateIds(dateId, event.recurrence.untilDate) > 0) {
    return false;
  }
  if (compareDateIds(dateId, event.date) < 0) return false;

  const eventDate = parseDateId(event.date);
  const candidate = parseDateId(dateId);
  const interval = Math.max(1, event.recurrence.interval);

  switch (event.recurrence.frequency) {
    case "none":
      return event.date === dateId;
    case "daily":
      return daysBetween(eventDate, candidate) % interval === 0;
    case "weekly":
      return daysBetween(eventDate, candidate) % (7 * interval) === 0;
    case "monthly": {
      const diff = monthsBetween(eventDate, candidate);
      return diff % interval === 0 && candidate.getDate() === eventDate.getDate();
    }
    case "yearly":
      return (
        (candidate.getFullYear() - eventDate.getFullYear()) % interval === 0 &&
        candidate.getMonth() === eventDate.getMonth() &&
        candidate.getDate() === eventDate.getDate()
      );
  }
}

function getOccurrences(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
  scope: DateScope,
) {
  const occurrences: CalendarOccurrence[] = [];
  for (
    let cursor = new Date(rangeStart);
    cursor <= rangeEnd;
    cursor = addDays(cursor, 1)
  ) {
    const date = formatDateId(cursor);
    for (const event of events) {
      if (occursOn(event, date)) {
        const isRecurringFollowUp =
          event.recurrence.frequency !== "none" && date !== event.date;
        if (scope === "key" && isRecurringFollowUp) continue;
        occurrences.push({
          id: `${event.id}:${date}`,
          date,
          event,
          isRecurringFollowUp,
        });
      }
    }
  }

  return occurrences.sort((a, b) => {
    const dateSort = a.date.localeCompare(b.date);
    if (dateSort !== 0) return dateSort;
    return (a.event.startTime ?? "99:99").localeCompare(
      b.event.startTime ?? "99:99",
    );
  });
}

export function CalendarPage({
  events,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onDeleteOccurrence,
  onDeleteFutureOccurrences,
}: CalendarPageProps) {
  const todayId = formatDateId(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [dateScope, setDateScope] = useState<DateScope>("key");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayId);
  const [eventComposer, setEventComposer] =
    useState<EventComposerState>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthGridStart = startOfWeek(monthStart);
  const monthGridEnd = addDays(monthGridStart, 41);
  const weekStart = startOfWeek(anchorDate);
  const weekEnd = endOfWeek(anchorDate);
  const visibleStart = view === "week" ? weekStart : monthGridStart;
  const visibleEnd = view === "week" ? weekEnd : monthGridEnd;
  const visibleOccurrences = useMemo(
    () => getOccurrences(events, visibleStart, visibleEnd, dateScope),
    [dateScope, events, visibleStart, visibleEnd],
  );
  const listOccurrences = useMemo(
    () => getOccurrences(events, new Date(), addDays(new Date(), 365), dateScope),
    [dateScope, events],
  );

  const occurrencesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of visibleOccurrences) {
      grouped.set(occurrence.date, [
        ...(grouped.get(occurrence.date) ?? []),
        occurrence,
      ]);
    }
    return grouped;
  }, [visibleOccurrences]);

  const selectedOccurrences = useMemo(
    () =>
      getOccurrences(
        events,
        parseDateId(selectedDate),
        parseDateId(selectedDate),
        dateScope,
      ),
    [dateScope, events, selectedDate],
  );

  const editingEvent = eventComposer?.eventId
    ? events.find((event) => event.id === eventComposer.eventId) ?? null
    : null;

  const occurrenceColor = (occurrence: CalendarOccurrence) =>
    occurrence.isRecurringFollowUp ? RECURRING_GREY : MALLOC_BLUE;

  const selectDate = (date: string) => {
    setSelectedDate(date);
  };

  const getComposerPosition = (element?: HTMLElement | null) => {
    if (typeof window === "undefined" || !element) return null;
    const rect = element.getBoundingClientRect();
    const panelWidth = Math.min(window.innerWidth * 0.92, 460);
    const preferredTop = Math.min(rect.top + 8, 96);
    return {
      left: Math.max(16, Math.min(rect.left + 8, window.innerWidth - panelWidth - 16)),
      top: Math.max(16, preferredTop),
    };
  };

  const openNewEvent = (date: string, element?: HTMLElement | null) => {
    setSelectedDate(date);
    setEventComposer({
      date,
      eventId: null,
      position: getComposerPosition(element),
    });
  };

  const openEvent = (event: CalendarEvent, date = event.date) => {
    setSelectedDate(date);
    setEventComposer({
      date,
      eventId: event.id,
      position: null,
    });
  };

  const changeAnchor = (direction: -1 | 1) => {
    if (view === "month") {
      setAnchorDate((current) => addMonthsClamped(current, direction));
    } else {
      setAnchorDate((current) => addDays(current, direction * 7));
    }
  };

  const deleteLabel = pendingDelete?.event.recurrence.frequency === "none"
    ? "Delete event"
    : "Delete occurrence";

  return (
    <div className="grid grid-cols-1 gap-4">
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeAnchor(-1)}
              className="sketchy-btn flex h-9 w-9 items-center justify-center"
              aria-label="Previous"
              title="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setAnchorDate(today);
                selectDate(formatDateId(today));
              }}
              className="sketchy-btn h-9 px-3 text-sm font-semibold"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => changeAnchor(1)}
              className="sketchy-btn flex h-9 w-9 items-center justify-center"
              aria-label="Next"
              title="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <h1 className="ml-2 text-xl font-bold text-foreground">
              {view === "week"
                ? `${dayLabel(formatDateId(weekStart))} - ${dayLabel(formatDateId(weekEnd))}`
                : monthLabel(anchorDate)}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border border-foreground bg-card">
              {(["key", "all"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDateScope(option)}
                  className={`h-9 border-r border-foreground px-3 text-xs font-semibold uppercase tracking-wider last:border-r-0 ${
                    dateScope === option
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  }`}
                >
                  {option === "key" ? "Key dates" : "All dates"}
                </button>
              ))}
            </div>
            <div className="flex items-center border border-foreground bg-card">
              {(["month", "week", "list"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={`h-9 border-r border-foreground px-3 text-xs font-semibold uppercase tracking-wider last:border-r-0 ${
                    view === option
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === "list" ? (
          <div className="sketchy-card divide-y divide-border">
            {listOccurrences.length > 0 ? (
              listOccurrences.map((occurrence) => (
                <EventRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  color={occurrenceColor(occurrence)}
                  onOpen={() => openEvent(occurrence.event, occurrence.date)}
                  onDelete={() => setPendingDelete(occurrence)}
                />
              ))
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nothing saved yet.
              </div>
            )}
          </div>
        ) : view === "week" ? (
          <div className="grid grid-cols-1 border border-foreground bg-card md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, index) => {
              const day = addDays(weekStart, index);
              const date = formatDateId(day);
              const occurrences = occurrencesByDate.get(date) ?? [];
              return (
                <DayColumn
                  key={date}
                  date={date}
                  label={DAY_LABELS[day.getDay()]}
                  occurrences={occurrences}
                  selected={selectedDate === date}
                  today={date === todayId}
                  colorForOccurrence={occurrenceColor}
                  onSelect={(target) => openNewEvent(date, target)}
                  onOpen={openEvent}
                  onDelete={(event) => setPendingDelete({ event, date })}
                />
              );
            })}
          </div>
        ) : (
          <div className="border border-foreground bg-card">
            <div className="grid grid-cols-7 border-b border-foreground bg-muted/50">
              {DAY_LABELS.map((day) => (
                <div
                  key={day}
                  className="px-2 py-2 text-center text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }).map((_, index) => {
                const day = addDays(monthGridStart, index);
                const date = formatDateId(day);
                const occurrences = occurrencesByDate.get(date) ?? [];
                const inMonth = day.getMonth() === anchorDate.getMonth();
                return (
                  <div
                    key={date}
                    className={`relative min-h-[112px] border-b border-r border-border p-2 transition-colors ${
                      index % 7 === 6 ? "border-r-0" : ""
                    } ${index >= 35 ? "border-b-0" : ""} ${
                      selectedDate === date ? "bg-primary/10" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(clickEvent) =>
                        openNewEvent(date, clickEvent.currentTarget)
                      }
                      className="absolute inset-0 z-0 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      aria-label={`Add event on ${longDayLabel(date)}`}
                    />
                    <div className="pointer-events-none relative z-10">
                      <span
                        className={`inline-flex h-6 min-w-6 items-center justify-center px-1 text-xs font-bold ${
                          date === todayId
                            ? "bg-primary text-primary-foreground"
                            : inMonth
                              ? "text-foreground"
                              : "text-muted-foreground/50"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <div className="mt-2 flex flex-col gap-1">
                        {occurrences.slice(0, 4).map((occurrence) => (
                          <button
                            key={occurrence.id}
                            type="button"
                            onClick={() =>
                              openEvent(occurrence.event, occurrence.date)
                            }
                            className="pointer-events-auto flex min-w-0 items-center gap-1.5 text-left text-xs text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Open ${occurrence.event.title}`}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: occurrenceColor(occurrence) }}
                            />
                            <span className="truncate">{occurrence.event.title}</span>
                          </button>
                        ))}
                        {occurrences.length > 4 && (
                          <span className="text-xs text-muted-foreground">
                            +{occurrences.length - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "month" && (
          <div className="mt-4 sketchy-card divide-y divide-border">
            <div className="flex items-center justify-between p-3">
              <h2 className="text-sm font-bold">{longDayLabel(selectedDate)}</h2>
              <button
                type="button"
                onClick={(clickEvent) =>
                  openNewEvent(selectedDate, clickEvent.currentTarget)
                }
                className="sketchy-btn flex h-8 items-center gap-2 px-3 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                Event
              </button>
            </div>
            {selectedOccurrences.length > 0 ? (
              selectedOccurrences.map((occurrence) => (
                <EventRow
                  key={occurrence.id}
                  occurrence={occurrence}
                  color={occurrenceColor(occurrence)}
                  onOpen={() => openEvent(occurrence.event, occurrence.date)}
                  onDelete={() => setPendingDelete(occurrence)}
                />
              ))
            ) : (
              <div className="p-4 text-sm text-muted-foreground">No saved events.</div>
            )}
          </div>
        )}
      </section>

      <CalendarEventPopover
        open={Boolean(eventComposer)}
        date={eventComposer?.date ?? todayId}
        event={editingEvent}
        position={eventComposer?.position ?? null}
        onClose={() => setEventComposer(null)}
        onAddEvent={onAddEvent}
        onUpdateEvent={onUpdateEvent}
        onRequestDelete={(event, date) => {
          setEventComposer(null);
          setPendingDelete({ event, date });
        }}
      />

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={deleteLabel}
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="sketchy-card w-full max-w-sm p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-bold">{deleteLabel}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {pendingDelete.event.title} on {longDayLabel(pendingDelete.date)}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {pendingDelete.event.recurrence.frequency !== "none" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteOccurrence(pendingDelete.event.id, pendingDelete.date);
                      setPendingDelete(null);
                    }}
                    className="sketchy-btn h-10 px-3 text-left text-sm font-semibold"
                  >
                    This occurrence
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteFutureOccurrences(
                        pendingDelete.event.id,
                        pendingDelete.date,
                      );
                      setPendingDelete(null);
                    }}
                    className="sketchy-btn h-10 px-3 text-left text-sm font-semibold"
                  >
                    This and future
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  onDeleteEvent(pendingDelete.event.id);
                  if (eventComposer?.eventId === pendingDelete.event.id) {
                    setEventComposer(null);
                  }
                  setPendingDelete(null);
                }}
                className="h-10 border border-destructive px-3 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                {pendingDelete.event.recurrence.frequency === "none"
                  ? "Delete event"
                  : "Entire series"}
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="h-10 px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({
  occurrence,
  color,
  onOpen,
  onDelete,
}: {
  occurrence: CalendarOccurrence;
  color: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3">
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-foreground">
            {occurrence.event.title}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {dayLabel(occurrence.date)}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatEventTime(occurrence.event)}
          </span>
          {occurrence.event.recurrence.frequency !== "none" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Repeat className="h-3.5 w-3.5" />
              {occurrence.event.recurrence.frequency}
            </span>
          )}
        </div>
        {(occurrence.event.location || occurrence.event.description) && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {occurrence.event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {occurrence.event.location}
              </span>
            )}
            {occurrence.event.description && (
              <span className="truncate">{occurrence.event.description}</span>
            )}
          </div>
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Delete ${occurrence.event.title}`}
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function DayColumn({
  date,
  label,
  occurrences,
  selected,
  today,
  colorForOccurrence,
  onSelect,
  onOpen,
  onDelete,
}: {
  date: string;
  label: string;
  occurrences: CalendarOccurrence[];
  selected: boolean;
  today: boolean;
  colorForOccurrence: (occurrence: CalendarOccurrence) => string;
  onSelect: (target: HTMLElement) => void;
  onOpen: (event: CalendarEvent, date: string) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  return (
    <div
      className={`min-h-[360px] border-b border-r border-border p-2 last:border-r-0 md:border-b-0 ${
        selected ? "bg-primary/10" : ""
      }`}
    >
      <button
        type="button"
        onClick={(clickEvent) => onSelect(clickEvent.currentTarget)}
        className="mb-2 flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={`flex h-7 min-w-7 items-center justify-center px-1 text-sm font-bold ${
            today ? "bg-primary text-primary-foreground" : "text-foreground"
          }`}
        >
          {parseDateId(date).getDate()}
        </span>
      </button>
      <div className="space-y-2">
        {occurrences.map((occurrence) => (
          <div
            key={occurrence.id}
            className="border border-input bg-background p-2"
          >
            <button
              type="button"
              onClick={() => onOpen(occurrence.event, occurrence.date)}
              className="flex w-full items-start gap-2 text-left"
            >
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorForOccurrence(occurrence) }}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {occurrence.event.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatEventTime(occurrence.event)}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(occurrence.event)}
              className="mt-1 flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete ${occurrence.event.title}`}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
