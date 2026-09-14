import { quoteCommands, quoteSelectionChanges } from './quote';

export default () => ({
    plugin: (codeMirror: any) => {
        if (codeMirror.cm6) {
            const editor = codeMirror.editor;
            for (const command of quoteCommands) codeMirror.registerCommand(command.name, () => {
                if (editor.state.readOnly) return;
                const changes = quoteSelectionChanges(editor.state.doc.toString(), editor.state.selection.ranges, command.action);
                if (!changes.length) return;
                editor.dispatch({ changes, scrollIntoView: true, userEvent: 'input.pasteItQuote' });
                editor.focus();
            });
        } else {
            // The legacy editor passes the CodeMirror constructor, not an editor instance.
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
});
