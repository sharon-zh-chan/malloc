import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.number().int().nonnegative();

const stickySchema = z.object({
  id,
  title: z.string(),
  order: z.number().int(),
});

const taskSchema = z.object({
  id,
  text: z.string(),
  status: z.enum(["todo", "completed", "deleted"]),
  createdAt: timestamp,
  order: z.number().int(),
});

const memoSchema = z.object({
  id,
  title: z.string(),
  content: z.string(),
  collectionId: id.nullable(),
  previousCollectionId: id.nullable().optional(),
  archivedAt: timestamp.nullable().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  order: z.number().int(),
});

const memoCollectionSchema = z.object({
  id,
  title: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
  order: z.number().int(),
});

export const workspaceMutationActionSchema = z.enum([
  "setTimeRange",
  "addSticky",
  "renameSticky",
  "deleteSticky",
  "reorderStickies",
  "addTask",
  "editTask",
  "setTaskStatus",
  "moveTask",
  "reorderTasks",
  "clearArchivedTasks",
  "clearStickyArchivedTasks",
  "addMemo",
  "renameMemo",
  "editMemo",
  "moveMemo",
  "archiveMemo",
  "restoreMemo",
  "deleteMemo",
  "addMemoCollection",
  "renameMemoCollection",
  "deleteMemoCollection",
]);

export const workspaceMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setTimeRange"),
    payload: z.object({ timeRange: z.string() }),
  }),
  z.object({
    action: z.literal("addSticky"),
    payload: z.object({ sticky: stickySchema }),
  }),
  z.object({
    action: z.literal("renameSticky"),
    payload: z.object({ stickyId: id, title: z.string() }),
  }),
  z.object({
    action: z.literal("deleteSticky"),
    payload: z.object({ stickyId: id }),
  }),
  z.object({
    action: z.literal("reorderStickies"),
    payload: z.object({ stickyIds: z.array(id) }),
  }),
  z.object({
    action: z.literal("addTask"),
    payload: z.object({ stickyId: id, task: taskSchema }),
  }),
  z.object({
    action: z.literal("editTask"),
    payload: z.object({ stickyId: id, taskId: id, text: z.string() }),
  }),
  z.object({
    action: z.literal("setTaskStatus"),
    payload: z.object({
      stickyId: id,
      taskId: id,
      status: z.enum(["todo", "completed", "deleted"]),
      order: z.number().int(),
    }),
  }),
  z.object({
    action: z.literal("moveTask"),
    payload: z.object({
      fromStickyId: id,
      toStickyId: id,
      taskId: id,
      order: z.number().int(),
    }),
  }),
  z.object({
    action: z.literal("reorderTasks"),
    payload: z.object({ stickyId: id, taskIds: z.array(id) }),
  }),
  z.object({
    action: z.literal("clearArchivedTasks"),
    payload: z.object({}),
  }),
  z.object({
    action: z.literal("clearStickyArchivedTasks"),
    payload: z.object({ stickyId: id }),
  }),
  z.object({
    action: z.literal("addMemo"),
    payload: z.object({ memo: memoSchema }),
  }),
  z.object({
    action: z.literal("renameMemo"),
    payload: z.object({ memoId: id, title: z.string(), updatedAt: timestamp }),
  }),
  z.object({
    action: z.literal("editMemo"),
    payload: z.object({ memoId: id, content: z.string(), updatedAt: timestamp }),
  }),
  z.object({
    action: z.literal("moveMemo"),
    payload: z.object({
      memoId: id,
      collectionId: id.nullable(),
      updatedAt: timestamp,
    }),
  }),
  z.object({
    action: z.literal("archiveMemo"),
    payload: z.object({ memoId: id, archivedAt: timestamp, updatedAt: timestamp }),
  }),
  z.object({
    action: z.literal("restoreMemo"),
    payload: z.object({ memoId: id, updatedAt: timestamp }),
  }),
  z.object({
    action: z.literal("deleteMemo"),
    payload: z.object({ memoId: id }),
  }),
  z.object({
    action: z.literal("addMemoCollection"),
    payload: z.object({ collection: memoCollectionSchema }),
  }),
  z.object({
    action: z.literal("renameMemoCollection"),
    payload: z.object({
      collectionId: id,
      title: z.string(),
      updatedAt: timestamp,
    }),
  }),
  z.object({
    action: z.literal("deleteMemoCollection"),
    payload: z.object({ collectionId: id }),
  }),
]);

export const workspaceMutationRequestSchema = z.object({
  client_mutation_id: id,
  action: workspaceMutationActionSchema,
  payload: z.record(z.unknown()),
}).superRefine((request, context) => {
  const result = workspaceMutationSchema.safeParse({
    action: request.action,
    payload: request.payload,
  });

  if (!result.success) {
    for (const issue of result.error.issues) {
      context.addIssue(issue);
    }
  }
});

export type WorkspaceMutation = z.infer<typeof workspaceMutationSchema>;
