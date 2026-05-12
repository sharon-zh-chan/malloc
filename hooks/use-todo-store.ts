"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { AppState, TodoBlock, TodoItem, ItemStatus, SyncStatus } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import type { User, RealtimeChannel } from "@supabase/supabase-js";

const STORAGE_KEY = "todo-at-one-glance";
const SYNC_DEBOUNCE_MS = 500;

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

const defaultState: AppState = {
  timeRange: "",
  blocks: [
    {
      id: generateId(),
      title: "My Tasks",
      items: [],
      order: 0,
    },
  ],
  lastUpdatedAt: Date.now(),
};

function loadLocalState(): AppState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as AppState;
    // Ensure lastUpdatedAt exists (migration from old format)
    if (!parsed.lastUpdatedAt) {
      parsed.lastUpdatedAt = Date.now();
    }
    return parsed;
  } catch {
    return defaultState;
  }
}

function saveLocalState(state: AppState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
}

export function useTodoStore() {
  const [state, setState] = useState<AppState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  const supabaseRef = useRef(createClient());
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastPushedAtRef = useRef<number>(0);
  const isSyncingRef = useRef(false);
  const pendingSyncRef = useRef(false);

  // ---- Auth listener ----
  useEffect(() => {
    const supabase = supabaseRef.current;

    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ---- Hydrate from localStorage ----
  useEffect(() => {
    const local = loadLocalState();
    setState(local);
    setHydrated(true);
  }, []);

  // ---- Save to localStorage on every state change ----
  useEffect(() => {
    if (hydrated) {
      saveLocalState(state);
    }
  }, [state, hydrated]);

  // ---- Fetch remote state and reconcile ----
  const fetchAndReconcile = useCallback(
    async (currentState: AppState) => {
      if (!user) return;

      const supabase = supabaseRef.current;
      setSyncStatus("syncing");

      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("state, updated_at")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          setSyncStatus("offline");
          pendingSyncRef.current = true;
          return;
        }

        if (!data) {
          // No remote row yet - create one with current local state
          const { error: insertError } = await supabase.from("app_state").insert({
            user_id: user.id,
            state: currentState,
            updated_at: new Date().toISOString(),
          });

          if (insertError) {
            setSyncStatus("offline");
            pendingSyncRef.current = true;
          } else {
            lastPushedAtRef.current = currentState.lastUpdatedAt;
            setSyncStatus("synced");
          }
          return;
        }

        // Remote row exists - compare timestamps
        const remoteUpdatedAt = new Date(data.updated_at).getTime();
        const remoteState = data.state as AppState;
        const localUpdatedAt = currentState.lastUpdatedAt;

        if (remoteUpdatedAt > localUpdatedAt) {
          // Remote is newer - use remote state
          const reconciledState = {
            ...remoteState,
            lastUpdatedAt: remoteUpdatedAt,
          };
          setState(reconciledState);
          saveLocalState(reconciledState);
          lastPushedAtRef.current = remoteUpdatedAt;
        } else if (localUpdatedAt > remoteUpdatedAt) {
          // Local is newer - push to remote
          const { error: updateError } = await supabase
            .from("app_state")
            .update({
              state: currentState,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id);

          if (updateError) {
            setSyncStatus("offline");
            pendingSyncRef.current = true;
            return;
          }
          lastPushedAtRef.current = localUpdatedAt;
        }
        // else: timestamps equal, already in sync

        setSyncStatus("synced");
      } catch {
        setSyncStatus("offline");
        pendingSyncRef.current = true;
      }
    },
    [user],
  );

  // ---- Push state to remote (debounced) ----
  const pushToRemote = useCallback(
    async (newState: AppState) => {
      if (!user) return;
      if (isSyncingRef.current) {
        pendingSyncRef.current = true;
        return;
      }

      isSyncingRef.current = true;
      setSyncStatus("syncing");

      try {
        const supabase = supabaseRef.current;
        const { error } = await supabase
          .from("app_state")
          .upsert(
            {
              user_id: user.id,
              state: newState,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

        if (error) {
          setSyncStatus("offline");
          pendingSyncRef.current = true;
        } else {
          lastPushedAtRef.current = newState.lastUpdatedAt;
          setSyncStatus("synced");
        }
      } catch {
        setSyncStatus("offline");
        pendingSyncRef.current = true;
      } finally {
        isSyncingRef.current = false;
      }
    },
    [user],
  );

  // ---- Schedule debounced sync on state change ----
  useEffect(() => {
    if (!hydrated || !user) return;

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      pushToRemote(state);
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [state, hydrated, user, pushToRemote]);

  // ---- Initial fetch on login ----
  useEffect(() => {
    if (hydrated && user) {
      fetchAndReconcile(state);
    }
    // Only run when user changes or hydration completes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hydrated]);

  // ---- Realtime subscription ----
  useEffect(() => {
    if (!user) {
      // Cleanup channel if user logs out
      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setSyncStatus("idle");
      return;
    }

    const supabase = supabaseRef.current;

    const channel = supabase
      .channel("app_state_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_state",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newRow = payload.new as {
            state: AppState;
            updated_at: string;
          } | undefined;

          if (!newRow) return;

          const remoteUpdatedAt = new Date(newRow.updated_at).getTime();

          // Skip if this is our own push (timestamps match within 2 seconds)
          if (Math.abs(remoteUpdatedAt - lastPushedAtRef.current) < 2000) {
            return;
          }

          // Remote is from another device - apply if newer
          setState((prev) => {
            if (remoteUpdatedAt > prev.lastUpdatedAt) {
              const updated = {
                ...newRow.state,
                lastUpdatedAt: remoteUpdatedAt,
              };
              saveLocalState(updated);
              return updated;
            }
            return prev;
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user]);

  // ---- Online/offline listener ----
  useEffect(() => {
    const handleOnline = () => {
      if (pendingSyncRef.current && user) {
        pendingSyncRef.current = false;
        pushToRemote(state);
      }
    };

    const handleOffline = () => {
      if (user) {
        setSyncStatus("offline");
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [user, state, pushToRemote]);

  // ---- Callback to trigger re-fetch after auth change ----
  const onAuthChange = useCallback(() => {
    // Auth state change is handled by the listener above
  }, []);

  // ---- State mutation helpers ----
  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = updater(prev);
      return { ...next, lastUpdatedAt: Date.now() };
    });
  }, []);

  const setTimeRange = useCallback(
    (timeRange: string) => {
      updateState((prev) => ({ ...prev, timeRange }));
    },
    [updateState],
  );

  const addBlock = useCallback(
    (title: string) => {
      updateState((prev) => {
        if (prev.blocks.length >= 10) return prev;
        const newBlock: TodoBlock = {
          id: generateId(),
          title,
          items: [],
          order: prev.blocks.length,
        };
        return { ...prev, blocks: [...prev.blocks, newBlock] };
      });
    },
    [updateState],
  );

  const updateBlockTitle = useCallback(
    (blockId: string, title: string) => {
      updateState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === blockId ? { ...b, title } : b,
        ),
      }));
    },
    [updateState],
  );

  const deleteBlock = useCallback(
    (blockId: string) => {
      updateState((prev) => ({
        ...prev,
        blocks: prev.blocks
          .filter((b) => b.id !== blockId)
          .map((b, i) => ({ ...b, order: i })),
      }));
    },
    [updateState],
  );

  const reorderBlocks = useCallback(
    (newBlocks: TodoBlock[]) => {
      updateState((prev) => ({
        ...prev,
        blocks: newBlocks.map((b, i) => ({ ...b, order: i })),
      }));
    },
    [updateState],
  );

  const reorderItems = useCallback(
    (blockId: string, newItems: TodoItem[]) => {
      updateState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            items: newItems.map((item, i) => ({ ...item, order: i })),
          };
        }),
      }));
    },
    [updateState],
  );

  const addItem = useCallback(
    (blockId: string, text: string) => {
      updateState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          if (b.id !== blockId) return b;
          const newItem: TodoItem = {
            id: generateId(),
            text,
            status: "todo",
            createdAt: Date.now(),
            order: b.items.length,
          };
          return { ...b, items: [...b.items, newItem] };
        }),
      }));
    },
    [updateState],
  );

  const updateItemText = useCallback(
    (blockId: string, itemId: string, text: string) => {
      updateState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            items: b.items.map((item) =>
              item.id === itemId ? { ...item, text } : item,
            ),
          };
        }),
      }));
    },
    [updateState],
  );

  const toggleItemStatus = useCallback(
    (blockId: string, itemId: string) => {
      updateState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            items: b.items.map((item) => {
              if (item.id !== itemId) return item;
              const newStatus: ItemStatus =
                item.status === "todo" ? "completed" : "todo";
              return { ...item, status: newStatus, order: Date.now() };
            }),
          };
        }),
      }));
    },
    [updateState],
  );

  const softDeleteItem = useCallback(
    (blockId: string, itemId: string) => {
      updateState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            items: b.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    status: "deleted" as ItemStatus,
                    order: Date.now(),
                  }
                : item,
            ),
          };
        }),
      }));
    },
    [updateState],
  );

  const undoDeleteItem = useCallback(
    (blockId: string, itemId: string) => {
      updateState((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) => {
          if (b.id !== blockId) return b;
          return {
            ...b,
            items: b.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    status: "todo" as ItemStatus,
                    order: Date.now(),
                  }
                : item,
            ),
          };
        }),
      }));
    },
    [updateState],
  );

  const clearAndArchive = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => ({
        ...b,
        items: b.items.filter((item) => item.status === "todo"),
      })),
    }));
  }, [updateState]);

  return {
    state,
    hydrated,
    user,
    syncStatus,
    onAuthChange,
    setTimeRange,
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
  };
}
