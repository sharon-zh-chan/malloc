"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  AppState,
  CalendarCategory,
  CalendarEvent,
  MemoCollection,
  Sketch,
  SketchCollection,
  SketchElement,
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
const FAILED_MUTATION_QUEUE_KEY = "todo-at-one-glance-failed-mutations";
const ANALYTICS_HEARTBEAT_MS = 30_000;
const FAILED_MUTATION_QUEUE_LIMIT = 20;

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
  | "task_moved"
  | "tasks_reordered"
  | "archived_tasks_cleared"
  | "memo_created"
  | "memo_moved"
  | "memo_archived"
  | "memo_restored"
  | "memo_deleted"
  | "memo_collection_created"
  | "memo_collection_deleted"
  | "sketch_created"
  | "sketch_archived"
  | "sketch_restored"
  | "sketch_deleted"
  | "sketch_collection_created"
  | "sketch_collection_deleted"
  | "calendar_event_created"
  | "calendar_event_deleted"
  | "calendar_category_created"
  | "calendar_category_deleted";

type AnalyticsProperties = Record<string, string | number | boolean | null>;

type QueuedMutation = {
  id: string;
  userId: string;
  mutation: WorkspaceMutation;
};

type FailedQueuedMutation = QueuedMutation & {
  failedAt: number;
  reason: string;
};

type FlushMutationQueueResult = {
  flushed: boolean;
  discardedFailedMutation: boolean;
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

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

function isPermanentQueuedMutationError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }

  const message = getErrorMessage(error);

  return [
    /not found/i,
    /unsupported workspace action/i,
    /invalid input syntax/i,
    /violates .*constraint/i,
    /duplicate key value/i,
    /null value in column/i,
    /cannot cast/i,
  ].some((pattern) => pattern.test(message));
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
    sketches: [],
    sketchCollections: [],
    calendarEvents: [],
    calendarCategories: [],
    lastUpdatedAt: 0,
  };
}

function migrateAppState(raw: Partial<AppState>): AppState {
  const fallback = createDefaultState();

  return {
    timeRange: raw.timeRange ?? fallback.timeRange,
    blocks: Array.isArray(raw.blocks)
      ? raw.blocks.map((block) => ({
          ...block,
          items: Array.isArray(block.items)
            ? block.items.map((task) => ({
                ...task,
                parentTaskId: task.parentTaskId ?? null,
                subtasksExpanded: task.subtasksExpanded ?? false,
                clearedAt: task.clearedAt ?? null,
              }))
            : [],
        }))
      : fallback.blocks,
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
    sketches: Array.isArray(raw.sketches)
      ? raw.sketches.map((sketch) => ({
          ...sketch,
          elements: Array.isArray(sketch.elements) ? sketch.elements : [],
          collectionId: sketch.collectionId ?? null,
          previousCollectionId: sketch.previousCollectionId ?? null,
          archivedAt: sketch.archivedAt ?? null,
        }))
      : [],
    sketchCollections: Array.isArray(raw.sketchCollections)
      ? raw.sketchCollections
      : [],
    calendarEvents: Array.isArray(raw.calendarEvents)
      ? raw.calendarEvents.map((event) => ({
          ...event,
          startTime: event.startTime ?? null,
          endTime: event.endTime ?? null,
          categoryId: event.categoryId ?? null,
          recurrence: {
            frequency: event.recurrence?.frequency ?? "none",
            interval: Math.max(1, event.recurrence?.interval ?? 1),
            untilDate: event.recurrence?.untilDate ?? null,
          },
          description: event.description ?? "",
          location: event.location ?? null,
          deletedOccurrenceDates: Array.isArray(event.deletedOccurrenceDates)
            ? event.deletedOccurrenceDates
            : [],
          source: event.source ?? null,
        }))
      : [],
    calendarCategories: Array.isArray(raw.calendarCategories)
      ? raw.calendarCategories.map((category) => ({
          ...category,
          color: category.color ?? "#0057d9",
        }))
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

function saveFailedMutation(mutation: FailedQueuedMutation) {
  if (typeof window === "undefined") return;
  try {
    const failedQueue = JSON.parse(
      localStorage.getItem(FAILED_MUTATION_QUEUE_KEY) ?? "[]",
    );
    const nextQueue = [
      mutation,
      ...(Array.isArray(failedQueue) ? failedQueue : []),
    ].slice(0, FAILED_MUTATION_QUEUE_LIMIT);

    localStorage.setItem(FAILED_MUTATION_QUEUE_KEY, JSON.stringify(nextQueue));
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

  for (const collection of state.sketchCollections) {
    response = await applyInitialWorkspaceMutation(supabase, {
      action: "addSketchCollection",
      payload: { collection },
    });
  }

  for (const sketch of state.sketches) {
    response = await applyInitialWorkspaceMutation(supabase, {
      action: "addSketch",
      payload: { sketch },
    });

    if (sketch.archivedAt) {
      response = await applyInitialWorkspaceMutation(supabase, {
        action: "archiveSketch",
        payload: {
          sketchId: sketch.id,
          archivedAt: sketch.archivedAt,
          updatedAt: sketch.updatedAt,
        },
      });
    }
  }

  for (const category of state.calendarCategories) {
    response = await applyInitialWorkspaceMutation(supabase, {
      action: "addCalendarCategory",
      payload: { category },
    });
  }

  for (const event of state.calendarEvents) {
    response = await applyInitialWorkspaceMutation(supabase, {
      action: "addCalendarEvent",
      payload: { event },
    });
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
    case "restoreTask":
      return `${mutation.action}:${mutation.payload.taskId}`;
    case "renameSticky":
      return `${mutation.action}:${mutation.payload.stickyId}`;
    case "editTask":
      return `${mutation.action}:${mutation.payload.taskId}`;
    case "setTaskExpanded":
      return `${mutation.action}:${mutation.payload.taskId}`;
    case "moveTask":
      return `${mutation.action}:${mutation.payload.taskId}`;
    case "reorderTasks":
      return `${mutation.action}:${mutation.payload.stickyId}`;
    case "renameMemo":
    case "editMemo":
    case "moveMemo":
      return `${mutation.action}:${mutation.payload.memoId}`;
    case "renameMemoCollection":
      return `${mutation.action}:${mutation.payload.collectionId}`;
    case "renameSketch":
    case "editSketch":
    case "moveSketch":
    case "archiveSketch":
    case "restoreSketch":
      return `${mutation.action}:${mutation.payload.sketchId}`;
    case "renameSketchCollection":
      return `${mutation.action}:${mutation.payload.collectionId}`;
    case "updateCalendarEvent":
    case "deleteCalendarOccurrence":
    case "deleteCalendarFutureOccurrences":
      return `${mutation.action}:${mutation.payload.eventId}`;
    case "updateCalendarCategory":
      return `${mutation.action}:${mutation.payload.categoryId}`;
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

  const hydrateWorkspace = useCallback(
    async (successStatus: SyncStatus = "synced") => {
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
          setSyncStatus(successStatus);
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

      setSyncStatus(successStatus);
      return true;
    },
    [],
  );

  const flushMutationQueue = useCallback(async () => {
    const currentUser = userRef.current;
    const supabase = supabaseRef.current;
    const result: FlushMutationQueueResult = {
      flushed: false,
      discardedFailedMutation: false,
    };

    if (!currentUser || !supabase || flushingRef.current) return result;

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

          if (isPermanentQueuedMutationError(error)) {
            console.warn("[workspace sync] discarding queued mutation", {
              mutation: next.mutation,
              error,
            });
            queueRef.current = queueRef.current.filter(
              (queued) => queued.id !== next.id,
            );
            saveMutationQueue(queueRef.current);
            saveFailedMutation({
              ...next,
              failedAt: Date.now(),
              reason: getErrorMessage(error),
            });
            result.discardedFailedMutation = true;
            continue;
          }

          setSyncStatus(reportSyncFailure("apply queued mutation", error));
          return result;
        }

        queueRef.current = queueRef.current.filter(
          (queued) => queued.id !== next.id,
        );
        saveMutationQueue(queueRef.current);
      }

      result.flushed = true;
      setSyncStatus(result.discardedFailedMutation ? "conflict" : "synced");
      return result;
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
      const flushResult = await flushMutationQueue();
      if (requestId !== authRequestRef.current) return;

      const ready = await hydrateWorkspace(
        flushResult.discardedFailedMutation
          ? "conflict"
          : flushResult.flushed
            ? "synced"
            : "error",
      );
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
    void flushMutationQueue().then((flushResult) => {
      void hydrateWorkspace(
        flushResult.discardedFailedMutation
          ? "conflict"
          : flushResult.flushed
            ? "synced"
            : "error",
      ).then((ready) => {
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
            if (flushed.flushed) {
              void hydrateWorkspace(
                flushed.discardedFailedMutation ? "conflict" : "synced",
              );
            }
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
        if (flushed.flushed) {
          void hydrateWorkspace(
            flushed.discardedFailedMutation ? "conflict" : "synced",
          );
        }
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
            sketches_count: stateRef.current.sketches.length,
            sketch_collections_count: stateRef.current.sketchCollections.length,
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
        tasks_count: reordered.filter((task) => !task.parentTaskId).length,
      });
    },
    [applyLocalMutation, trackProductEvent],
  );

  const moveItem = useCallback(
    (fromStickyId: string, toStickyId: string, taskId: string) => {
      if (fromStickyId === toStickyId) return;

      const sourceSticky = state.blocks.find(
        (sticky) => sticky.id === fromStickyId,
      );
      const targetSticky = state.blocks.find(
        (sticky) => sticky.id === toStickyId,
      );
      const task = sourceSticky?.items.find(
        (candidate) => candidate.id === taskId,
      );

      if (!sourceSticky || !targetSticky || !task || task.parentTaskId) return;

      const movingTaskIds = new Set([
        taskId,
        ...sourceSticky.items
          .filter((candidate) => candidate.parentTaskId === taskId)
          .map((candidate) => candidate.id),
      ]);

      const order =
        Math.max(
          -1,
          ...targetSticky.items
            .filter((candidate) => candidate.status === task.status)
            .map((candidate) => candidate.order),
        ) + 1;

      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) => {
            if (sticky.id === fromStickyId) {
              return {
                ...sticky,
                items: sticky.items.filter(
                  (candidate) => !movingTaskIds.has(candidate.id),
                ),
              };
            }

            if (sticky.id === toStickyId) {
              const movingTasks = sourceSticky.items
                .filter((candidate) => movingTaskIds.has(candidate.id))
                .map((candidate) =>
                  candidate.id === taskId ? { ...candidate, order } : candidate,
                );
              return {
                ...sticky,
                items: [...sticky.items, ...movingTasks],
              };
            }

            return sticky;
          }),
        }),
        {
          action: "moveTask",
          payload: { fromStickyId, toStickyId, taskId, order },
        },
      );
      void trackProductEvent("task_moved", {
        status: task.status,
        from_sticky_id: fromStickyId,
        to_sticky_id: toStickyId,
      });
    },
    [applyLocalMutation, state.blocks, trackProductEvent],
  );

  const addItem = useCallback(
    (stickyId: string, text: string) => {
      const sticky = state.blocks.find((candidate) => candidate.id === stickyId);
      if (!sticky) return;
      const task: TodoItem = {
        id: generateId(),
        text,
        status: "todo",
        parentTaskId: null,
        subtasksExpanded: false,
        createdAt: Date.now(),
        clearedAt: null,
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
        tasks_count_after:
          sticky.items.filter((item) => !item.parentTaskId).length + 1,
      });
    },
    [applyLocalMutation, state.blocks, trackProductEvent],
  );

  const addSubtask = useCallback(
    (stickyId: string, parentTaskId: string, text: string) => {
      const sticky = state.blocks.find((candidate) => candidate.id === stickyId);
      const parent = sticky?.items.find(
        (candidate) => candidate.id === parentTaskId && !candidate.parentTaskId,
      );
      if (!sticky || !parent || parent.status !== "todo") return;

      const siblingOrders = sticky.items
        .filter((candidate) => candidate.parentTaskId === parentTaskId)
        .map((candidate) => candidate.order);
      const task: TodoItem = {
        id: generateId(),
        text,
        status: "todo",
        parentTaskId,
        subtasksExpanded: false,
        createdAt: Date.now(),
        clearedAt: null,
        order: Math.max(-1, ...siblingOrders) + 1,
      };

      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((candidate) =>
            candidate.id === stickyId
              ? {
                  ...candidate,
                  items: candidate.items
                    .map((item) =>
                      item.id === parentTaskId
                        ? { ...item, subtasksExpanded: true }
                        : item,
                    )
                    .concat(task),
                }
              : candidate,
          ),
        }),
        { action: "addTask", payload: { stickyId, task } },
      );
      enqueueMutation({
        action: "setTaskExpanded",
        payload: { stickyId, taskId: parentTaskId, expanded: true },
      });
      void trackProductEvent("task_created", {
        is_subtask: true,
        subtasks_count_after: siblingOrders.length + 1,
      });
    },
    [applyLocalMutation, enqueueMutation, state.blocks, trackProductEvent],
  );

  const setItemExpanded = useCallback(
    (stickyId: string, taskId: string, expanded: boolean) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) =>
            sticky.id === stickyId
              ? {
                  ...sticky,
                  items: sticky.items.map((task) =>
                    task.id === taskId
                      ? { ...task, subtasksExpanded: expanded }
                      : task,
                  ),
                }
              : sticky,
          ),
        }),
        {
          action: "setTaskExpanded",
          payload: { stickyId, taskId, expanded },
        },
      );
    },
    [applyLocalMutation],
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
                    task.id === taskId
                      ? { ...task, status, clearedAt: null, order }
                      : task,
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
      const sticky = state.blocks.find((candidate) => candidate.id === stickyId);
      const task = sticky?.items.find((candidate) => candidate.id === taskId);
      if (!task) return;
      if (
        task.status === "todo" &&
        !task.parentTaskId &&
        sticky?.items.some(
          (candidate) =>
            candidate.parentTaskId === task.id &&
            !candidate.clearedAt &&
            candidate.status === "todo",
        )
      ) {
        return;
      }
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

  const clearAndArchive = useCallback(() => {
    const clearedAt = Date.now();
    const archivedCount = state.blocks.reduce(
      (count, sticky) =>
        count +
        sticky.items.filter(
          (task) =>
            !task.clearedAt &&
            ((!task.parentTaskId && task.status !== "todo") ||
              (Boolean(task.parentTaskId) && task.status === "deleted")),
        ).length,
      0,
    );
    applyLocalMutation(
      (prev) => ({
        ...prev,
        blocks: prev.blocks.map((sticky) => ({
          ...sticky,
          items: sticky.items.map((task) =>
            !task.clearedAt &&
            ((!task.parentTaskId && task.status !== "todo") ||
              (Boolean(task.parentTaskId) && task.status === "deleted"))
              ? { ...task, clearedAt }
              : task,
          ),
        })),
      }),
      { action: "clearArchivedTasks", payload: { clearedAt } },
    );
    void trackProductEvent("archived_tasks_cleared", {
      scope: "workspace",
      tasks_cleared: archivedCount,
    });
  }, [applyLocalMutation, state.blocks, trackProductEvent]);

  const clearStickyArchivedTasks = useCallback(
    (stickyId: string) => {
      const clearedAt = Date.now();
      const sticky = state.blocks.find((candidate) => candidate.id === stickyId);
      const archivedCount =
        sticky?.items.filter(
          (task) =>
            !task.clearedAt &&
            ((!task.parentTaskId && task.status !== "todo") ||
              (Boolean(task.parentTaskId) && task.status === "deleted")),
        ).length ?? 0;
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) =>
            sticky.id === stickyId
              ? {
                  ...sticky,
                  items: sticky.items.map((task) =>
                    !task.clearedAt &&
                    ((!task.parentTaskId && task.status !== "todo") ||
                      (Boolean(task.parentTaskId) && task.status === "deleted"))
                      ? { ...task, clearedAt }
                      : task,
                  ),
                }
              : sticky,
          ),
        }),
        {
          action: "clearStickyArchivedTasks",
          payload: { stickyId, clearedAt },
        },
      );
      void trackProductEvent("archived_tasks_cleared", {
        scope: "sticky",
        tasks_cleared: archivedCount,
      });
    },
    [applyLocalMutation, state.blocks, trackProductEvent],
  );

  const restoreTaskToTodo = useCallback(
    (stickyId: string, taskId: string) => {
      const order = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) =>
            sticky.id === stickyId
              ? {
                  ...sticky,
                  items: sticky.items.map((task) => {
                    const restoredTask = sticky.items.find(
                      (candidate) => candidate.id === taskId,
                    );
                    const shouldRestoreParent =
                      restoredTask?.parentTaskId === task.id;
                    return task.id === taskId || shouldRestoreParent
                      ? {
                          ...task,
                          status: "todo" as const,
                          clearedAt: null,
                          order: task.id === taskId ? order : task.order,
                          subtasksExpanded: shouldRestoreParent
                            ? true
                            : task.subtasksExpanded,
                        }
                      : task;
                  }),
                }
              : sticky,
          ),
        }),
        { action: "restoreTask", payload: { stickyId, taskId, order } },
      );
      void trackProductEvent("task_restored", { status: "todo" });
    },
    [applyLocalMutation, trackProductEvent],
  );

  const deleteTasksPermanently = useCallback(
    (taskIds: string[]) => {
      const taskIdSet = new Set(taskIds);
      if (taskIdSet.size === 0) return;

      applyLocalMutation(
        (prev) => ({
          ...prev,
          blocks: prev.blocks.map((sticky) => ({
            ...sticky,
            items: sticky.items.filter(
              (task) =>
                !taskIdSet.has(task.id) &&
                !(task.parentTaskId && taskIdSet.has(task.parentTaskId)),
            ),
          })),
        }),
        {
          action: "deleteTasksPermanently",
          payload: { taskIds: Array.from(taskIdSet) },
        },
      );
      void trackProductEvent("archived_tasks_cleared", {
        scope: "history",
        tasks_cleared: taskIdSet.size,
      });
    },
    [applyLocalMutation, trackProductEvent],
  );

  const addTextBlock = useCallback(
    (title: string, collectionId: string | null = null) => {
      const trimmed = title.trim();
      if (!trimmed) return null;

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

  const addSketch = useCallback(
    (title: string, collectionId: string | null = null) => {
      const trimmed = title.trim();
      if (!trimmed) return null;

      const now = Date.now();
      const sketch: Sketch = {
        id: generateId(),
        title: trimmed,
        elements: [],
        collectionId,
        previousCollectionId: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        order: state.sketches.length,
      };
      applyLocalMutation(
        (prev) => ({ ...prev, sketches: [...prev.sketches, sketch] }),
        { action: "addSketch", payload: { sketch } },
      );
      void trackProductEvent("sketch_created", {
        sketches_count_after: state.sketches.length + 1,
        has_collection: Boolean(collectionId),
      });
      return sketch.id;
    },
    [applyLocalMutation, state.sketches.length, trackProductEvent],
  );

  const updateSketchTitle = useCallback(
    (sketchId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketches: prev.sketches.map((sketch) =>
            sketch.id === sketchId
              ? { ...sketch, title: trimmed, updatedAt }
              : sketch,
          ),
        }),
        { action: "renameSketch", payload: { sketchId, title: trimmed, updatedAt } },
      );
    },
    [applyLocalMutation],
  );

  const updateSketchElements = useCallback(
    (sketchId: string, elements: SketchElement[]) => {
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketches: prev.sketches.map((sketch) =>
            sketch.id === sketchId
              ? { ...sketch, elements, updatedAt }
              : sketch,
          ),
        }),
        { action: "editSketch", payload: { sketchId, elements, updatedAt } },
      );
    },
    [applyLocalMutation],
  );

  const updateSketchCollection = useCallback(
    (sketchId: string, collectionId: string | null) => {
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketches: prev.sketches.map((sketch) =>
            sketch.id === sketchId
              ? {
                  ...sketch,
                  collectionId,
                  previousCollectionId: null,
                  archivedAt: null,
                  updatedAt,
                }
              : sketch,
          ),
        }),
        { action: "moveSketch", payload: { sketchId, collectionId, updatedAt } },
      );
    },
    [applyLocalMutation],
  );

  const archiveSketch = useCallback(
    (sketchId: string) => {
      const archivedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketches: prev.sketches.map((sketch) =>
            sketch.id === sketchId
              ? {
                  ...sketch,
                  previousCollectionId:
                    sketch.previousCollectionId ?? sketch.collectionId ?? null,
                  collectionId: null,
                  archivedAt,
                  updatedAt: archivedAt,
                }
              : sketch,
          ),
        }),
        {
          action: "archiveSketch",
          payload: { sketchId, archivedAt, updatedAt: archivedAt },
        },
      );
      void trackProductEvent("sketch_archived");
    },
    [applyLocalMutation, trackProductEvent],
  );

  const restoreSketch = useCallback(
    (sketchId: string) => {
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketches: prev.sketches.map((sketch) =>
            sketch.id === sketchId
              ? {
                  ...sketch,
                  collectionId: sketch.previousCollectionId ?? null,
                  previousCollectionId: null,
                  archivedAt: null,
                  updatedAt,
                }
              : sketch,
          ),
        }),
        { action: "restoreSketch", payload: { sketchId, updatedAt } },
      );
      void trackProductEvent("sketch_restored");
    },
    [applyLocalMutation, trackProductEvent],
  );

  const deleteSketch = useCallback(
    (sketchId: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketches: prev.sketches
            .filter((sketch) => sketch.id !== sketchId)
            .map((sketch, order) => ({ ...sketch, order })),
        }),
        { action: "deleteSketch", payload: { sketchId } },
      );
      void trackProductEvent("sketch_deleted", {
        sketches_count_after: Math.max(state.sketches.length - 1, 0),
      });
    },
    [applyLocalMutation, state.sketches.length, trackProductEvent],
  );

  const addSketchCollection = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const existing = state.sketchCollections.find(
        (collection) =>
          collection.title.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existing) return existing.id;

      const now = Date.now();
      const collection: SketchCollection = {
        id: generateId(),
        title: trimmed,
        createdAt: now,
        updatedAt: now,
        order: state.sketchCollections.length,
      };
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketchCollections: [...prev.sketchCollections, collection],
        }),
        { action: "addSketchCollection", payload: { collection } },
      );
      void trackProductEvent("sketch_collection_created", {
        sketch_collections_count_after: state.sketchCollections.length + 1,
      });
      return collection.id;
    },
    [applyLocalMutation, state.sketchCollections, trackProductEvent],
  );

  const updateSketchCollectionTitle = useCallback(
    (collectionId: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketchCollections: prev.sketchCollections.map((collection) =>
            collection.id === collectionId
              ? { ...collection, title: trimmed, updatedAt }
              : collection,
          ),
        }),
        {
          action: "renameSketchCollection",
          payload: { collectionId, title: trimmed, updatedAt },
        },
      );
    },
    [applyLocalMutation],
  );

  const deleteSketchCollection = useCallback(
    (collectionId: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          sketchCollections: prev.sketchCollections
            .filter((collection) => collection.id !== collectionId)
            .map((collection, order) => ({ ...collection, order })),
          sketches: prev.sketches.map((sketch) =>
            sketch.collectionId === collectionId ||
            sketch.previousCollectionId === collectionId
              ? {
                  ...sketch,
                  collectionId:
                    sketch.collectionId === collectionId
                      ? null
                      : sketch.collectionId,
                  previousCollectionId:
                    sketch.previousCollectionId === collectionId
                      ? null
                      : sketch.previousCollectionId,
                  updatedAt: Date.now(),
                }
              : sketch,
          ),
        }),
        { action: "deleteSketchCollection", payload: { collectionId } },
      );
      void trackProductEvent("sketch_collection_deleted", {
        sketch_collections_count_after: Math.max(
          state.sketchCollections.length - 1,
          0,
        ),
      });
    },
    [applyLocalMutation, state.sketchCollections.length, trackProductEvent],
  );

  const addCalendarEvent = useCallback(
    (
      eventInput: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt" | "order">,
    ) => {
      const trimmed = eventInput.title.trim();
      if (!trimmed) return null;

      const now = Date.now();
      const event: CalendarEvent = {
        ...eventInput,
        id: generateId(),
        title: trimmed,
        description: eventInput.description.trim(),
        location: eventInput.location?.trim() || null,
        recurrence: {
          frequency: eventInput.recurrence.frequency,
          interval: Math.max(1, eventInput.recurrence.interval),
          untilDate: eventInput.recurrence.untilDate || null,
        },
        deletedOccurrenceDates: [],
        createdAt: now,
        updatedAt: now,
        order: state.calendarEvents.length,
      };

      applyLocalMutation(
        (prev) => ({
          ...prev,
          calendarEvents: [...prev.calendarEvents, event],
        }),
        { action: "addCalendarEvent", payload: { event } },
      );
      void trackProductEvent("calendar_event_created", {
        has_category: Boolean(event.categoryId),
        recurrence: event.recurrence.frequency,
      });
      return event.id;
    },
    [applyLocalMutation, state.calendarEvents.length, trackProductEvent],
  );

  const updateCalendarEvent = useCallback(
    (event: CalendarEvent) => {
      const updatedAt = Date.now();
      const nextEvent: CalendarEvent = {
        ...event,
        title: event.title.trim(),
        description: event.description.trim(),
        location: event.location?.trim() || null,
        recurrence: {
          frequency: event.recurrence.frequency,
          interval: Math.max(1, event.recurrence.interval),
          untilDate: event.recurrence.untilDate || null,
        },
        updatedAt,
      };
      if (!nextEvent.title) return;

      applyLocalMutation(
        (prev) => ({
          ...prev,
          calendarEvents: prev.calendarEvents.map((candidate) =>
            candidate.id === nextEvent.id ? nextEvent : candidate,
          ),
        }),
        {
          action: "updateCalendarEvent",
          payload: { eventId: nextEvent.id, event: nextEvent },
        },
      );
    },
    [applyLocalMutation],
  );

  const deleteCalendarEvent = useCallback(
    (eventId: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          calendarEvents: prev.calendarEvents
            .filter((event) => event.id !== eventId)
            .map((event, order) => ({ ...event, order })),
        }),
        { action: "deleteCalendarEvent", payload: { eventId } },
      );
      void trackProductEvent("calendar_event_deleted", {
        events_count_after: Math.max(state.calendarEvents.length - 1, 0),
      });
    },
    [applyLocalMutation, state.calendarEvents.length, trackProductEvent],
  );

  const deleteCalendarOccurrence = useCallback(
    (eventId: string, date: string) => {
      const updatedAt = Date.now();
      applyLocalMutation(
        (prev) => ({
          ...prev,
          calendarEvents: prev.calendarEvents.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  deletedOccurrenceDates: Array.from(
                    new Set([...event.deletedOccurrenceDates, date]),
                  ).sort(),
                  updatedAt,
                }
              : event,
          ),
        }),
        {
          action: "deleteCalendarOccurrence",
          payload: { eventId, date, updatedAt },
        },
      );
      void trackProductEvent("calendar_event_deleted", { scope: "occurrence" });
    },
    [applyLocalMutation, trackProductEvent],
  );

  const deleteCalendarFutureOccurrences = useCallback(
    (eventId: string, fromDate: string) => {
      const updatedAt = Date.now();
      const previousDate = new Date(`${fromDate}T00:00:00`);
      previousDate.setDate(previousDate.getDate() - 1);
      const untilDate = previousDate.toISOString().slice(0, 10);

      applyLocalMutation(
        (prev) => ({
          ...prev,
          calendarEvents: prev.calendarEvents.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  recurrence: {
                    ...event.recurrence,
                    untilDate,
                  },
                  updatedAt,
                }
              : event,
          ),
        }),
        {
          action: "deleteCalendarFutureOccurrences",
          payload: { eventId, fromDate, updatedAt },
        },
      );
      void trackProductEvent("calendar_event_deleted", { scope: "future" });
    },
    [applyLocalMutation, trackProductEvent],
  );

  const addCalendarCategory = useCallback(
    (title: string, color: string) => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const existing = state.calendarCategories.find(
        (category) => category.title.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existing) return existing.id;

      const now = Date.now();
      const category: CalendarCategory = {
        id: generateId(),
        title: trimmed,
        color,
        createdAt: now,
        updatedAt: now,
        order: state.calendarCategories.length,
      };

      applyLocalMutation(
        (prev) => ({
          ...prev,
          calendarCategories: [...prev.calendarCategories, category],
        }),
        { action: "addCalendarCategory", payload: { category } },
      );
      void trackProductEvent("calendar_category_created", {
        calendar_categories_count_after: state.calendarCategories.length + 1,
      });
      return category.id;
    },
    [applyLocalMutation, state.calendarCategories, trackProductEvent],
  );

  const updateCalendarCategory = useCallback(
    (categoryId: string, title: string, color: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const updatedAt = Date.now();

      applyLocalMutation(
        (prev) => ({
          ...prev,
          calendarCategories: prev.calendarCategories.map((category) =>
            category.id === categoryId
              ? { ...category, title: trimmed, color, updatedAt }
              : category,
          ),
        }),
        {
          action: "updateCalendarCategory",
          payload: { categoryId, title: trimmed, color, updatedAt },
        },
      );
    },
    [applyLocalMutation],
  );

  const deleteCalendarCategory = useCallback(
    (categoryId: string) => {
      applyLocalMutation(
        (prev) => ({
          ...prev,
          calendarCategories: prev.calendarCategories
            .filter((category) => category.id !== categoryId)
            .map((category, order) => ({ ...category, order })),
          calendarEvents: prev.calendarEvents.map((event) =>
            event.categoryId === categoryId
              ? { ...event, categoryId: null, updatedAt: Date.now() }
              : event,
          ),
        }),
        { action: "deleteCalendarCategory", payload: { categoryId } },
      );
      void trackProductEvent("calendar_category_deleted", {
        calendar_categories_count_after: Math.max(
          state.calendarCategories.length - 1,
          0,
        ),
      });
    },
    [applyLocalMutation, state.calendarCategories.length, trackProductEvent],
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
    moveItem,
    addItem,
    addSubtask,
    setItemExpanded,
    updateItemText,
    toggleItemStatus,
    softDeleteItem,
    clearAndArchive,
    clearStickyArchivedTasks,
    restoreTaskToTodo,
    deleteTasksPermanently,
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
    addSketch,
    updateSketchTitle,
    updateSketchElements,
    updateSketchCollection,
    archiveSketch,
    restoreSketch,
    deleteSketch,
    addSketchCollection,
    updateSketchCollectionTitle,
    deleteSketchCollection,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    deleteCalendarOccurrence,
    deleteCalendarFutureOccurrences,
    addCalendarCategory,
    updateCalendarCategory,
    deleteCalendarCategory,
    trackProductEvent,
  };
}
