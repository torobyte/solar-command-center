import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { useEffect } from "react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Link2, ImageIcon, AlignLeft, AlignCenter, AlignRight,
  Quote, Code, Undo, Redo, Palette, Eraser,
} from "lucide-react";

/**
 * Visual (WYSIWYG) editor for email templates.
 *
 * Edits the *inner* HTML body (the part that gets wrapped with the brand
 * shell when "Envolver con marca" is on). Outputs plain HTML compatible
 * with email rendering — block tags, inline styles only.
 *
 * Variables like {{name}}, {{link}} are preserved as plain text and
 * highlighted visually so users can see them while editing.
 */
export function EmailRichEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank", style: "color:#2563EB;text-decoration:underline" },
      }),
      Image,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[280px] focus:outline-none px-4 py-3 [&_h1]:text-[22px] [&_h1]:font-bold [&_h2]:text-[18px] [&_p]:text-[15px] [&_p]:leading-6 [&_a]:text-primary",
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes (e.g. "Cargar plantilla completa" button).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value && value !== current) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-md border bg-background">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <div className="border-t bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
        Tip: escribe variables como <code className="rounded bg-background px-1 py-0.5">{"{{name}}"}</code>,{" "}
        <code className="rounded bg-background px-1 py-0.5">{"{{link}}"}</code>,{" "}
        <code className="rounded bg-background px-1 py-0.5">{"{{site_name}}"}</code> — se reemplazan al enviar.
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean) =>
    [
      "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition-colors",
      active
        ? "bg-primary/10 text-primary border-primary/20"
        : "hover:bg-muted text-muted-foreground hover:text-foreground",
    ].join(" ");

  function setLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL del enlace (deja vacío para quitar):", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function addImage() {
    const url = window.prompt("URL de la imagen:");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }

  function setColor() {
    const prev = (editor.getAttributes("textStyle").color as string | undefined) ?? "#0f172a";
    const c = window.prompt("Color del texto (hex):", prev);
    if (!c) return;
    editor.chain().focus().setColor(c).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
      <Group>
        <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita"><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva"><Italic className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado"><Strikethrough className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(false)} onClick={setColor} title="Color del texto"><Palette className="h-3.5 w-3.5" /></button>
      </Group>
      <Sep />
      <Group>
        <button type="button" className={btn(editor.isActive("heading", { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1"><Heading1 className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive("heading", { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2"><Heading2 className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3"><Heading3 className="h-3.5 w-3.5" /></button>
      </Group>
      <Sep />
      <Group>
        <button type="button" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista"><List className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada"><ListOrdered className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita"><Quote className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive("codeBlock"))} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Código"><Code className="h-3.5 w-3.5" /></button>
      </Group>
      <Sep />
      <Group>
        <button type="button" className={btn(editor.isActive({ textAlign: "left" }))} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Alinear izquierda"><AlignLeft className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive({ textAlign: "center" }))} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Centrar"><AlignCenter className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(editor.isActive({ textAlign: "right" }))} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Alinear derecha"><AlignRight className="h-3.5 w-3.5" /></button>
      </Group>
      <Sep />
      <Group>
        <button type="button" className={btn(editor.isActive("link"))} onClick={setLink} title="Enlace"><Link2 className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(false)} onClick={addImage} title="Imagen"><ImageIcon className="h-3.5 w-3.5" /></button>
      </Group>
      <Sep />
      <Group>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().undo().run()} title="Deshacer"><Undo className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().redo().run()} title="Rehacer"><Redo className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Limpiar formato"><Eraser className="h-3.5 w-3.5" /></button>
      </Group>
      <div className="ml-auto flex items-center gap-1">
        <VarChip editor={editor} v="{{name}}" />
        <VarChip editor={editor} v="{{link}}" />
        <VarChip editor={editor} v="{{action_link}}" />
        <VarChip editor={editor} v="{{accept_url}}" />
        <VarChip editor={editor} v="{{site_name}}" />
      </div>
    </div>
  );
}

function VarChip({ editor, v }: { editor: Editor; v: string }) {
  return (
    <button
      type="button"
      onClick={() => editor.chain().focus().insertContent(v).run()}
      className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-1.5 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/10"
      title={`Insertar variable ${v}`}
    >
      {v}
    </button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}
function Sep() {
  return <div className="mx-1 h-5 w-px bg-border" />;
}
