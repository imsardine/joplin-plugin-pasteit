const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { quoteSelectionChanges } = require('../src/quote.ts');
const { convert, defaults } = require('../src/converter.ts');
const editorPlugin = require('../dist/quoteEditor.js').default;
const apply = (text, changes) => [...changes].reverse().reduce((value, change) => value.slice(0, change.from) + change.insert + value.slice(change.to), text);
const transform = (text, ranges, action = 'quote') => apply(text, quoteSelectionChanges(text, ranges, action));

test('paste quoting and editor quoting produce the same line content', () => {
    for (const text of ['Plain\n> Existing\n>> Nested', 'First\n\n  \n\t\nLast', '  Indented\n**Bold**\nEnd  ', 'First\r\n \t\r\n> Last']) {
        const pasted = convert({ text }, { ...defaults, addBlockQuote: true });
        const edited = transform(text, [{ from: 0, to: text.length }]);
        // Paste conversion normalizes line endings; editor edits preserve them.
        assert.equal(edited.replace(/\r\n/g, '\n'), pasted);
    }
});

test('quote acts on complete selected lines and excludes a line at the selection end', () => {
    assert.equal(transform('Before\nFirst\nSecond\nAfter', [{ from: 9, to: 20 }]), 'Before\n> First\n> Second\nAfter');
    assert.equal(transform('First\nSecond', [{ from: 2, to: 3 }]), '> First\nSecond');
});
test('quote and unquote act on the cursor line including empty lines', () => {
    assert.equal(transform('First\nSecond', [{ from: 8, to: 8 }]), 'First\n> Second');
    assert.equal(transform('', [{ from: 0, to: 0 }]), '>');
    assert.equal(transform('First\n', [{ from: 6, to: 6 }]), 'First\n>');
    assert.equal(transform('> First\n> Second', [{ from: 10, to: 10 }], 'unquote'), '> First\nSecond');
});
test('one quote level is added or removed while retaining content and line endings', () => {
    const text = '> Existing\r\n\r\n  \r\nText';
    const quoted = transform(text, [{ from: 0, to: text.length }]);
    assert.equal(quoted, '> > Existing\r\n>\r\n>\r\n> Text');
    assert.equal(transform(quoted, [{ from: 0, to: quoted.length }], 'unquote'), '> Existing\r\n\r\n\r\nText');
    const mixed = '> One\n>> Nested\n  > Indented\nPlain\n    > Code\n>';
    assert.equal(transform(mixed, [{ from: 0, to: mixed.length }], 'unquote'), 'One\n> Nested\n  Indented\nPlain\n    > Code\n');
    assert.equal(transform('a > b', [{ from: 0, to: 5 }], 'unquote'), 'a > b');
});
test('quoting empty and whitespace-only lines never adds trailing spaces', () => {
    const text = 'Text\n\n  \n\t\n \t \nEnd';
    assert.equal(transform(text, [{ from: 0, to: text.length }], 'toggle'), '> Text\n>\n>\n>\n>\n> End');
    assert.equal(transform(' \t ', [{ from: 1, to: 1 }], 'toggle'), '>');
});
test('overlapping selections edit each line only once and separate selections leave gaps', () => {
    assert.equal(transform('A\nB\nC', [{ from: 0, to: 3 }, { from: 2, to: 5 }]), '> A\n> B\n> C');
    assert.equal(transform('A\nB\nC', [{ from: 0, to: 0 }, { from: 4, to: 5 }]), '> A\nB\n> C');
});
test('CM6 commands use a single transaction and respect read-only state', () => {
    const commands = {}, transactions = [];
    let focused = 0;
    const editor = {
        state: { doc: { toString: () => 'A\nB' }, selection: { ranges: [{ from: 0, to: 3 }] }, readOnly: false },
        dispatch: transaction => transactions.push(transaction), focus: () => focused++,
    };
    editorPlugin().plugin({ cm6: editor, editor, registerCommand: (name, fn) => { commands[name] = fn; } });
    commands['pasteItPlugin.toggleQuote']();
    assert.equal(transactions.length, 1);
    assert.equal(apply('A\nB', transactions[0].changes), '> A\n> B');
    assert.equal(focused, 1);
    editor.state.readOnly = true;
    commands['pasteItPlugin.toggleQuote']();
    assert.equal(transactions.length, 1);
    editor.state.readOnly = false;
    editor.state.doc = { toString: () => '> A\n> B' };
    editor.state.selection.ranges = [{ from: 0, to: 7 }];
    commands['pasteItPlugin.toggleQuote']();
    assert.equal(transactions.length, 2);
    assert.equal(apply('> A\n> B', transactions[1].changes), 'A\nB');
});
test('legacy editor handles reversed selections in one operation and guards read-only state', () => {
    const codeMirror = { commands: {} };
    editorPlugin().plugin(codeMirror);
    let text = 'A\nB', operations = 0, focused = 0, readOnly = false;
    const editor = {
        getOption: () => readOnly, getValue: () => text,
        listSelections: () => [{ anchor: 3, head: 0 }],
        indexFromPos: position => position, posFromIndex: index => index,
        operation: fn => { operations++; fn(); },
        replaceRange: (insert, from, to) => { text = text.slice(0, from) + insert + text.slice(to); },
        focus: () => focused++,
    };
    codeMirror.commands['pasteItPlugin.toggleQuote'](editor);
    assert.equal(text, '> A\n> B');
    assert.equal(operations, 1);
    assert.equal(focused, 1);
    readOnly = true;
    codeMirror.commands['pasteItPlugin.toggleQuote'](editor);
    assert.equal(text, '> A\n> B');
    assert.equal(operations, 1);
});

test('toggle quotes mixed blocks and restores their original nested quotes on the next toggle', () => {
    const text = 'Plain\n> Existing\n\n>> Nested';
    const quoted = transform(text, [{ from: 0, to: text.length }], 'toggle');
    assert.equal(quoted, '> Plain\n> > Existing\n>\n> >> Nested');
    assert.equal(transform(quoted, [{ from: 0, to: quoted.length }], 'toggle'), text);
});
test('toggle unquotes only when every affected line has a quote marker', () => {
    const text = '> First\n>\n>> Nested';
    assert.equal(transform(text, [{ from: 0, to: text.length }], 'toggle'), 'First\n\n> Nested');
    assert.equal(transform('> First\n\n> Last', [{ from: 0, to: 15 }], 'toggle'), '> > First\n>\n> > Last');
    assert.equal(transform('> One\nPlain', [{ from: 0, to: 6 }], 'toggle'), 'One\nPlain');
    assert.equal(transform('> One\nPlain', [{ from: 2, to: 2 }, { from: 8, to: 8 }], 'toggle'), '> > One\n> Plain');
    assert.equal(transform('> One', [{ from: 2, to: 2 }], 'toggle'), 'One');
    assert.equal(transform('', [{ from: 0, to: 0 }], 'toggle'), '>');
    assert.equal(transform('>', [{ from: 1, to: 1 }], 'toggle'), '');
});
