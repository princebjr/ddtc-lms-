import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, Table, Underline, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';
import { cn } from '@/lib/utils.js';

// The lesson editor (Phase 6 build list: sanitised rich-text editor). It offers only what the
// server's allow-list keeps (headings, emphasis, lists, quotes, links, https images, tables), and
// shows text with the same `lesson-content` styles learners see. The server cleans the HTML again
// on save (manage-lessons) and the database checks it once more.
// Loaded only on the lesson editor page, so other pages carry none of its weight.

/**
 * @param {{ value: string, onChange: (html: string) => void, label: string, disabled?: boolean }} props
 */
export default function RichTextEditor({ value, onChange, label, disabled = false }) {
  const [dialog, setDialog] = useState(/** @type {null | 'link' | 'image'} */ (null));
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] },
      }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'lesson-content min-h-64 w-full max-w-none rounded-b-md bg-card px-4 py-3 outline-none focus-visible:focus-ring',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            link: e.isActive('link'),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  if (!editor) return <div className="min-h-64 rounded-md border border-control bg-card" aria-busy="true" />;
  const chain = () => editor.chain().focus();

  /** @type {Array<{ label: string, icon: import('lucide-react').LucideIcon, active?: boolean, disabled?: boolean, run: () => void }>} */
  const tools = [
    { label: 'Bold', icon: Bold, active: state?.bold, run: () => chain().toggleBold().run() },
    { label: 'Italic', icon: Italic, active: state?.italic, run: () => chain().toggleItalic().run() },
    { label: 'Underline', icon: Underline, active: state?.underline, run: () => chain().toggleUnderline().run() },
    { label: 'Heading', icon: Heading2, active: state?.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: 'Subheading', icon: Heading3, active: state?.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    { label: 'Bulleted list', icon: List, active: state?.bullet, run: () => chain().toggleBulletList().run() },
    { label: 'Numbered list', icon: ListOrdered, active: state?.ordered, run: () => chain().toggleOrderedList().run() },
    { label: 'Quote', icon: Quote, active: state?.quote, run: () => chain().toggleBlockquote().run() },
    { label: 'Link', icon: Link2, active: state?.link, run: () => setDialog('link') },
    { label: 'Image from a link', icon: ImagePlus, run: () => setDialog('image') },
    { label: 'Table', icon: Table, run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: 'Undo', icon: Undo2, disabled: !state?.canUndo, run: () => chain().undo().run() },
    { label: 'Redo', icon: Redo2, disabled: !state?.canRedo, run: () => chain().redo().run() },
  ];

  return (
    <div className="rounded-md border border-control">
      {disabled ? null : (
        <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-1 border-b border-hairline bg-fill p-1">
          {tools.map((t) => (
            <button
              key={t.label}
              type="button"
              // A mouse or finger press keeps the focus in the text, so typing carries on where it
              // was and a phone keyboard stays open; keyboard users reach the buttons with Tab and
              // each command returns the focus to the text.
              onMouseDown={(e) => e.preventDefault()}
              onClick={t.run}
              disabled={t.disabled}
              aria-label={t.label}
              aria-pressed={t.active === undefined ? undefined : Boolean(t.active)}
              className={cn(
                'inline-flex size-11 items-center justify-center rounded-sm text-ink-secondary transition-colors duration-fast hover:bg-card hover:text-ink focus-visible:focus-ring disabled:opacity-40',
                t.active && 'bg-card text-link',
              )}
            >
              <t.icon className="size-5" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />

      <LinkDialog
        open={dialog === 'link'}
        initial={editor.getAttributes('link').href ?? ''}
        onClose={() => setDialog(null)}
        onSave={(href) => {
          if (href) chain().extendMarkRange('link').setLink({ href }).run();
          else chain().extendMarkRange('link').unsetLink().run();
          setDialog(null);
        }}
      />
      <ImageDialog
        open={dialog === 'image'}
        onClose={() => setDialog(null)}
        onSave={(src, alt) => {
          chain().setImage({ src, alt }).run();
          setDialog(null);
        }}
      />
    </div>
  );
}

/** @param {{ open: boolean, initial: string, onClose: () => void, onSave: (href: string) => void }} props */
function LinkDialog({ open, initial, onClose, onSave }) {
  const [error, setError] = useState(/** @type {string | null} */ (null));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
          <DialogDescription>Links open in a new tab. Leave empty to remove the link.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const href = String(new FormData(e.currentTarget).get('href') ?? '').trim();
            if (href && !/^(https?:\/\/|mailto:)/i.test(href)) return setError('Start the link with https://, http:// or mailto:');
            setError(null);
            onSave(href);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="editor-link">Address</Label>
            <Input id="editor-link" name="href" type="url" inputMode="url" defaultValue={initial} placeholder="https://" aria-invalid={error ? true : undefined} aria-describedby={error ? 'editor-link-error' : undefined} />
            {error ? (
              <p id="editor-link-error" className="m-0 text-body-sm text-error">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save link</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** @param {{ open: boolean, onClose: () => void, onSave: (src: string, alt: string) => void }} props */
function ImageDialog({ open, onClose, onSave }) {
  const [error, setError] = useState(/** @type {string | null} */ (null));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Image from a link</DialogTitle>
          <DialogDescription>Use an https address. Describe the image for people who cannot see it.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const src = String(form.get('src') ?? '').trim();
            const alt = String(form.get('alt') ?? '').trim();
            if (!/^https:\/\//i.test(src)) return setError('Use an image address that starts with https://');
            if (!alt) return setError('Describe the image');
            setError(null);
            onSave(src, alt);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="editor-image-src">Image address</Label>
            <Input id="editor-image-src" name="src" type="url" inputMode="url" placeholder="https://" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="editor-image-alt">Description</Label>
            <Input id="editor-image-alt" name="alt" placeholder="What the image shows" />
          </div>
          {error ? <p className="m-0 text-body-sm text-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add image</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
