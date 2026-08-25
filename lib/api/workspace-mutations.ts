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
  parentTaskId: id.nullable().optional(),
  subtasksExpanded: z.boolean().optional(),
  createdAt: timestamp,
  clearedAt: timestamp.nullable().optional(),
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

const sketchPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const sketchElementBaseSchema = z.object({
  id,
  color: z.string(),
  strokeWidth: z.number().positive(),
});

const sketchElementSchema = z.discriminatedUnion("type", [
  sketchElementBaseSchema.extend({
    type: z.literal("pen"),
    points: z.array(sketchPointSchema),
  }),
  sketchElementBaseSchema.extend({
    type: z.literal("erase"),
    points: z.array(sketchPointSchema),
    radius: z.number().positive(),
  }),
  sketchElementBaseSchema.extend({
    type: z.enum(["line", "arrow", "rectangle", "ellipse"]),
    start: sketchPointSchema,
    end: sketchPointSchema,
    fillColor: z.string().nullable().optional(),
  }),
  sketchElementBaseSchema.extend({
    type: z.literal("text"),
    point: sketchPointSchema,
    text: z.string(),
    fontSize: z.number().positive(),
  }),
]);

const sketchSchema = z.object({
  id,
  title: z.string(),
  elements: z.array(sketchElementSchema),
  collectionId: id.nullable(),
  previousCollectionId: id.nullable().optional(),
  archivedAt: timestamp.nullable().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  order: z.number().int(),
});

const sketchCollectionSchema = z.object({
  id,
  title: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
  order: z.number().int(),
});

const calendarRecurrenceSchema = z.object({
  frequency: z.enum(["none", "daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().positive(),
  untilDate: z.string().nullable().optional(),
});

const calendarEventSourceSchema = z.object({
  type: z.enum(["manual", "natural-language"]),
  text: z.string().optional(),
  section: z.enum(["stickies", "memos", "sketches"]).optional(),
  sourceId: id.nullable().optional(),
});

const calendarEventSchema = z.object({
  id,
  title: z.string(),
  date: z.string(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  categoryId: id.nullable(),
  recurrence: calendarRecurrenceSchema,
  description: z.string(),
  location: z.string().nullable(),
  deletedOccurrenceDates: z.array(z.string()),
  source: calendarEventSourceSchema.nullable().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  order: z.number().int(),
});

const calendarCategorySchema = z.object({
  id,
  title: z.string(),
  color: z.string(),
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
  "setTaskExpanded",
  "setTaskStatus",
  "moveTask",
  "reorderTasks",
  "clearArchivedTasks",
  "clearStickyArchivedTasks",
  "restoreTask",
  "deleteTasksPermanently",
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
  "addSketch",
  "renameSketch",
  "editSketch",
  "moveSketch",
  "archiveSketch",
  "restoreSketch",
  "deleteSketch",
  "addSketchCollection",
  "renameSketchCollection",
  "deleteSketchCollection",
  "addCalendarEvent",
  "updateCalendarEvent",
  "deleteCalendarEvent",
  "deleteCalendarOccurrence",
  "deleteCalendarFutureOccurrences",
  "addCalendarCategory",
  "updateCalendarCategory",
  "deleteCalendarCategory",
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
    action: z.literal("setTaskExpanded"),
    payload: z.object({ stickyId: id, taskId: id, expanded: z.boolean() }),
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
    payload: z.object({ clearedAt: timestamp.optional() }),
  }),
  z.object({
    action: z.literal("clearStickyArchivedTasks"),
    payload: z.object({ stickyId: id, clearedAt: timestamp.optional() }),
  }),
  z.object({
    action: z.literal("restoreTask"),
    payload: z.object({
      stickyId: id,
      taskId: id,
      order: z.number().int(),
    }),
  }),
  z.object({
    action: z.literal("deleteTasksPermanently"),
    payload: z.object({ taskIds: z.array(id) }),
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
  z.object({
    action: z.literal("addSketch"),
    payload: z.object({ sketch: sketchSchema }),
  }),
  z.object({
    action: z.literal("renameSketch"),
    payload: z.object({ sketchId: id, title: z.string(), updatedAt: timestamp }),
  }),
  z.object({
    action: z.literal("editSketch"),
    payload: z.object({
      sketchId: id,
      elements: z.array(sketchElementSchema),
      updatedAt: timestamp,
    }),
  }),
  z.object({
    action: z.literal("moveSketch"),
    payload: z.object({
      sketchId: id,
      collectionId: id.nullable(),
      updatedAt: timestamp,
    }),
  }),
  z.object({
    action: z.literal("archiveSketch"),
    payload: z.object({
      sketchId: id,
      archivedAt: timestamp,
      updatedAt: timestamp,
    }),
  }),
  z.object({
    action: z.literal("restoreSketch"),
    payload: z.object({ sketchId: id, updatedAt: timestamp }),
  }),
  z.object({
    action: z.literal("deleteSketch"),
    payload: z.object({ sketchId: id }),
  }),
  z.object({
    action: z.literal("addSketchCollection"),
    payload: z.object({ collection: sketchCollectionSchema }),
  }),
  z.object({
    action: z.literal("renameSketchCollection"),
    payload: z.object({
      collectionId: id,
      title: z.string(),
      updatedAt: timestamp,
    }),
  }),
  z.object({
    action: z.literal("deleteSketchCollection"),
    payload: z.object({ collectionId: id }),
  }),
  z.object({
    action: z.literal("addCalendarEvent"),
    payload: z.object({ event: calendarEventSchema }),
  }),
  z.object({
    action: z.literal("updateCalendarEvent"),
    payload: z.object({ eventId: id, event: calendarEventSchema }),
  }),
  z.object({
    action: z.literal("deleteCalendarEvent"),
    payload: z.object({ eventId: id }),
  }),
  z.object({
    action: z.literal("deleteCalendarOccurrence"),
    payload: z.object({ eventId: id, date: z.string(), updatedAt: timestamp }),
  }),
  z.object({
    action: z.literal("deleteCalendarFutureOccurrences"),
    payload: z.object({ eventId: id, fromDate: z.string(), updatedAt: timestamp }),
  }),
  z.object({
    action: z.literal("addCalendarCategory"),
    payload: z.object({ category: calendarCategorySchema }),
  }),
  z.object({
    action: z.literal("updateCalendarCategory"),
    payload: z.object({
      categoryId: id,
      title: z.string(),
      color: z.string(),
      updatedAt: timestamp,
    }),
  }),
  z.object({
    action: z.literal("deleteCalendarCategory"),
    payload: z.object({ categoryId: id }),
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
