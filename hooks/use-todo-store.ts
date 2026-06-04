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
import {
  hasPasswordRecoveryMarker,
  markPasswordRecoveryPending,
} from "@/lib/auth-recovery";
import type { User, RealtimeChannel } from "@supabase/supabase-js";

const STORAGE_KEY = "todo-at-one-glance";
const MUTATION_QUEUE_KEY = "todo-at-one-glance-pending-mutations";
const ANALYTICS_HEARTBEAT_MS = 30_000;

type AnalyticsEventName =
  | "session_started"
  | "view_switched"
  | "sticky_created"
  | "sticky_deleted"
  | "stickies_reordered"
  | "task_created"
  | "task_completed"
  | "task_deleted"
  | "task_restored"
  | "tasks_reordered"
  | "archived_tasks_cleared"
  | "memo_created"
  | "memo_moved"
  | "memo_archived"
  | "memo_restored"
  | "memo_deleted"
  | "memo_collection_created"
  | "memo_collection_deleted";

type AnalyticsProperties = Record<string, string | number | boolean | null>;

type QueuedMutation = {
  id: string;
  userId: string;
  mutation: WorkspaceMutation;
};

type WorkspaceStateResponse = {
  state: Partial<AppState> | null;
  updated_at: string | null;
};

type TodoSupabaseClient = NonNullable<ReturnType<typeof createClient>>;

function getSyncFailureStatus(): SyncStatus {
  return typeof navigator !== "undefined" && !navigator.onLine
    ? "offline"
    : "error";
}

function reportSyncFailure(context: string, error: unknown): SyncStatus {
  console.error(`[workspace sync] ${context}`, error);
  return getSyncFailureStatus();
}

function reportAnalyticsFailure(context: string, error: unknown) {
  console.warn(`[analytics] ${context}`, error);
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
        title: "Life Admin",
        items: [],
        order: 0,
      },
      {
        id: generateId(),
        title: "Today",
        items: [],
        order: 1,
      },
      {
        id: generateId(),
        title: "Shopping List",
        items: [],
        order: 2,
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

async function applyInitialWorkspaceMutation(
  supabase: TodoSupabaseClient,
  mutation: WorkspaceMutation,
) {
  const { data, error } = await supabase.rpc("apply_workspace_mutation", {
    client_mutation_id: generateId(),
    action: mutation.action,
    payload: mutation.payload,
  });

  if (error) throw error;

  return data as WorkspaceStateResponse;
}

async function createInitialWorkspace(
  supabase: TodoSupabaseClient,
  state: AppState,
) {
  let response = await applyInitialWorkspaceMutation(supabase, {
    action: "setTimeRange",
    payload: { timeRange: state.timeRange },
  });

  for (const block of state.blocks) {
    response = await applyInitialWorkspaceMutation(supabase, {
      action: "addSticky",
      payload: {
        sticky: {
          id: block.id,
          title: block.title,
          order: block.order,
        },
      },
    });

    for (const task of block.items) {
      response = await applyInitialWorkspaceMutation(supabase, {
        action: "addTask",
        payload: {
          stickyId: block.id,
          task,
        },
      });
    }
  }

  for (const collection of state.memoCollections) {
    response = await applyInitialWorkspaceMutation(supabase, {
      action: "addMemoCollection",
      payload: { collection },
    });
  }

  for (const memo of state.textBlocks) {
    response = await applyInitialWorkspaceMutation(supabase, {
      action: "addMemo",
      payload: { memo },
    });

    if (memo.archivedAt) {
      response = await applyInitialWorkspaceMutation(supabase, {
        action: "archiveMemo",
        payload: {
          memoId: memo.id,
          archivedAt: memo.archivedAt,
          updatedAt: memo.updatedAt,
        },
      });
    }
  }

  return response;
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
  const [authResolved, setAuthResolved] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");

  const supabaseRef = useRef(createClient());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef(state);
  const userRef = useRef<User | null>(null);
  const queueRef = useRef<QueuedMutation[]>([]);
  const flushingRef = useRef(false);
  const ownMutationIdsRef = useRef(new Set<string>());
  const analyticsSessionIdRef = useRef<string | null>(null);
  const authRequestRef = useRef(0);

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
    if (!currentUser || !supabase) return false;

    setSyncStatus("syncing");
    const { data, error } = await supabase.rpc("get_workspace_state");

    if (error) {
      setSyncStatus(reportSyncFailure("hydrate workspace", error));
      return false;
    }

    const response = data as WorkspaceStateResponse;
    const currentState = stateRef.current;

    if (!response.state) {
      try {
        const initialWorkspace = await createInitialWorkspace(
          supabase,
          currentState,
        );
        const nextState = migrateAppState(
          initialWorkspace.state ?? currentState,
        );
        setState(nextState);
        saveLocalState(nextState);
        setSyncStatus("synced");
        return true;
      } catch (error) {
        setSyncStatus(
          reportSyncFailure("create initial workspace", error),
        );
        return false;
      }
    }

    const remoteState = migrateAppState(response.state);
    const remoteUpdatedAt = response.updated_at
      ? new Date(response.updated_at).getTime()
      : remoteState.lastUpdatedAt;

    const nextState = { ...remoteState, lastUpdatedAt: remoteUpdatedAt };
    setState(nextState);
    saveLocalState(nextState);

    setSyncStatus("synced");
    return true;
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

  const clearLocalWorkspace = useCallback(() => {
    setWorkspaceReady(false);
    queueRef.current = [];
    ownMutationIdsRef.current.clear();
    saveMutationQueue([]);

    const nextState = createDefaultState();
    setState(nextState);
    saveLocalState(nextState);
    setSyncStatus("idle");
  }, []);

  const resolveAuthUser = useCallback(
    async (currentUser: User | null) => {
      const requestId = ++authRequestRef.current;
      setWorkspaceReady(false);

      if (!currentUser) {
        userRef.current = null;
        setUser(null);
        setAuthResolved(true);
        return;
      }

      userRef.current = currentUser;
      const flushed = await flushMutationQueue();
      if (requestId !== authRequestRef.current) return;

      const ready = flushed ? await hydrateWorkspace() : false;
      if (requestId !== authRequestRef.current) return;

      setUser(currentUser);
      setWorkspaceReady(ready);
      setAuthResolved(true);
    },
    [flushMutationQueue, hydrateWorkspace],
  );

  useEffect(() => {
    const supabase = supabaseRef.current;
    if (!supabase) {
      setAuthResolved(true);
      setWorkspaceReady(true);
      return;
    }

    if (!hydrated) return;

    if (hasPasswordRecoveryMarker(window.location.search, window.location.hash)) {
      markPasswordRecoveryPending();
    }

    void supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      void resolveAuthUser(currentUser ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        markPasswordRecoveryPending();
      }

      void resolveAuthUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [hydrated, resolveAuthUser]);

  useEffect(() => {
    if (!authResolved || user) return;
    clearLocalWorkspace();
    setWorkspaceReady(true);
  }, [authResolved, clearLocalWorkspace, user]);

  useEffect(() => {
    if (!hydrated || !user || workspaceReady) return;
    void flushMutationQueue().then((flushed) => {
      if (!flushed) return;
      void hydrateWorkspace().then((ready) => {
        if (ready) setWorkspaceReady(true);
      });
    });
  }, [hydrated, user, workspaceReady, flushMutationQueue, hydrateWorkspace]);

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

  const trackProductEvent = useCallback(
    async (
      eventName: AnalyticsEventName,
      properties: AnalyticsProperties = {},
    ) => {
      const currentUser = userRef.current;
      const supabase = supabaseRef.current;
      if (!currentUser || !supabase) return;

      const { error } = await supabase.from("analytics_events").insert({
        user_id: currentUser.id,
        session_id: analyticsSessionIdRef.current,
        event_name: eventName,
        properties,
      });

      if (error) {
        reportAnalyticsFailure(`track ${eventName}`, error);
      }
    },
    [],
  );

  useEffect(() => {
    const supabase = supabaseRef.current;
    if (!hydrated || !user || !supabase) return;

    let stopped = false;
    let sessionId: string | null = null;

    const touchSession = async (ended = false) => {
      if (!sessionId) return;

      const timestamp = new Date().toISOString();
      const update = ended
        ? { last_seen_at: timestamp, ended_at: timestamp }
        : { last_seen_at: timestamp };

      const { error } = await supabase
        .from("analytics_sessions")
        .update(update)
        .eq("id", sessionId)
        .eq("user_id", user.id);

      if (error) {
        reportAnalyticsFailure("update session", error);
      }
    };

    const startSession = async () => {
      const newSessionId = crypto.randomUUID();
      const { error } = await supabase
        .from("analytics_sessions")
        .insert({ id: newSessionId, user_id: user.id });

      if (error) {
        reportAnalyticsFailure("start session", error);
        return;
      }

      sessionId = newSessionId;

      if (stopped) {
        await touchSession(true);
        return;
      }

      analyticsSessionIdRef.current = sessionId;

      const { error: eventError } = await supabase
        .from("analytics_events")
        .insert({
          user_id: user.id,
          session_id: sessionId,
          event_name: "session_started",
          properties: {
            stickies_count: stateRef.current.blocks.length,
            memos_count: stateRef.current.textBlocks.length,
            memo_collections_count: stateRef.current.memoCollections.length,
          },
        });

      if (eventError) {
        reportAnalyticsFailure("track session_started", eventError);
      }
    };

    void startSession();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void touchSession();
      }
    }, ANALYTICS_HEARTBEAT_MS);

    const handleVisibilityChange = () => {
      void touchSession();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void touchSession(true);
      analyticsSessionIdRef.current = null;
    };
  }, [hydrated, user?.id]);

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
      void trackProductEvent("sticky_created", {
        stickies_count_after: state.blocks.length + 1,
      });
    },
    [applyLocalMutation, state.blocks.length, trackProductEvent],
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
      void trackProductEvent("sticky_deleted", {
        stickies_count_after: Math.max(state.blocks.length - 1, 0),
      });
    },
    [applyLocalMutation, state.blocks.length, trackProductEvent],
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
      void trackProductEvent("stickies_reordered", {
        stickies_count: reordered.length,
      });
    },
    [applyLocalMutation, trackProductEvent],
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
      void trackProductEvent("tasks_reordered", {
        tasks_count: reordered.length,
      });
    },
    [applyLocalMutation, trackProductEvent],
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
      void trackProductEvent("task_created", {
        tasks_count_after: sticky.items.length + 1,
      });
    },
    [applyLocalMutation, state.blocks, trackProductEvent],
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
      const eventName =
        status === "completed"
          ? "task_completed"
          : status === "deleted"
            ? "task_deleted"
            : "task_restored";
      void trackProductEvent(eventName, { status });
    },
    [applyLocalMutation, trackProductEvent],
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
    const archivedCount = state.blocks.reduce(
      (count, sticky) =>
        count + sticky.items.filter((task) => task.status !== "todo").length,
      0,
    );
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
    void trackProductEvent("archived_tasks_cleared", {
      scope: "workspace",
      tasks_cleared: archivedCount,
    });
  }, [applyLocalMutation, state.blocks, trackProductEvent]);

  const clearStickyArchivedTasks = useCallback(
    (stickyId: string) => {
      const sticky = state.blocks.find((candidate) => candidate.id === stickyId);
      const archivedCount =
        sticky?.items.filter((task) => task.status !== "todo").length ?? 0;
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
      void trackProductEvent("archived_tasks_cleared", {
        scope: "sticky",
        tasks_cleared: archivedCount,
      });
    },
    [applyLocalMutation, state.blocks, trackProductEvent],
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
      void trackProductEvent("memo_created", {
        memos_count_after: state.textBlocks.length + 1,
        has_collection: Boolean(collectionId),
      });
      return memo.id;
    },
    [applyLocalMutation, state.textBlocks.length, trackProductEvent],
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
      void trackProductEvent("memo_moved", {
        has_collection: Boolean(collectionId),
      });
    },
    [applyLocalMutation, trackProductEvent],
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
      void trackProductEvent("memo_archived");
    },
    [applyLocalMutation, trackProductEvent],
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
      void trackProductEvent("memo_restored");
    },
    [applyLocalMutation, trackProductEvent],
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
      void trackProductEvent("memo_deleted", {
        memos_count_after: Math.max(state.textBlocks.length - 1, 0),
      });
    },
    [applyLocalMutation, state.textBlocks.length, trackProductEvent],
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
      void trackProductEvent("memo_collection_created", {
        memo_collections_count_after: state.memoCollections.length + 1,
      });
      return collection.id;
    },
    [applyLocalMutation, state.memoCollections, trackProductEvent],
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
      void trackProductEvent("memo_collection_deleted", {
        memo_collections_count_after: Math.max(
          state.memoCollections.length - 1,
          0,
        ),
      });
    },
    [applyLocalMutation, state.memoCollections.length, trackProductEvent],
  );

  return {
    state,
    hydrated,
    authResolved,
    workspaceReady,
    user,
    syncStatus,
    onAuthChange,
    clearLocalWorkspace,
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
    trackProductEvent,
  };
}
