"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

function ToolbarButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium ${active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
    >
      {children}
    </button>
  );
}

/** Shared rich-text editor for product/collection descriptions and the free-text product-template
 * fields (intro paragraph, USP/FAQ/accordion bodies) that genuinely contain HTML today -- e.g. the
 * "skal" template's accordion row literally contains `<h3><strong>` markup. */
export function RichTextEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none px-3 py-2 min-h-[120px] focus:outline-none" },
    },
  });

  if (!editor) return <div className="h-32 rounded-md border border-gray-200 bg-gray-50" />;

  return (
    <div className="rounded-md border border-gray-200">
      <div className="flex gap-1 border-b border-gray-100 px-2 py-1.5">
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          Fet
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          Kursiv
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          Rubrik
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Punktlista
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
          Stycke
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
