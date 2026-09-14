export type QuoteAction = 'quote' | 'unquote' | 'toggle';
export const quoteCommands = [
    { action: 'toggle' as QuoteAction, name: 'pasteItPlugin.toggleQuote', label: 'Quote / Unquote', iconName: 'fas fa-quote-right' },
];

export interface SelectionRange { from: number; to: number }
export interface QuoteChange { from: number; to: number; insert: string }

// Both paste conversion and editor transactions use this exact line edit.
function quoteLineChange(line: string): QuoteChange {
    if (line.trim()) return { from: 0, to: 0, insert: '> ' };
    // Replace blank-line whitespace, but preserve the CR in a CRLF line ending.
    return { from: 0, to: line.endsWith('\r') ? line.length - 1 : line.length, insert: '>' };
}

export function quoteLine(line: string): string {
    const change = quoteLineChange(line);
    return change.insert + line.slice(change.to);
}

// Edit prefixes and blank-line whitespace; preserve other text and editor undo.
export function quoteSelectionChanges(text: string, ranges: SelectionRange[], action: QuoteAction = 'toggle'): QuoteChange[] {
    const changes: QuoteChange[] = [];
    const selected: { line: string; from: number }[] = [];
    const quotePrefix = /^( {0,3})>([ \t]?)/;
    let from = 0;
    for (const line of text.split('\n')) {
        const to = from + line.length;
        // A selection ending at the next line's start does not include that line.
        if (ranges.some(range => range.from === range.to
            ? range.from >= from && range.from <= to
            : range.from <= to && range.to > from)) {
            selected.push({ line, from });
        }
        from = to + 1;
    }
    // Make one decision for the entire block, including blank lines.
    const unquote = action === 'unquote' || (action === 'toggle' && selected.every(({ line }) => quotePrefix.test(line)));
    for (const { line, from } of selected) {
        if (!unquote) {
            const change = quoteLineChange(line);
            changes.push({ ...change, from: from + change.from, to: from + change.to });
        } else {
            // Up to three spaces may precede a Markdown quote; keep the indentation.
            const prefix = quotePrefix.exec(line);
            if (prefix) changes.push({ from: from + prefix[1].length, to: from + prefix[0].length, insert: '' });
        }
    }
    return changes;
}
