import { quoteCommands, quoteSelectionChanges } from './quote';
import { registerSelectionCommands } from './selectionEditor';

export default () => ({
    plugin: (codeMirror: any) => {
        if (codeMirror.cm6) {
            const editor = codeMirror.editor;
            registerSelectionCommands({
                register: (name, callback) => codeMirror.registerCommand(name, callback),
                document: () => editor.state.doc,
                text: () => editor.state.doc.toString(),
                ranges: () => editor.state.selection.ranges,
                readOnly: () => editor.state.readOnly,
                replace: (from, to, insert) => {
                    editor.dispatch({ changes: { from, to, insert }, scrollIntoView: true, userEvent: 'input.pasteItCleanup' });
                    editor.focus();
                },
            });
            for (const command of quoteCommands) codeMirror.registerCommand(command.name, () => {
                if (editor.state.readOnly) return;
                const changes = quoteSelectionChanges(editor.state.doc.toString(), editor.state.selection.ranges, command.action);
                if (!changes.length) return;
                editor.dispatch({ changes, scrollIntoView: true, userEvent: 'input.pasteItQuote' });
                editor.focus();
            });
        } else {
            // The legacy editor passes the CodeMirror constructor, not an editor instance.
            // Each editor gets its own captured selection, even when multiple notes are open.
            codeMirror.defineOption('pasteItCleanup', true, function(editor: any) {
                registerSelectionCommands({
                    register: (name, callback) => { editor[name] = callback; },
                    document: () => editor.getValue(),
                    text: () => editor.getValue(),
                    ranges: () => editor.listSelections().map((range: any) => {
                        const anchor = editor.indexFromPos(range.anchor), head = editor.indexFromPos(range.head);
                        return { from: Math.min(anchor, head), to: Math.max(anchor, head) };
                    }),
                    readOnly: () => editor.getOption('readOnly'),
                    replace: (from, to, text) => {
                        editor.operation(() => editor.replaceRange(text, editor.posFromIndex(from), editor.posFromIndex(to), 'pasteItCleanup'));
                        editor.focus();
                    },
                });
            });
            for (const command of quoteCommands) codeMirror.commands[command.name] = (editor: any) => {
                if (editor.getOption('readOnly')) return;
                const ranges = editor.listSelections().map((range: any) => {
                    const anchor = editor.indexFromPos(range.anchor), head = editor.indexFromPos(range.head);
                    return { from: Math.min(anchor, head), to: Math.max(anchor, head) };
                });
                const changes = quoteSelectionChanges(editor.getValue(), ranges, command.action);
                if (!changes.length) return;
                editor.operation(() => {
                    for (const change of changes.reverse()) {
                        editor.replaceRange(change.insert, editor.posFromIndex(change.from), editor.posFromIndex(change.to), 'pasteItQuote');
                    }
                });
                editor.focus();
            };
        }
    },
    codeMirrorOptions: { pasteItCleanup: true },
});
