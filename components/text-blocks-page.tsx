"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { TextBlock } from "@/lib/types";
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Menu,
  Plus,
} from "lucide-react";

interface TextBlocksPageProps {
  blocks: TextBlock[];
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onAddBlock: (title: string) => string | null;
  onUpdateTitle: (blockId: string, title: string) => void;
  onUpdateContent: (blockId: string, content: string) => void;
}

const DEFAULT_BLOCK_TITLE = "Untitled Memo";

export function TextBlocksPage({
  blocks,
  selectedBlockId,
  onSelectBlock,
  onAddBlock,
  onUpdateTitle,
  onUpdateContent,
}: TextBlocksPageProps) {
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
  const selectedBlock =
    sortedBlocks.find((block) => block.id === selectedBlockId) ?? null;

  const handleQuickAdd = () => {
    const newBlockId = onAddBlock(DEFAULT_BLOCK_TITLE);
    if (newBlockId) onSelectBlock(newBlockId);
  };

  return (
    <div
      className={`grid grid-cols-1 gap-4 ${
        menuCollapsed
          ? "lg:grid-cols-[64px_minmax(0,1fr)]"
          : "lg:grid-cols-[260px_minmax(0,1fr)]"
      }`}
    >
      <aside className="sketchy-card p-3 h-fit lg:sticky lg:top-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          {!menuCollapsed && (
            <h2 className="text-sm font-bold text-foreground">Memos</h2>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMenuCollapsed((collapsed) => !collapsed)}
              className="h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
              aria-label={menuCollapsed ? "Expand memos menu" : "Collapse memos menu"}
              title={menuCollapsed ? "Expand menu" : "Collapse menu"}
            >
              <Menu className="h-4 w-4" />
            </button>
            {!menuCollapsed && (
              <button
                type="button"
                onClick={handleQuickAdd}
                className="h-8 w-8 flex items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
                aria-label="Add a new memo"
                title="Add memo"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {!menuCollapsed && (
          sortedBlocks.length === 0 ? (
            <p className="text-sm text-muted-foreground italic px-2 py-3">
              No memos yet.
            </p>
          ) : (
            <nav className="flex flex-col gap-1" aria-label="Memos">
              {sortedBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => onSelectBlock(block.id)}
                  className={`text-left text-sm px-3 py-2 rounded-md transition-colors truncate ${
                    block.id === selectedBlock?.id
                      ? "bg-primary/10 text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {block.title}
                </button>
              ))}
            </nav>
          )
        )}
      </aside>

      {selectedBlock ? (
        <TextBlockEditor
          key={selectedBlock.id}
          block={selectedBlock}
          onUpdateTitle={(title) => onUpdateTitle(selectedBlock.id, title)}
          onUpdateContent={(content) =>
            onUpdateContent(selectedBlock.id, content)
          }
        />
      ) : (
        <div className="sketchy-card min-h-[420px] flex items-center justify-center p-6">
          <button
            type="button"
            onClick={handleQuickAdd}
            className="flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Add your first memo"
          >
            <span className="sketchy-btn h-14 w-14 flex items-center justify-center">
              <Plus className="h-6 w-6" />
            </span>
            <span className="text-sm font-medium">Add a new memo</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface TextBlockEditorProps {
  block: TextBlock;
  onUpdateTitle: (title: string) => void;
  onUpdateContent: (content: string) => void;
}

function TextBlockEditor({
  block,
  onUpdateTitle,
  onUpdateContent,
}: TextBlockEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== block.content) {
      editorRef.current.innerHTML = block.content;
    }
  }, [block.content]);

  const runFormatCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    onUpdateContent(editorRef.current?.innerHTML ?? "");
  };

  return (
    <section className="sketchy-card p-4 min-h-[520px] flex flex-col">
      <TitleEditor
        title={block.title}
        onUpdateTitle={onUpdateTitle}
        onEnter={() => editorRef.current?.focus()}
      />

      <div className="mt-3 flex flex-wrap items-center gap-1 border-y border-primary/20 py-2">
        <ToolbarButton
          label="Heading"
          onClick={() => runFormatCommand("formatBlock", "h2")}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Bold" onClick={() => runFormatCommand("bold")}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          onClick={() => runFormatCommand("italic")}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          onClick={() => runFormatCommand("insertUnorderedList")}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          onClick={() => runFormatCommand("insertOrderedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(event) =>
          onUpdateContent(event.currentTarget.innerHTML)
        }
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          onUpdateContent(event.currentTarget.innerHTML);
        }}
        className="rich-text-editor mt-4 flex-1 min-h-[380px] rounded-md bg-background/35 px-4 py-3 text-base leading-7 text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        aria-label={`Write content for ${block.title}`}
        data-placeholder="Write paragraphs here..."
      />
    </section>
  );
}

interface TitleEditorProps {
  title: string;
  onUpdateTitle: (title: string) => void;
  onEnter: () => void;
}

function TitleEditor({ title, onUpdateTitle, onEnter }: TitleEditorProps) {
  const [titleText, setTitleText] = useState(title);

  useEffect(() => {
    setTitleText(title);
  }, [title]);

  const saveTitle = () => {
    const trimmed = titleText.trim();
    if (trimmed) {
      onUpdateTitle(trimmed);
    } else {
      setTitleText(title);
    }
  };

  return (
    <input
      value={titleText}
      onChange={(event) => setTitleText(event.target.value)}
      onBlur={saveTitle}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveTitle();
          onEnter();
        }
        if (event.key === "Escape") {
          setTitleText(title);
          event.currentTarget.blur();
        }
      }}
      className="w-full bg-transparent text-xl font-bold text-foreground outline-none rounded px-1 py-1 focus:bg-background/40 focus:ring-2 focus:ring-primary/20"
      aria-label="Memo title"
    />
  );
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({ label, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-foreground transition-colors"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
