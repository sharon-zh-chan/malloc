"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  AppState,
  MemoCollection,
  TodoBlock,
  TodoItem,
  TextBlock,
  ItemStatus,
  SyncStatus,
} from "@/lib/types";
import type { WorkspaceMutation } from "@/lib/api/workspace-mutations";
import { createClient } from "@/lib/supabase/client";
import type { User, RealtimeChannel } from "@supabase/supabase-js";

const STORAGE_KEY = "todo-at-one-glance";
const MUTATION_QUEUE_KEY = "todo-at-one-glance-pending-mutations";

type QueuedMutation = {
  id: string;
  userId: string;
  mutation: WorkspaceMutation;
};

type WorkspaceStateResponse = {
  state: Partial<AppState> | null;
  updated_at: string | null;
};

function getSyncFailureStatus(): SyncStatus {
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "offline"
    : "error";
}

function reportSyncFailure(context: string, error: unknown): SyncStatus {
  console.error(`[workspace sync] ${context}`, error);
  return getSyncFailureStatus();
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

function createDefaultState(): AppState {
  return {
    timeRange: "",
    blocks: [
      {
        id: generateId(),
        title: "My Tasks",
        items: [],
        order: 0,
      },
    ],
    textBlocks: [],
    memoCollections: [],
    lastUpdatedAt: 0,
  };
}

function migrateAppState(raw: Partial<AppState>): AppState {
  const fallback = createDefaultState();

  return {
    timeRange: raw.timeRange ?? fallback.timeRange,
    blocks: Array.isArray(raw.blocks) ? raw.blocks : fallback.blocks,
    textBlocks: Array.isArray(raw.textBlocks)
      ? raw.textBlocks.map((block) => ({
          ...block,
          collectionId: block.collectionId ?? null,
          previousCollectionId: block.previousCollectionId ?? null,
          archivedAt: block.archivedAt ?? null,
        }))
      : [],
    memoCollections: Array.isArray(raw.memoCollections)
      ? raw.memoCollections
      : [],
    lastUpdatedAt: raw.lastUpdatedAt || Date.now(),
  };
}

function loadLocalState() {
  if (typeof window === "undefined") {
    return createDefaultState();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    return migrateAppState(JSON.parse(raw) as Partial<AppState>);
  } catch {
    return createDefaultState();
  }
}

function saveLocalState(state: AppState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or unavailable.
  }
}

function loadMutationQueue(): QueuedMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const queue = JSON.parse(localStorage.getItem(MUTATION_QUEUE_KEY) ?? "[]");
    return Array.isArray(queue) ? (queue as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function saveMutationQueue(queue: QueuedMutation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage may be full or unavailable.
  }
}

function mutationQueueKey(mutation: WorkspaceMutation): string | null {
  switch (mutation.action) {
    case "setTimeRange":
    case "reorderStickies":
    case "clearArchivedTasks":
      return mutation.action;
    case "clearStickyArchivedTasks":
      return `${mutation.action}:${mutation.payload.stickyId}`;
    case "renameSticky":
      return `${mutation.action}:${mutation.payload.stickyId}`;
    case "editTask":
      return `${mutation.action}:${mutation.payload.taskId}`;
    case "reorderTasks":
      return `${mutation.action}:${mutation.payload.stickyId}`;
    case "renameMemo":
    case "editMemo":
    case "moveMemo":
      return `${mutation.action}:${mutation.payload.memoId}`;
    case "renameMemoCollection":
      return `${mutation.action}:${mutation.payload.collectionId}`;
    default:
      return null;
  }
}

export function useTodoStore() {
  const [state, setState] = useState<AppState>(() => createDefaultState());
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  const supabaseRef = useRef(createClient());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  const userRef = useRef<User | null>(null);
  const queueRef = useRef<QueuedMutation[]>([]);
  const flushingRef = useRef(false);
  const ownMutationIdsRef = useRef(new Set<string>());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const local = loadLocalState();
    queueRef.current = loadMutationQueue();
    setState(local);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveLocalState(state);
  }, [state, hydrated]);

  const hydrateWorkspace = useCallback(async () => {
    const currentUser = userRef.current;
    const supabase = supabaseRef.current;
    if (!currentUser || !supabase) return;

    setSyncStatus("syncing");
    const { data, error } = await supabase.rpc("get_workspace_state");

    if (error) {
      setSyncStatus(reportSyncFailure("hydrate workspace", error));
      return;
    }

    const response = data as WorkspaceStateResponse;
    const currentState = stateRef.current;

    if (!response.state) {
      const { data: replacement, error: replacementError } = await supabase.rpc(
        "replace_workspace_state",
        { replacement_state: currentState },
      );

      if (replacementError) {
        setSyncStatus(
          reportSyncFailure("create initial workspace", replacementError),
        );
        return;
      }

      const nextState = migrateAppState(
        (replacement as WorkspaceStateResponse).state ?? currentState,
      );
      setState(nextState);
      saveLocalState(nextState);
      setSyncStatus("synced");
      return;
    }

    const remoteState = migrateAppState(response.state);
    const remoteUpdatedAt = response.updated_at
      ? new Date(response.updated_at).getTime()
      : remoteState.lastUpdatedAt;

    const nextState = { ...remoteState, lastUpdatedAt: remoteUpdatedAt };
    setState(nextState);
    saveLocalState(nextState);

    setSyncStatus("synced");
  }, []);

  const flushMutationQueue = useCallback(async () => {
    const currentUser = userRef.current;
    const supabase = supabaseRef.current;
    if (!currentUser || !supabase || flushingRef.current) return false;

    flushingRef.current = true;
    setSyncStatus("syncing");

    try {
      while (true) {
        const next = queueRef.current.find(
          (queued) => queued.userId === currentUser.id,
        );
        if (!next) break;

        ownMutationIdsRef.current.add(next.id);
        const { error } = await supabase.rpc("apply_workspace_mutation", {
          client_mutation_id: next.id,
          action: next.mutation.action,
          payload: next.mutation.payload,
        });

        if (error) {
          ownMutationIdsRef.current.delete(next.id);
          setSyncStatus(reportSyncFailure("apply queued mutation", error));
          return false;
        }

        queueRef.current = queueRef.current.filter(
          (queued) => queued.id !== next.id,
        );
        saveMutationQueue(queueRef.current);
      }

      setSyncStatus("synced");
      return true;
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const enqueueMutation = useCallback(
    (mutation: WorkspaceMutation) => {
      const currentUser = userRef.current;
      if (!currentUser) return;

      const queueKey = mutationQueueKey(mutation);
      if (queueKey) {
        queueRef.current = queueRef.current.filter(
          (queued) =>
            queued.userId !== currentUser.id ||
            mutationQueueKey(queued.mutation) !== queueKey,
        );
      }

      queueRef.current.push({
        id: generateId(),
        userId: currentUser.id,
        mutation,
      });
      saveMutationQueue(queueRef.current);
      void flushMutationQueue();
    },
    [flushMutationQueue],
  );

  useEffect(() => {
    const supabase = supabaseRef.current;
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      setUser(currentUser ?? null);
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

  useEffect(() => {
    if (!hydrated || !user) return;
    void flushMutationQueue().then((flushed) => {
      if (flushed) void hydrateWorkspace();
    });
  }, [hydrated, user, flushMutationQueue, hydrateWorkspace]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    if (!user || !supabase) {
      if (channelRef.current && supabase) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setSyncStatus("idle");
      return;
    }

    const channel = supabase
      .channel("workspace_mutation_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "workspace_mutations",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const mutationId = (payload.new as { client_mutation_id?: string })
            .client_mutation_id;
          if (!mutationId) return;

          if (ownMutationIdsRef.current.has(mutationId)) {
            ownMutationIdsRef.current.delete(mutationId);
            return;
          }

          void flushMutationQueue().then((flushed) => {
            if (flushed) void hydrateWorkspace();
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user, flushMutationQueue, hydrateWorkspace]);

  useEffect(() => {
    const handleOnline = () => {
      void flushMutationQueue().then((flushed) => {
        if (flushed) void hydrateWorkspace();
      });
    };
    const handleOffline = () => {
      if (userRef.current) setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flushMutationQueue, hydrateWorkspace]);

  const onAuthChange = useCallback(() => {
    // Auth state changes are handled by the Supabase listener above.
  }, []);

  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => ({ ...updater(prev), lastUpdatedAt: Date.now() }));
  }, []);

  const applyLocalMutation = useCallback(
    (updater: (prev: AppState) => AppState, mutation: WorkspaceMutation) => {
      updateState(updater);
      enqueueMutation(mutation);
    },
    [enqueueMutation, updateState],
  );

  const setTimeRange = useCallback(
    (timeRange: string) => {
      applyLocalMutation(
        (prev) => ({ ...prev, timeRange }),
        { action: "setTimeRange", payload: { timeRange } },
      );
    },
    [applyLocalMutation],
  );

  const addBlock = useCallback(
    (title: string) => {
      if (state.blocks.length >= 10) return;
      const sticky: TodoBlock = {
        id: generateId(),
        title,
        items: [],
        order: state.blocks.length,
      };
      applyLocalMutation(
        (prev) => ({ ...prev, blocks: [...prev.blocks, sticky] }),
        { action: "addSticky", payload: { sticky } },
      );
    },
    [applyLocalMutation, state.blocks.length],
  );

  const updateBlockTitle = useCallback(
    (stickyId: string, title: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) =>
            sticky.id === stickyId ? { ...sticky, title } : sticky,
          ),
        }),
        { action: "renameSticky", payload: { stickyId, title } },
      );
    },
    [applyLocalMutation],
  );

  const deleteBlock = useCallback(
    (stickyId: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks
            .filter((sticky) => sticky.id !== stickyId)
            .map((sticky, order) => ({ ...sticky, order })),
        }),
        { action: "deleteSticky", payload: { stickyId } },
      );
    },
    [applyLocalMutation],
  );

  const reorderBlocks = useCallback(
    (stickies: TodoBlock[]) => {
      const reordered = stickies.map((sticky, order) => ({ ...sticky, order }));
      applyLocalMutation(
        (prev) => ({ ...prev, blocks: reordered }),
        {
          action: "reorderStickies",
          payload: { stickyIds: reordered.map((sticky) => sticky.id) },
        },
      );
    },
    [applyLocalMutation],
  );

  const reorderItems = useCallback(
    (stickyId: string, items: TodoItem[]) => {
      const reordered = items.map((item, order) => ({ ...item, order }));
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) =>
            sticky.id === stickyId ? { ...sticky, items: reordered } : sticky,
          ),
        }),
        {
          action: "reorderTasks",
          payload: { stickyId, taskIds: reordered.map((task) => task.id) },
        },
      );
    },
    [applyLocalMutation],
  );

  const addItem = useCallback(
    (stickyId: string, text: string) => {
      const sticky = state.blocks.find((candidate) => candidate.id === stickyId);
      if (!sticky) return;
      const task: TodoItem = {
        id: generateId(),
        text,
        status: "todo",
        createdAt: Date.now(),
        order: sticky.items.length,
      };
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((candidate) =>
            candidate.id === stickyId
              ? { ...candidate, items: [...candidate.items, task] }
              : candidate,
          ),
        }),
        { action: "addTask", payload: { stickyId, task } },
      );
    },
    [applyLocalMutation, state.blocks],
  );

  const updateItemText = useCallback(
    (stickyId: string, taskId: string, text: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) =>
            sticky.id === stickyId
              ? {
                  ...sticky,
                  items: sticky.items.map((task) =>
                    task.id === taskId ? { ...task, text } : task,
                  ),
                }
              : sticky,
          ),
        }),
        { action: "editTask", payload: { stickyId, taskId, text } },
      );
    },
    [applyLocalMutation],
  );

  const setItemStatus = useCallback(
    (stickyId: string, taskId: string, status: ItemStatus) => {
      const order = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) =>
            sticky.id === stickyId
              ? {
                  ...sticky,
                  items: sticky.items.map((task) =>
                    task.id === taskId ? { ...task, status, order } : task,
                  ),
                }
              : sticky,
          ),
        }),
        { action: "setTaskStatus", payload: { stickyId, taskId, status, order } },
      );
    },
    [applyLocalMutation],
  );

  const toggleItemStatus = useCallback(
    (stickyId: string, taskId: string) => {
      const task = state.blocks
        .find((sticky) => sticky.id === stickyId)
        ?.items.find((candidate) => candidate.id === taskId);
      if (!task) return;
      setItemStatus(stickyId, taskId, task.status === "todo" ? "completed" : "todo");
    },
    [setItemStatus, state.blocks],
  );

  const softDeleteItem = useCallback(
    (stickyId: string, taskId: string) => {
      setItemStatus(stickyId, taskId, "deleted");
    },
    [setItemStatus],
  );

  const undoDeleteItem = useCallback(
    (stickyId: string, taskId: string) => {
      setItemStatus(stickyId, taskId, "todo");
    },
    [setItemStatus],
  );

  const clearAndArchive = useCallback(() => {
    applyLocalMutation(
      (prev) => ({
        ...prev,
        blocks: prev.blocks.map((sticky) => ({
          ...sticky,
          items: sticky.items.filter((task) => task.status === "todo"),
        })),
      }),
      { action: "clearArchivedTasks", payload: {} },
    );
  }, [applyLocalMutation]);

  const clearStickyArchivedTasks = useCallback(
    (stickyId: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) =>
            sticky.id === stickyId
              ? {
                  ...sticky,
                  items: sticky.items.filter((task) => task.status === "todo"),
                }
              : sticky,
          ),
        }),
        { action: "clearStickyArchivedTasks", payload: { stickyId } },
      );
    },
    [applyLocalMutation],
  );

  const addTextBlock = useCallback(
    (title: string, collectionId: string | null = null) => {
      const trimmed = title.trim();
      if (!trimmed || state.textBlocks.length >= 30) return null;

      const now = Date.now();
      const memo: TextBlock = {
        id: generateId(),
        title: trimmed,
        content: "",
        collectionId,
        previousCollectionId: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        order: state.textBlocks.length,
      };
      applyLocalMutation(
        (prev) => ({ ...prev, textBlocks: [...prev.textBlocks, memo] }),
        { action: "addMemo", payload: { memo } },
      );
      return memo.id;
    },
    [applyLocalMutation, state.textBlocks.length],
  );

  const updateTextBlockTitle = useCallback(
    (memoId: string, title: string) => {
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          textBlocks: prev.textBlocks.map((memo) =>
            memo.id === memoId ? { ...memo, title, updatedAt } : memo,
          ),
        }),
        { action: "renameMemo", payload: { memoId, title, updatedAt } },
      );
    },
    [applyLocalMutation],
  );

  const updateTextBlockContent = useCallback(
    (memoId: string, content: string) => {
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          textBlocks: prev.textBlocks.map((memo) =>
            memo.id === memoId ? { ...memo, content, updatedAt } : memo,
          ),
        }),
        { action: "editMemo", payload: { memoId, content, updatedAt } },
      );
    },
    [applyLocalMutation],
  );

  const updateTextBlockCollection = useCallback(
    (memoId: string, collectionId: string | null) => {
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          textBlocks: prev.textBlocks.map((memo) =>
            memo.id === memoId
              ? {
                  ...memo,
                  collectionId,
                  previousCollectionId: null,
                  archivedAt: null,
                  updatedAt,
                }
              : memo,
          ),
        }),
        { action: "moveMemo", payload: { memoId, collectionId, updatedAt } },
      );
    },
    [applyLocalMutation],
  );

  const archiveTextBlock = useCallback(
    (memoId: string) => {
      const archivedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          textBlocks: prev.textBlocks.map((memo) =>
            memo.id === memoId
              ? {
                  ...memo,
                  previousCollectionId:
                    memo.previousCollectionId ?? memo.collectionId ?? null,
                  collectionId: null,
                  archivedAt,
                  updatedAt: archivedAt,
                }
              : memo,
          ),
        }),
        {
          action: "archiveMemo",
          payload: { memoId, archivedAt, updatedAt: archivedAt },
        },
      );
    },
    [applyLocalMutation],
  );

  const restoreTextBlock = useCallback(
    (memoId: string) => {
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          textBlocks: prev.textBlocks.map((memo) =>
            memo.id === memoId
              ? {
                  ...memo,
                  collectionId: memo.previousCollectionId ?? null,
                  previousCollectionId: null,
                  archivedAt: null,
                  updatedAt,
                }
              : memo,
          ),
        }),
        { action: "restoreMemo", payload: { memoId, updatedAt } },
      );
    },
    [applyLocalMutation],
  );

  const deleteTextBlock = useCallback(
    (memoId: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          textBlocks: prev.textBlocks
            .filter((memo) => memo.id !== memoId)
            .map((memo, order) => ({ ...memo, order })),
        }),
        { action: "deleteMemo", payload: { memoId } },
      );
    },
    [applyLocalMutation],
  );

  const addMemoCollection = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const existing = state.memoCollections.find(
        (collection) =>
          collection.title.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existing) return existing.id;

      const now = Date.now();
      const collection: MemoCollection = {
        id: generateId(),
        title: trimmed,
        createdAt: now,
        updatedAt: now,
        order: state.memoCollections.length,
      };
      applyLocalMutation(
        (prev) => ({
          ...prev,
          memoCollections: [...prev.memoCollections, collection],
        }),
        { action: "addMemoCollection", payload: { collection } },
      );
      return collection.id;
    },
    [applyLocalMutation, state.memoCollections],
  );

  const updateMemoCollectionTitle = useCallback(
    (collectionId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          memoCollections: prev.memoCollections.map((collection) =>
            collection.id === collectionId
              ? { ...collection, title: trimmed, updatedAt }
              : collection,
          ),
        }),
        {
          action: "renameMemoCollection",
          payload: { collectionId, title: trimmed, updatedAt },
        },
      );
    },
    [applyLocalMutation],
  );

  const deleteMemoCollection = useCallback(
    (collectionId: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          memoCollections: prev.memoCollections
            .filter((collection) => collection.id !== collectionId)
            .map((collection, order) => ({ ...collection, order })),
          textBlocks: prev.textBlocks.map((memo) =>
            memo.collectionId === collectionId ||
            memo.previousCollectionId === collectionId
              ? {
                  ...memo,
                  collectionId:
                    memo.collectionId === collectionId
                      ? null
                      : memo.collectionId,
                  previousCollectionId:
                    memo.previousCollectionId === collectionId
                      ? null
                      : memo.previousCollectionId,
                  updatedAt: Date.now(),
                }
              : memo,
          ),
        }),
        { action: "deleteMemoCollection", payload: { collectionId } },
      );
    },
    [applyLocalMutation],
  );

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
    clearStickyArchivedTasks,
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
  };
}
