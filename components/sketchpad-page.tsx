"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BrushCleaning,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Eraser,
  FolderPlus,
  Menu,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import type {
  Sketch,
  SketchCollection,
  SketchElement,
  SketchPoint,
  SketchTool,
} from "@/lib/types";
import { MemoCollectionPicker } from "./memo-collection-picker";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;
const DEFAULT_TITLE = "Untitled sketch";
const UNFILED_LABEL = "No folder";
const DELETED_LABEL = "Deleted";
const UNFILED_FOLDER_KEY = "__unfiled";
const DELETED_FOLDER_KEY = "__deleted";
const COLORS = [
  { value: "#111111", label: "Black" },
  { value: "#e03131", label: "Red" },
  { value: "#f08c00", label: "Orange" },
  { value: "#2f9e44", label: "Green" },
  { value: "#1971c2", label: "Blue" },
  { value: "#7048e8", label: "Purple" },
  { value: "#d6336c", label: "Pink" },
  { value: "#868e96", label: "Grey" },
];
const PEN_SIZES = [1, 2.5, 4.5, 7, 11];
const TEXT_SIZES = [22, 30, 40, 54, 72];
const ERASER_SIZES = [12, 24, 40, 64, 96];
const SIZE_LABELS = ["Smallest", "Small", "Medium", "Large", "Largest"];

const TOOLS: Array<{
  value: SketchTool;
  label: string;
  icon: typeof Pencil;
}> = [
  { value: "select", label: "Move", icon: MousePointer2 },
  { value: "pen", label: "Pen", icon: Pencil },
  { value: "text", label: "Text", icon: Type },
  { value: "line", label: "Line", icon: Minus },
  { value: "arrow", label: "Arrow", icon: ArrowRight },
  { value: "rectangle", label: "Rectangle", icon: Square },
  { value: "ellipse", label: "Ellipse", icon: Circle },
  { value: "eraser", label: "Eraser", icon: Eraser },
];

type SizedTool = Extract<SketchTool, "pen" | "text" | "eraser">;

function isSizedTool(tool: SketchTool): tool is SizedTool {
  return tool === "pen" || tool === "text" || tool === "eraser";
}

type SketchpadPageProps = {
  sketches: Sketch[];
  collections: SketchCollection[];
  selectedSketchId: string | null;
  onSelectSketch: (sketchId: string | null) => void;
  onAddSketch: (title: string, collectionId?: string | null) => string | null;
  onUpdateTitle: (sketchId: string, title: string) => void;
  onUpdateElements: (sketchId: string, elements: SketchElement[]) => void;
  onUpdateCollection: (sketchId: string, collectionId: string | null) => void;
  onArchiveSketch: (sketchId: string) => void;
  onRestoreSketch: (sketchId: string) => void;
  onDeleteSketchPermanently: (sketchId: string) => void;
  onAddCollection: (title: string) => string | null;
  onUpdateCollectionTitle: (collectionId: string, title: string) => void;
  onDeleteCollection: (collectionId: string) => void;
};

function generateId() {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

function linePath(points: SketchPoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.reduce(
    (path, point, index) =>
      `${path}${index === 0 ? "M" : " L"} ${point.x} ${point.y}`,
    "",
  );
}

function distanceToSegment(
  point: SketchPoint,
  start: SketchPoint,
  end: SketchPoint,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(
    point.x - (start.x + projection * dx),
    point.y - (start.y + projection * dy),
  );
}

function eraserHitsElement(
  element: SketchElement,
  point: SketchPoint,
  radius: number,
) {
  const tolerance = radius + element.strokeWidth / 2;

  if (element.type === "erase") return false;

  if (element.type === "pen") {
    if (element.points.length === 1) {
      return distanceToSegment(point, element.points[0], element.points[0]) <= tolerance;
    }
    return element.points.some((current, index) => {
      if (index === 0) return false;
      return distanceToSegment(point, element.points[index - 1], current) <= tolerance;
    });
  }

  if (element.type === "text") {
    const lines = element.text.split("\n");
    const longestLine = Math.max(...lines.map((line) => line.length), 1);
    const width = Math.max(element.fontSize * 0.55 * longestLine, element.fontSize);
    const bottom = element.point.y + (lines.length - 1) * element.fontSize * 1.2;
    return (
      point.x >= element.point.x - radius &&
      point.x <= element.point.x + width + radius &&
      point.y >= element.point.y - element.fontSize - radius &&
      point.y <= bottom + radius
    );
  }

  if (element.type === "line" || element.type === "arrow") {
    return distanceToSegment(point, element.start, element.end) <= tolerance;
  }

  const left = Math.min(element.start.x, element.end.x);
  const right = Math.max(element.start.x, element.end.x);
  const top = Math.min(element.start.y, element.end.y);
  const bottom = Math.max(element.start.y, element.end.y);

  if (element.type === "rectangle") {
    return [
      [{ x: left, y: top }, { x: right, y: top }],
      [{ x: right, y: top }, { x: right, y: bottom }],
      [{ x: right, y: bottom }, { x: left, y: bottom }],
      [{ x: left, y: bottom }, { x: left, y: top }],
    ].some(([start, end]) => distanceToSegment(point, start, end) <= tolerance);
  }

  const radiusX = (right - left) / 2;
  const radiusY = (bottom - top) / 2;
  if (radiusX === 0 || radiusY === 0) return false;
  const center = { x: left + radiusX, y: top + radiusY };
  const angle = Math.atan2(
    (point.y - center.y) / radiusY,
    (point.x - center.x) / radiusX,
  );
  const boundary = {
    x: center.x + radiusX * Math.cos(angle),
    y: center.y + radiusY * Math.sin(angle),
  };
  return Math.hypot(point.x - boundary.x, point.y - boundary.y) <= tolerance;
}

function moveElement(element: SketchElement, dx: number, dy: number): SketchElement {
  if (element.type === "pen" || element.type === "erase") {
    return {
      ...element,
      points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    };
  }
  if (element.type === "text") {
    return {
      ...element,
      point: { x: element.point.x + dx, y: element.point.y + dy },
    };
  }
  return {
    ...element,
    start: { x: element.start.x + dx, y: element.start.y + dy },
    end: { x: element.end.x + dx, y: element.end.y + dy },
  };
}

function elementBounds(element: SketchElement) {
  if (element.type === "pen" || element.type === "erase") {
    const xs = element.points.map((point) => point.x);
    const ys = element.points.map((point) => point.y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  }
  if (element.type === "text") {
    const lines = element.text.split("\n");
    const longestLine = Math.max(...lines.map((line) => line.length), 1);
    return {
      left: element.point.x,
      right:
        element.point.x +
        Math.max(element.fontSize * 0.55 * longestLine, element.fontSize),
      top: element.point.y - element.fontSize,
      bottom: element.point.y + (lines.length - 1) * element.fontSize * 1.2,
    };
  }
  return {
    left: Math.min(element.start.x, element.end.x),
    right: Math.max(element.start.x, element.end.x),
    top: Math.min(element.start.y, element.end.y),
    bottom: Math.max(element.start.y, element.end.y),
  };
}

function renderSelection(element: SketchElement) {
  const bounds = elementBounds(element);
  const padding = 12;
  const width = Math.max(bounds.right - bounds.left, 12);
  const height = Math.max(bounds.bottom - bounds.top, 12);
  return (
    <rect
      x={bounds.left - padding}
      y={bounds.top - padding}
      width={width + padding * 2}
      height={height + padding * 2}
      fill="rgba(25, 113, 194, 0.06)"
      stroke="#1971c2"
      strokeWidth="1.5"
      strokeDasharray="7 5"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}

function renderElement(element: SketchElement) {
  const common = {
    stroke: element.color,
    strokeWidth: element.strokeWidth,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    "data-sketch-element": element.id,
  };

  if (element.type === "erase") return null;

  if (element.type === "pen") {
    return <path key={element.id} d={linePath(element.points)} {...common} />;
  }

  if (element.type === "text") {
    const lines = element.text.split("\n");
    return (
      <text
        key={element.id}
        x={element.point.x}
        y={element.point.y}
        fill={element.color}
        fontSize={element.fontSize}
        fontFamily="Arial, Helvetica, sans-serif"
        data-sketch-element={element.id}
      >
        {lines.map((line, index) => (
          <tspan
            key={`${element.id}-line-${index}`}
            x={element.point.x}
            dy={index === 0 ? 0 : element.fontSize * 1.2}
          >
            {line || "\u00a0"}
          </tspan>
        ))}
      </text>
    );
  }

  const x = Math.min(element.start.x, element.end.x);
  const y = Math.min(element.start.y, element.end.y);
  const width = Math.abs(element.end.x - element.start.x);
  const height = Math.abs(element.end.y - element.start.y);

  if (element.type === "rectangle") {
    return (
      <rect
        key={element.id}
        x={x}
        y={y}
        width={width}
        height={height}
        {...common}
        fill={element.fillColor ?? "none"}
      />
    );
  }

  if (element.type === "ellipse") {
    return (
      <ellipse
        key={element.id}
        cx={x + width / 2}
        cy={y + height / 2}
        rx={width / 2}
        ry={height / 2}
        {...common}
        fill={element.fillColor ?? "none"}
      />
    );
  }

  if (element.type === "arrow") {
    const angle = Math.atan2(
      element.end.y - element.start.y,
      element.end.x - element.start.x,
    );
    const arrowSize = 18;
    const left = {
      x: element.end.x - arrowSize * Math.cos(angle - Math.PI / 6),
      y: element.end.y - arrowSize * Math.sin(angle - Math.PI / 6),
    };
    const right = {
      x: element.end.x - arrowSize * Math.cos(angle + Math.PI / 6),
      y: element.end.y - arrowSize * Math.sin(angle + Math.PI / 6),
    };
    return (
      <g key={element.id} data-sketch-element={element.id}>
        <line
          x1={element.start.x}
          y1={element.start.y}
          x2={element.end.x}
          y2={element.end.y}
          {...common}
        />
        <path
          d={`M ${left.x} ${left.y} L ${element.end.x} ${element.end.y} L ${right.x} ${right.y}`}
          {...common}
        />
      </g>
    );
  }

  return (
    <line
      key={element.id}
      x1={element.start.x}
      y1={element.start.y}
      x2={element.end.x}
      y2={element.end.y}
      {...common}
    />
  );
}

function renderEraseMask(element: Extract<SketchElement, { type: "erase" }>) {
  const maskId = `sketch-erase-${element.id}`;
  const firstPoint = element.points[0];
  return (
    <mask
      key={maskId}
      id={maskId}
      x={0}
      y={0}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      maskUnits="userSpaceOnUse"
    >
      <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="white" />
      {firstPoint && (
        <circle cx={firstPoint.x} cy={firstPoint.y} r={element.radius} fill="black" />
      )}
      {element.points.length > 1 && (
        <path
          d={linePath(element.points)}
          fill="none"
          stroke="black"
          strokeWidth={element.radius * 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </mask>
  );
}

function renderDrawingLayers(elements: SketchElement[]) {
  let layers: ReactNode[] = [];
  for (const element of elements) {
    if (element.type === "erase") {
      layers = [
        <g key={`erased-layer-${element.id}`} mask={`url(#sketch-erase-${element.id})`}>
          {layers}
        </g>,
      ];
    } else {
      layers.push(renderElement(element));
    }
  }
  return layers;
}

function DrawingCanvas({
  sketch,
  onChange,
}: {
  sketch: Sketch;
  onChange: (elements: SketchElement[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const cancellingTextEditRef = useRef(false);
  const drawingRef = useRef(false);
  const erasingRef = useRef(false);
  const movingRef = useRef(false);
  const moveChangedRef = useRef(false);
  const moveLastPointRef = useRef<SketchPoint | null>(null);
  const moveStartRef = useRef<SketchElement[]>(sketch.elements);
  const moveWorkingRef = useRef<SketchElement[]>(sketch.elements);
  const elementsRef = useRef<SketchElement[]>(sketch.elements);
  const historyRef = useRef<SketchElement[][]>([sketch.elements]);
  const historyIndexRef = useRef(0);
  const [elements, setElements] = useState<SketchElement[]>(sketch.elements);
  const [draft, setDraft] = useState<SketchElement | null>(null);
  const [tool, setTool] = useState<SketchTool>("pen");
  const [toolSizeIndexes, setToolSizeIndexes] = useState<Record<SizedTool, number>>({
    pen: 2,
    text: 2,
    eraser: 2,
  });
  const [openSizeMenu, setOpenSizeMenu] = useState<SizedTool | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [fillColor, setFillColor] = useState<string | null>(null);
  const [shapeColorTarget, setShapeColorTarget] = useState<"stroke" | "fill">(
    "stroke",
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [textPoint, setTextPoint] = useState<SketchPoint | null>(null);
  const [textPosition, setTextPosition] = useState<SketchPoint | null>(null);
  const [textValue, setTextValue] = useState("");
  const [textPreviewFontSize, setTextPreviewFontSize] = useState(16);
  const [textEditorFontSize, setTextEditorFontSize] = useState(TEXT_SIZES[2]);
  const [textEditorColor, setTextEditorColor] = useState(COLORS[0].value);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [eraserPoint, setEraserPoint] = useState<SketchPoint | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const penSize = PEN_SIZES[toolSizeIndexes.pen];
  const textSize = TEXT_SIZES[toolSizeIndexes.text];
  const eraserSize = ERASER_SIZES[toolSizeIndexes.eraser];
  const shapeToolActive = tool === "rectangle" || tool === "ellipse";
  const activePaletteColor =
    shapeToolActive && shapeColorTarget === "fill" ? fillColor : color;
  const selectedElement = elements.find(
    (element) => element.id === selectedElementId,
  );
  const elementsWithoutEditingText = editingTextId
    ? elements.filter((element) => element.id !== editingTextId)
    : elements;
  const elementsWithEraseDraft =
    draft?.type === "erase"
      ? [...elementsWithoutEditingText, draft]
      : elementsWithoutEditingText;
  const eraseElements = elementsWithEraseDraft.filter(
    (element): element is Extract<SketchElement, { type: "erase" }> =>
      element.type === "erase",
  );
  const textLines = textValue.split("\n");
  const longestTextLine = Math.max(
    ...textLines.map((line) => line.length),
    1,
  );

  useEffect(() => {
    setElements(sketch.elements);
    elementsRef.current = sketch.elements;
    setDraft(null);
    setTextPoint(null);
    setTextPosition(null);
    setTextPreviewFontSize(16);
    setEditingTextId(null);
    cancellingTextEditRef.current = false;
    setSelectedElementId(null);
    historyRef.current = [sketch.elements];
    historyIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
  }, [sketch.id]);

  useEffect(() => {
    if (!textPoint) return;
    const frame = window.requestAnimationFrame(() => {
      textInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [textPoint]);

  useEffect(() => {
    if (!openSizeMenu) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest("[data-size-menu]")) setOpenSizeMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenSizeMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openSizeMenu]);

  useEffect(() => {
    if (
      selectedElementId &&
      !elements.some((element) => element.id === selectedElementId)
    ) {
      setSelectedElementId(null);
    }
  }, [elements, selectedElementId]);

  const pointFromEvent = (
    event:
      | ReactPointerEvent<SVGSVGElement>
      | ReactMouseEvent<SVGSVGElement>,
  ) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: point.x, y: point.y };
  };

  const findTextAtPoint = (point: SketchPoint) =>
    [...elementsRef.current]
      .reverse()
      .find(
        (element): element is Extract<SketchElement, { type: "text" }> =>
          element.type === "text" && eraserHitsElement(element, point, 6),
      );

  const openExistingTextEditor = (
    element: Extract<SketchElement, { type: "text" }>,
    svg: SVGSVGElement,
  ) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const screenPoint = new DOMPoint(
      element.point.x,
      element.point.y,
    ).matrixTransform(matrix);
    const rect = svg.getBoundingClientRect();
    const canvasScale = Math.hypot(matrix.c, matrix.d);

    cancellingTextEditRef.current = false;
    setSelectedElementId(null);
    setEditingTextId(element.id);
    setTextPoint(element.point);
    setTextPosition({
      x: screenPoint.x - rect.left,
      y: screenPoint.y - rect.top,
    });
    setTextValue(element.text);
    setTextEditorFontSize(element.fontSize);
    setTextEditorColor(element.color);
    setTextPreviewFontSize(Math.max(element.fontSize * canvasScale, 8));
  };

  const commit = (next: SketchElement[]) => {
    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push(next);
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
    setElements(next);
    elementsRef.current = next;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
    onChange(next);
  };

  const undo = () => {
    if (historyIndexRef.current === 0) return;
    historyIndexRef.current -= 1;
    const next = historyRef.current[historyIndexRef.current];
    setElements(next);
    elementsRef.current = next;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(true);
    onChange(next);
  };

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = historyRef.current[historyIndexRef.current];
    setElements(next);
    elementsRef.current = next;
    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    onChange(next);
  };

  useEffect(() => {
    const handleCanvasShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (editingText) return;

      if (event.key === "Escape") {
        setSelectedElementId(null);
        setOpenSizeMenu(null);
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (!modifier || (key !== "z" && key !== "y")) return;

      event.preventDefault();
      const wantsRedo = key === "y" || (key === "z" && event.shiftKey);
      if (wantsRedo) {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        historyIndexRef.current += 1;
      } else {
        if (historyIndexRef.current === 0) return;
        historyIndexRef.current -= 1;
      }

      const next = historyRef.current[historyIndexRef.current];
      setElements(next);
      elementsRef.current = next;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      onChange(next);
    };

    window.addEventListener("keydown", handleCanvasShortcut);
    return () => window.removeEventListener("keydown", handleCanvasShortcut);
  }, [onChange]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const point = pointFromEvent(event);

    if (tool === "select") {
      event.preventDefault();
      const selected = [...elementsRef.current]
        .reverse()
        .find((element) => eraserHitsElement(element, point, 14));
      setSelectedElementId(selected?.id ?? null);
      if (!selected) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      movingRef.current = true;
      moveChangedRef.current = false;
      moveLastPointRef.current = point;
      moveStartRef.current = elementsRef.current;
      moveWorkingRef.current = elementsRef.current;
      return;
    }

    if (tool === "text") {
      event.preventDefault();
      const existingText = findTextAtPoint(point);
      if (existingText) {
        openExistingTextEditor(existingText, event.currentTarget);
        return;
      }

      cancellingTextEditRef.current = false;
      setEditingTextId(null);
      setTextPoint(point);
      const rect = event.currentTarget.getBoundingClientRect();
      const matrix = event.currentTarget.getScreenCTM();
      const canvasScale = matrix ? Math.hypot(matrix.c, matrix.d) : 1;
      setTextPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      setTextPreviewFontSize(Math.max(textSize * canvasScale, 8));
      setTextEditorFontSize(textSize);
      setTextEditorColor(color);
      setTextValue("");
      return;
    }

    if (tool === "eraser") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      erasingRef.current = true;
      setSelectedElementId(null);
      setDraft({
        id: generateId(),
        type: "erase",
        points: [point],
        radius: eraserSize,
        color: "#000000",
        strokeWidth: eraserSize * 2,
      });
      setEraserPoint(point);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const base = {
      id: generateId(),
      color,
      strokeWidth: tool === "pen" ? penSize : 2.5,
    };
    setDraft(
      tool === "pen"
        ? { ...base, type: "pen", points: [point] }
        : tool === "rectangle" || tool === "ellipse"
          ? { ...base, type: tool, start: point, end: point, fillColor }
          : { ...base, type: tool, start: point, end: point },
    );
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    if (tool === "select") {
      if (!movingRef.current || !selectedElementId || !moveLastPointRef.current) {
        return;
      }
      const dx = point.x - moveLastPointRef.current.x;
      const dy = point.y - moveLastPointRef.current.y;
      if (dx === 0 && dy === 0) return;
      const next = moveWorkingRef.current.map((element) =>
        element.id === selectedElementId ? moveElement(element, dx, dy) : element,
      );
      moveWorkingRef.current = next;
      moveLastPointRef.current = point;
      moveChangedRef.current = true;
      setElements(next);
      elementsRef.current = next;
      return;
    }
    if (tool === "eraser") {
      setEraserPoint(point);
      if (erasingRef.current && draft?.type === "erase") {
        const previous = draft.points[draft.points.length - 1];
        if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 2) {
          setDraft({ ...draft, points: [...draft.points, point] });
        }
      }
      return;
    }
    if (!drawingRef.current || !draft) return;
    if (draft.type === "pen") {
      const previous = draft.points[draft.points.length - 1];
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;
      setDraft({ ...draft, points: [...draft.points, point] });
      return;
    }
    if (
      draft.type === "line" ||
      draft.type === "arrow" ||
      draft.type === "rectangle" ||
      draft.type === "ellipse"
    ) {
      setDraft({ ...draft, end: point });
    }
  };

  const handleDoubleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (tool !== "select") return;
    const existingText = findTextAtPoint(pointFromEvent(event));
    if (!existingText) return;
    event.preventDefault();
    openExistingTextEditor(existingText, event.currentTarget);
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (movingRef.current) {
      movingRef.current = false;
      moveLastPointRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (moveChangedRef.current) {
        commit(moveWorkingRef.current);
      } else {
        setElements(moveStartRef.current);
        elementsRef.current = moveStartRef.current;
      }
      return;
    }
    if (erasingRef.current) {
      erasingRef.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (draft?.type === "erase") commit([...elementsRef.current, draft]);
      setDraft(null);
      return;
    }
    if (!drawingRef.current || !draft) return;
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const meaningful =
      draft.type === "pen"
        ? draft.points.length > 1
        : (draft.type === "line" ||
              draft.type === "arrow" ||
              draft.type === "rectangle" ||
              draft.type === "ellipse") &&
            Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y) > 3;
    if (meaningful) commit([...elements, draft]);
    setDraft(null);
  };

  const saveText = () => {
    if (cancellingTextEditRef.current) {
      cancellingTextEditRef.current = false;
      return;
    }
    const trimmed = textValue.trim();
    if (textPoint && trimmed) {
      if (editingTextId) {
        commit(
          elements.map((element) =>
            element.id === editingTextId && element.type === "text"
              ? { ...element, text: trimmed }
              : element,
          ),
        );
      } else {
        commit([
          ...elements,
          {
            id: generateId(),
            type: "text",
            point: textPoint,
            text: trimmed,
            fontSize: textEditorFontSize,
            color: textEditorColor,
            strokeWidth: 1,
          },
        ]);
      }
    }
    setTextPoint(null);
    setTextPosition(null);
    setTextValue("");
    setEditingTextId(null);
  };

  const cancelTextEdit = () => {
    cancellingTextEditRef.current = true;
    setTextPoint(null);
    setTextPosition(null);
    setTextValue("");
    setEditingTextId(null);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mt-3 flex flex-wrap items-center gap-1 border-y border-primary/20 py-2">
        <div className="flex max-w-full flex-wrap gap-1" aria-label="Drawing tools">
          {TOOLS.map(({ value, label, icon: Icon }) => {
            const active = tool === value;
            const toolClass = active
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-primary/10 hover:text-foreground";

            if (!isSizedTool(value)) {
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setTool(value);
                    setOpenSizeMenu(null);
                  }}
                  aria-pressed={active}
                  title={label}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors ${toolClass}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden xl:inline">{label}</span>
                </button>
              );
            }

            const selectedSize = toolSizeIndexes[value];
            return (
              <div key={value} className="relative flex shrink-0" data-size-menu>
                <button
                  type="button"
                  onClick={() => {
                    setTool(value);
                    setOpenSizeMenu(null);
                  }}
                  aria-pressed={active}
                  title={`${label} · ${SIZE_LABELS[selectedSize]}`}
                  className={`flex h-8 items-center gap-1.5 rounded-l-md px-2 text-xs font-semibold transition-colors ${toolClass}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden xl:inline">{label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTool(value);
                    setOpenSizeMenu((current) => (current === value ? null : value));
                  }}
                  aria-label={`Choose ${label.toLowerCase()} size`}
                  aria-haspopup="menu"
                  aria-expanded={openSizeMenu === value}
                  className={`flex h-8 items-center rounded-r-md px-1 transition-colors ${toolClass}`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {openSizeMenu === value && (
                  <div
                    role="menu"
                    aria-label={`${label} sizes`}
                    className="absolute left-0 top-full z-40 mt-1 w-[76px] rounded-md border border-primary/20 bg-card p-1 text-foreground shadow-md"
                  >
                    {SIZE_LABELS.map((sizeLabel, index) => (
                      <button
                        key={sizeLabel}
                        type="button"
                        role="menuitemradio"
                        aria-label={sizeLabel}
                        aria-checked={selectedSize === index}
                        title={sizeLabel}
                        onClick={() => {
                          setToolSizeIndexes((current) => ({
                            ...current,
                            [value]: index,
                          }));
                          setTool(value);
                          setOpenSizeMenu(null);
                        }}
                        className={`relative flex w-full items-center justify-center px-2 py-1.5 hover:bg-muted ${
                          selectedSize === index ? "font-bold" : ""
                        }`}
                      >
                        <span className="flex h-6 w-9 shrink-0 items-center justify-center">
                          {value === "pen" ? (
                            <span
                              className="block w-8 rounded-full bg-current"
                              style={{ height: Math.min(PEN_SIZES[index], 10) }}
                            />
                          ) : value === "text" ? (
                            <span style={{ fontSize: 10 + index * 2.5, lineHeight: 1 }}>A</span>
                          ) : (
                            <span
                              className="block rounded-full border border-current"
                              style={{ width: 7 + index * 3, height: 7 + index * 3 }}
                            />
                          )}
                        </span>
                        {selectedSize === index && (
                          <Check className="absolute right-1 h-3 w-3" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mx-1 h-5 w-px bg-primary/20" aria-hidden="true" />
        {shapeToolActive && (
          <div
            className="flex items-center rounded-md border border-primary/20"
            role="group"
            aria-label="Shape colour target"
          >
            <button
              type="button"
              onClick={() => setShapeColorTarget("stroke")}
              aria-pressed={shapeColorTarget === "stroke"}
              className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                shapeColorTarget === "stroke"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              }`}
            >
              Outline
            </button>
            <button
              type="button"
              onClick={() => setShapeColorTarget("fill")}
              aria-pressed={shapeColorTarget === "fill"}
              className={`border-l border-primary/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                shapeColorTarget === "fill"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              }`}
            >
              Fill
            </button>
          </div>
        )}
        <div
          className="flex items-center gap-1.5"
          aria-label={
            shapeToolActive && shapeColorTarget === "fill"
              ? "Shape fill colour"
              : "Drawing colour"
          }
        >
          {shapeToolActive && shapeColorTarget === "fill" && (
            <button
              type="button"
              title="No fill"
              aria-label="No fill"
              aria-pressed={fillColor === null}
              onClick={() => setFillColor(null)}
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                fillColor === null
                  ? "border-foreground ring-2 ring-background"
                  : "border-background"
              }`}
              style={{
                backgroundColor: "white",
                backgroundImage:
                  "conic-gradient(#d1d5db 25%, white 0 50%, #d1d5db 0 75%, white 0)",
                backgroundSize: "8px 8px",
              }}
            />
          )}
          {COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.label}
              aria-label={option.label}
              aria-pressed={activePaletteColor === option.value}
              onClick={() => {
                if (shapeToolActive && shapeColorTarget === "fill") {
                  setFillColor(option.value);
                } else {
                  setColor(option.value);
                }
              }}
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                activePaletteColor === option.value
                  ? "border-foreground ring-2 ring-background"
                  : "border-background"
              }`}
              style={{ backgroundColor: option.value }}
            />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl/Cmd+Z)"
            aria-label="Undo"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl/Cmd+Shift+Z or Ctrl+Y)"
            aria-label="Redo"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (elements.length > 0 && window.confirm("Clear this whole sketch?")) {
                commit([]);
              }
            }}
            disabled={elements.length === 0}
            title="Clear sketch"
            aria-label="Clear sketch"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
          >
            <BrushCleaning className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative mt-4 min-h-[380px] flex-1 overflow-hidden rounded-md border border-primary/10 bg-white">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          className={`block h-full min-h-[380px] w-full touch-none select-none ${
            tool === "select"
              ? "cursor-move"
              : tool === "text"
                ? "cursor-text"
                : tool === "eraser"
                  ? "cursor-cell"
                  : "cursor-crosshair"
          }`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onPointerLeave={() => {
            if (!erasingRef.current) setEraserPoint(null);
          }}
          aria-label={`${sketch.title} drawing canvas`}
          role="img"
        >
          <defs>
            <pattern id="sketch-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e9ecef" strokeWidth="1" />
            </pattern>
            {eraseElements.map(renderEraseMask)}
          </defs>
          <rect width="100%" height="100%" fill="url(#sketch-grid)" />
          {renderDrawingLayers(elementsWithEraseDraft)}
          {tool === "select" && selectedElement && renderSelection(selectedElement)}
          {draft?.type !== "erase" && draft && renderElement(draft)}
          {tool === "eraser" && eraserPoint && (
            <circle
              cx={eraserPoint.x}
              cy={eraserPoint.y}
              r={eraserSize}
              fill="rgba(255,255,255,0.72)"
              stroke="#111111"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
        </svg>

        {textPoint && textPosition && (
          <textarea
            ref={textInputRef}
            autoFocus
            rows={textLines.length}
            wrap="off"
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onBlur={saveText}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.altKey && !event.shiftKey) {
                event.preventDefault();
                saveText();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelTextEdit();
              }
            }}
            className="absolute z-20 resize-none overflow-hidden border border-foreground bg-white/95 px-1 py-0 shadow-sm outline-none"
            style={{
              left: textPosition.x,
              top: textPosition.y - textPreviewFontSize * 0.82,
              width: Math.max(
                textPreviewFontSize * 5,
                textPreviewFontSize * 0.58 * Math.max(longestTextLine + 1, 9) + 10,
              ),
              height: textPreviewFontSize * 1.2 * textLines.length + 4,
              color: textEditorColor,
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: textPreviewFontSize,
              lineHeight: 1,
            }}
          />
        )}
      </div>
    </div>
  );
}

export function SketchpadPage({
  sketches,
  collections,
  selectedSketchId,
  onSelectSketch,
  onAddSketch,
  onUpdateTitle,
  onUpdateElements,
  onUpdateCollection,
  onArchiveSketch,
  onRestoreSketch,
  onDeleteSketchPermanently,
  onAddCollection,
  onUpdateCollectionTitle,
  onDeleteCollection,
}: SketchpadPageProps) {
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [collapsedFolderKeys, setCollapsedFolderKeys] = useState<Set<string>>(
    new Set(),
  );
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderTitle, setEditingFolderTitle] = useState("");
  const selectedSketch = sketches.find((sketch) => sketch.id === selectedSketchId) ?? null;
  const sortedCollections = useMemo(
    () => [...collections].sort((a, b) => a.order - b.order),
    [collections],
  );

  useEffect(() => {
    if (selectedSketchId && !selectedSketch) onSelectSketch(null);
  }, [selectedSketch, selectedSketchId, onSelectSketch]);

  const addSketchTo = (collectionId: string | null) => {
    const id = onAddSketch(DEFAULT_TITLE, collectionId);
    if (id) onSelectSketch(id);
  };

  const saveFolder = () => {
    const id = onAddCollection(newFolderTitle);
    if (id) {
      setNewFolderTitle("");
      setAddingFolder(false);
    }
  };

  const activeSketches = sketches.filter((sketch) => !sketch.archivedAt);
  const deletedSketches = sketches.filter((sketch) => Boolean(sketch.archivedAt));
  const groups = [
    {
      key: UNFILED_FOLDER_KEY,
      id: null,
      title: UNFILED_LABEL,
      sketches: activeSketches.filter((sketch) => !sketch.collectionId),
      deleted: false,
    },
    ...sortedCollections.map((collection) => ({
      key: collection.id,
      id: collection.id,
      title: collection.title,
      sketches: activeSketches.filter(
        (sketch) => sketch.collectionId === collection.id,
      ),
      deleted: false,
    })),
    {
      key: DELETED_FOLDER_KEY,
      id: null,
      title: DELETED_LABEL,
      sketches: deletedSketches,
      deleted: true,
    },
  ];

  const toggleFolder = (folderKey: string) => {
    setCollapsedFolderKeys((current) => {
      const next = new Set(current);
      if (next.has(folderKey)) next.delete(folderKey);
      else next.add(folderKey);
      return next;
    });
  };

  const saveFolderTitle = () => {
    const title = editingFolderTitle.trim();
    if (editingFolderId && title) onUpdateCollectionTitle(editingFolderId, title);
    setEditingFolderId(null);
    setEditingFolderTitle("");
  };

  return (
    <div
      className={`grid grid-cols-1 gap-4 ${
        menuCollapsed
          ? "lg:grid-cols-[64px_minmax(0,1fr)]"
          : "lg:grid-cols-[280px_minmax(0,1fr)]"
      }`}
    >
      <aside className="sketchy-card h-fit p-3 lg:sticky lg:top-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          {!menuCollapsed && (
            <h2 className="text-sm font-bold text-foreground">Sketchpad</h2>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuCollapsed((collapsed) => !collapsed)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
              aria-label={menuCollapsed ? "Expand sketchpad menu" : "Collapse sketchpad menu"}
              title={menuCollapsed ? "Expand menu" : "Collapse menu"}
            >
              <Menu className="h-4 w-4" />
            </button>
            {!menuCollapsed && (
              <button
                type="button"
                onClick={() => setAddingFolder((value) => !value)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
                title="Add folder"
                aria-label="Add sketch folder"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {!menuCollapsed && (
          <>
            {addingFolder && (
              <div className="mb-3 flex items-center gap-1">
                <input
                  autoFocus
                  value={newFolderTitle}
                  onChange={(event) => setNewFolderTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveFolder();
                    if (event.key === "Escape") {
                      setAddingFolder(false);
                      setNewFolderTitle("");
                    }
                  }}
                  placeholder="Folder name..."
                  className="sketchy-border-light min-w-0 flex-1 rounded bg-background/50 px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={saveFolder}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
                  aria-label="Save folder"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            )}

            <nav className="flex flex-col gap-3" aria-label="Sketch folders">
              {groups.map((group) => {
                const folderKey = group.key;
                const collapsed = collapsedFolderKeys.has(folderKey);
                const groupSketches = [...group.sketches].sort(
                  (a, b) => a.order - b.order,
                );
                const editing =
                  !group.deleted &&
                  editingFolderId === group.id &&
                  Boolean(group.id);

                return (
                  <section key={folderKey} className="rounded-md">
                    <div className="group flex items-center justify-between gap-1 px-2 pb-1">
                      {editing ? (
                        <input
                          autoFocus
                          value={editingFolderTitle}
                          onChange={(event) => setEditingFolderTitle(event.target.value)}
                          onBlur={saveFolderTitle}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveFolderTitle();
                            if (event.key === "Escape") {
                              setEditingFolderId(null);
                              setEditingFolderTitle("");
                            }
                          }}
                          className="sketchy-border-light min-w-0 flex-1 rounded bg-background/50 px-2 py-1 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleFolder(folderKey)}
                          className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded px-0.5 py-1 text-left text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                          aria-expanded={!collapsed}
                          aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.title}`}
                        >
                          {collapsed ? (
                            <ChevronRight className="h-3 w-3 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="h-3 w-3 flex-shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate normal-case">
                            {group.title}
                            <span className="ml-1 font-normal">({groupSketches.length})</span>
                          </span>
                        </button>
                      )}

                      {!editing && (
                        <div className="flex items-center opacity-70 transition-opacity group-hover:opacity-100">
                          {!group.deleted && (
                            <button
                              type="button"
                              onClick={() => addSketchTo(group.id)}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                              title="Add sketch"
                              aria-label={`Add sketch to ${group.title}`}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          )}
                          {group.id && !group.deleted && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingFolderId(group.id);
                                  setEditingFolderTitle(group.title);
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                                aria-label={`Rename ${group.title}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete “${group.title}”? Its sketches will move to No folder.`,
                                    )
                                  ) {
                                    onDeleteCollection(group.id!);
                                  }
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Delete ${group.title}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {editing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFolderId(null);
                            setEditingFolderTitle("");
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                          aria-label="Cancel rename"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {!collapsed && (
                      <div className="ml-4 flex flex-col gap-1">
                        {groupSketches.map((sketch) => (
                          <div
                            key={sketch.id}
                            className={`group/sketch flex items-center gap-1 rounded-md transition-colors ${
                              selectedSketchId === sketch.id
                                ? "bg-primary/10"
                                : "hover:bg-secondary"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => onSelectSketch(sketch.id)}
                              className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                                selectedSketchId === sketch.id
                                  ? "font-semibold text-foreground"
                                  : "text-muted-foreground group-hover/sketch:text-foreground"
                              }`}
                            >
                              {sketch.title}
                            </button>
                            {group.deleted ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onRestoreSketch(sketch.id)}
                                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                                  aria-label={`Restore ${sketch.title}`}
                                  title="Restore"
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Permanently delete “${sketch.title}”? This cannot be undone.`,
                                      )
                                    ) {
                                      onDeleteSketchPermanently(sketch.id);
                                      if (selectedSketchId === sketch.id) {
                                        onSelectSketch(null);
                                      }
                                    }
                                  }}
                                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={`Delete ${sketch.title} permanently`}
                                  title="Delete permanently"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onArchiveSketch(sketch.id)}
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-primary/10 hover:text-foreground group-hover/sketch:opacity-100"
                                aria-label={`Delete ${sketch.title}`}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </nav>
          </>
        )}
      </aside>

      {selectedSketch ? (
        <section className="sketchy-card flex min-h-[520px] min-w-0 flex-col p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              key={selectedSketch.id}
              defaultValue={selectedSketch.title}
              onBlur={(event) => onUpdateTitle(selectedSketch.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-label="Sketch title"
              className="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-xl font-bold text-foreground outline-none focus:bg-background/40 focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex items-center gap-1 self-start sm:self-auto">
              <MemoCollectionPicker
                collections={collections}
                value={selectedSketch.collectionId}
                onChange={(collectionId) =>
                  onUpdateCollection(selectedSketch.id, collectionId)
                }
                onCreateCollection={onAddCollection}
                includeArchive
                isArchived={Boolean(selectedSketch.archivedAt)}
                onArchive={() => {
                  if (!selectedSketch.archivedAt) {
                    onArchiveSketch(selectedSketch.id);
                  }
                }}
                compact
                ariaLabel="Choose sketch folder"
              />
              {selectedSketch.archivedAt ? (
                <>
                  <button
                    type="button"
                    onClick={() => onRestoreSketch(selectedSketch.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-primary/10 hover:text-foreground"
                    title="Restore sketch"
                    aria-label="Restore sketch"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Permanently delete “${selectedSketch.title}”? This cannot be undone.`,
                        )
                      ) {
                        onDeleteSketchPermanently(selectedSketch.id);
                        onSelectSketch(null);
                      }
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Delete permanently"
                    aria-label="Delete sketch permanently"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onArchiveSketch(selectedSketch.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-primary/10 hover:text-foreground"
                  title="Delete sketch"
                  aria-label="Delete sketch"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <DrawingCanvas
            key={selectedSketch.id}
            sketch={selectedSketch}
            onChange={(elements) => onUpdateElements(selectedSketch.id, elements)}
          />
        </section>
      ) : (
        <div className="sketchy-card flex min-h-[420px] items-center justify-center p-6">
          <button
            type="button"
            onClick={() => addSketchTo(null)}
            className="flex flex-col items-center gap-3 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Add your first sketch"
          >
            <span className="sketchy-btn flex h-14 w-14 items-center justify-center">
              <Plus className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium">Add a new sketch</span>
          </button>
        </div>
      )}
    </div>
  );
}
