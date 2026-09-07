"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Plus, Trash2 } from "lucide-react";
import type { JournalEntry } from "@/lib/types";
import { ConfirmModal } from "./confirm-modal";

type JournalPageProps = {
  entries: JournalEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string | null) => void;
  onAddEntry: (journalDate: string, title: string) => string | null;
  onUpdateTitle: (entryId: string, title: string) => void;
  onUpdateContent: (entryId: string, content: string) => void;
  onDeleteEntry: (entryId: string) => void;
};

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

function longDateLabel(dateId: string) {
  return parseDateId(dateId).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function shortDateLabel(dateId: string) {
  return parseDateId(dateId).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function defaultEntryTitle(journalDate: string, entriesForDate: JournalEntry[]) {
  const dateTitle = parseDateId(journalDate).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (entriesForDate.length === 0) return dateTitle;

  return `${dateTitle}, ${timeLabel(Date.now())}`;
}

export function JournalPage({
  entries,
  selectedEntryId,
  onSelectEntry,
  onAddEntry,
  onUpdateTitle,
  onUpdateContent,
  onDeleteEntry,
}: JournalPageProps) {
  const todayId = formatDateId(new Date());
  const [pendingDelete, setPendingDelete] = useState<JournalEntry | null>(null);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const dateSort = b.journalDate.localeCompare(a.journalDate);
        if (dateSort !== 0) return dateSort;
        const createdSort = b.createdAt - a.createdAt;
        if (createdSort !== 0) return createdSort;
        return b.order - a.order;
      }),
    [entries],
  );

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, JournalEntry[]>();
    for (const entry of sortedEntries) {
      grouped.set(entry.journalDate, [
        ...(grouped.get(entry.journalDate) ?? []),
        entry,
      ]);
    }
    return grouped;
  }, [sortedEntries]);

  const selectedEntry =
    sortedEntries.find((entry) => entry.id === selectedEntryId) ?? null;

  useEffect(() => {
    if (
      selectedEntryId &&
      !entries.some((entry) => entry.id === selectedEntryId)
    ) {
      onSelectEntry(null);
    }
  }, [entries, onSelectEntry, selectedEntryId]);

  const handleSelectEntry = (entry: JournalEntry) => {
    onSelectEntry(entry.id);
  };

  const handleAddEntry = (journalDate = todayId) => {
    const entriesForDate = entriesByDate.get(journalDate) ?? [];
    const entryId = onAddEntry(
      journalDate,
      defaultEntryTitle(journalDate, entriesForDate),
    );
    if (entryId) onSelectEntry(entryId);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="sketchy-card h-fit p-3 lg:sticky lg:top-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpenText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Journal</h2>
          </div>
          <button
            type="button"
            onClick={() => handleAddEntry()}
            className="sketchy-btn flex h-8 w-8 items-center justify-center"
            aria-label="Add journal entry"
            title="Add journal entry"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {sortedEntries.length > 0 ? (
            sortedEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleSelectEntry(entry)}
                className={`group/journal min-w-0 px-2 py-2 text-left text-sm transition-colors ${
                  entry.id === selectedEntryId
                    ? "bg-primary/10 font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span className="block truncate">
                  {entry.title || "Untitled entry"}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {shortDateLabel(entry.journalDate)} at {timeLabel(entry.createdAt)}
                </span>
              </button>
            ))
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No journal entries yet.
            </p>
          )}
        </div>
      </aside>

      <section className="min-w-0">
        {selectedEntry ? (
          <div className="sketchy-card flex min-h-[620px] flex-col p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs font-bold uppercase text-muted-foreground">
                  {longDateLabel(selectedEntry.journalDate)}
                </div>
                <input
                  value={selectedEntry.title}
                  onChange={(event) =>
                    onUpdateTitle(selectedEntry.id, event.target.value)
                  }
                  placeholder="Untitled entry"
                  className="w-full bg-transparent text-2xl font-bold leading-tight text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete(selectedEntry)}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Delete journal entry"
                title="Delete journal entry"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={selectedEntry.content}
              onChange={(event) =>
                onUpdateContent(selectedEntry.id, event.target.value)
              }
              placeholder="Write what's on your mind..."
              className="mt-4 min-h-[500px] flex-1 resize-none bg-background/35 px-4 py-3 text-base leading-7 text-foreground outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground"
            />
          </div>
        ) : (
          <div className="sketchy-card flex min-h-[620px] items-center justify-center p-6">
            <button
              type="button"
              onClick={() => handleAddEntry()}
              className="flex flex-col items-center gap-3 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Start a journal entry"
            >
              <span className="sketchy-btn flex h-14 w-14 items-center justify-center">
                <Plus className="h-6 w-6" />
              </span>
              <span className="text-sm font-medium">
                Start a journal entry
              </span>
            </button>
          </div>
        )}
      </section>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete Entry"
        message={`Permanently delete "${pendingDelete?.title || "Untitled entry"}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) {
            onDeleteEntry(pendingDelete.id);
            if (pendingDelete.id === selectedEntryId) {
              const nextEntry =
                sortedEntries.find((entry) => entry.id !== pendingDelete.id) ??
                null;
              onSelectEntry(nextEntry?.id ?? null);
            }
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
