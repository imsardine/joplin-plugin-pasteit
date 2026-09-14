export const selectionCommands = {
    capture: 'pasteItPlugin.captureSelection',
    apply: 'pasteItPlugin.applyCleanup',
    discard: 'pasteItPlugin.discardSelection',
};

interface EditorAdapter {
    register(name: string, callback: (...args: any[]) => any): void;
    document(): unknown;
    text(): string;
    ranges(): { from: number; to: number }[];
    readOnly(): boolean;
    replace(from: number, to: number, text: string): void;
}

// Keep the original range inside its editor; never replace whichever text is selected later.
export function registerSelectionCommands(editor: EditorAdapter): void {
    let pending: { token: string; document: unknown; from: number; to: number } = null;
    editor.register(selectionCommands.capture, () => {
        pending = null;
        if (editor.readOnly()) throw new Error('This note is read-only.');
        const ranges = editor.ranges().filter(range => range.from !== range.to);
        if (!ranges.length) return null;
        if (ranges.length !== 1) throw new Error('Select one continuous block to clean up.');
        const { from, to } = ranges[0];
        pending = { token: `${Date.now()}-${Math.random()}`, document: editor.document(), from, to };
        return { token: pending.token, text: editor.text().slice(from, to) };
    });
    editor.register(selectionCommands.apply, (token: string, text: string) => {
        if (!pending || pending.token !== token) throw new Error('The original selection is no longer available. Reopen Clear formatting.');
        const snapshot = pending;
        pending = null;
        if (editor.readOnly() || editor.document() !== snapshot.document) throw new Error('The note changed. Reopen Clear formatting.');
        if (typeof text !== 'string') throw new Error('Invalid cleanup result.');
        if (text !== editor.text().slice(snapshot.from, snapshot.to)) editor.replace(snapshot.from, snapshot.to, text);
        return true;
    });
    editor.register(selectionCommands.discard, (token: string) => {
        if (pending?.token === token) pending = null;
    });
}
