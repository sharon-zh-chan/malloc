"use client";

import { useMemo, useState } from "react";
import type { MemoCollection } from "@/lib/types";
import { ChevronDown, Folder, Plus, Search } from "lucide-react";

interface MemoCollectionPickerProps {
  collections: MemoCollection[];
  value: string | null;
  onChange: (collectionId: string | null) => void;
  onCreateCollection: (title: string) => string | null;
  includeArchive?: boolean;
  isArchived?: boolean;
  onArchive?: () => void;
  compact?: boolean;
}

const UNFILED_LABEL = "No folder";
const ARCHIVE_LABEL = "Deleted";

export function MemoCollectionPicker({
  collections,
  value,
  onChange,
  onCreateCollection,
  includeArchive = false,
  isArchived = false,
  onArchive,
  compact = false,
}: MemoCollectionPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sortedCollections = useMemo(
    () =>
      [...collections].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      ),
    [collections],
  );

  const selectedCollection =
    sortedCollections.find((collection) => collection.id === value) ?? null;
  const selectedLabel = isArchived
    ? ARCHIVE_LABEL
    : selectedCollection?.title ?? UNFILED_LABEL;
  const filteredCollections = sortedCollections.filter((collection) =>
    collection.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const canCreate =
    query.trim().length > 0 &&
    !sortedCollections.some(
      (collection) =>
        collection.title.toLowerCase() === query.trim().toLowerCase(),
    ) &&
    UNFILED_LABEL.toLowerCase() !== query.trim().toLowerCase() &&
    ARCHIVE_LABEL.toLowerCase() !== query.trim().toLowerCase();

  const chooseCollection = (collectionId: string | null) => {
    onChange(collectionId);
    setOpen(false);
    setQuery("");
  };

  const chooseArchive = () => {
    onArchive?.();
    setOpen(false);
    setQuery("");
  };

  const createCollection = () => {
    const collectionId = onCreateCollection(query.trim());
    if (collectionId) chooseCollection(collectionId);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center gap-1.5 rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-primary/10 transition-colors ${
          compact
            ? "px-2 py-1 text-sm"
            : "w-full px-3 py-2 text-sm sketchy-border-light bg-background/40 justify-between"
        }`}
        aria-label="Choose notepad collection"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Folder className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          <span className="truncate">{selectedLabel}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 sketchy-card p-2 shadow-lg">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  setQuery("");
                }
                if (event.key === "Enter" && canCreate) {
                  createCollection();
                }
              }}
              placeholder="Search collections..."
              className="w-full bg-background/50 pl-8 pr-3 py-2 text-sm text-foreground rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => chooseCollection(null)}
              className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors ${
                value === null
                  ? "bg-primary/10 text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {UNFILED_LABEL}
            </button>

            {includeArchive && (
              <button
                type="button"
                onClick={chooseArchive}
                className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors ${
                  isArchived
                    ? "bg-primary/10 text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {ARCHIVE_LABEL}
              </button>
            )}

            {filteredCollections.map((collection) => (
              <button
                type="button"
                key={collection.id}
                onClick={() => chooseCollection(collection.id)}
                className={`w-full text-left text-sm px-3 py-2 rounded-md transition-colors truncate ${
                  value === collection.id
                    ? "bg-primary/10 text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {collection.title}
              </button>
            ))}

            {canCreate && (
              <button
                type="button"
                onClick={createCollection}
                className="mt-1 flex w-full items-center gap-2 text-left text-sm px-3 py-2 rounded-md text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="truncate">Create "{query.trim()}"</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
