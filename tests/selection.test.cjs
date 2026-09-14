const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { registerSelectionCommands, selectionCommands } = require('../src/selectionEditor.ts');
function setup() {
    let text = 'Before **Bold** After', ranges = [{ from: 7, to: 15 }], readOnly = false;
    const commands = {}, edits = [];
    registerSelectionCommands({
        register: (name, fn) => { commands[name] = fn; }, document: () => text, text: () => text,
        ranges: () => ranges, readOnly: () => readOnly,
        replace: (from, to, insert) => { edits.push({ from, to, insert }); text = text.slice(0, from) + insert + text.slice(to); },
    });
    return { capture: commands[selectionCommands.capture], apply: commands[selectionCommands.apply], discard: commands[selectionCommands.discard],
        text: () => text, edits, setText: value => { text = value; }, setRanges: value => { ranges = value; }, setReadOnly: value => { readOnly = value; } };
}
test('cleanup replaces the captured range, not a later selection, in one edit', () => {
    const h = setup(), snapshot = h.capture();
    assert.equal(snapshot.text, '**Bold**');
    h.setRanges([{ from: 0, to: 6 }]);
    h.apply(snapshot.token, 'Bold');
    assert.equal(h.text(), 'Before Bold After');
    assert.equal(h.edits.length, 1);
    assert.throws(() => h.apply(snapshot.token, 'Again'), /no longer available/);
});
test('cleanup rejects stale documents, read-only notes and discarded captures', () => {
    const h = setup(), snapshot = h.capture();
    h.setText('Changed elsewhere');
    assert.throws(() => h.apply(snapshot.token, 'Bold'), /note changed/);
    const other = setup(), second = other.capture();
    other.setReadOnly(true);
    assert.throws(() => other.apply(second.token, 'Bold'), /note changed/);
    other.setReadOnly(false);
    const third = other.capture();
    other.discard(third.token);
    assert.throws(() => other.apply(third.token, 'Bold'), /no longer available/);
    assert.equal(other.edits.length, 0);
});
test('cleanup requires one nonempty selection and skips unchanged results', () => {
    const h = setup();
    h.setRanges([{ from: 0, to: 0 }]);
    assert.equal(h.capture(), null);
    h.setRanges([{ from: 0, to: 2 }, { from: 7, to: 15 }]);
    assert.throws(() => h.capture(), /one continuous block/);
    h.setRanges([{ from: 7, to: 15 }]);
    const snapshot = h.capture();
    h.apply(snapshot.token, snapshot.text);
    assert.equal(h.edits.length, 0);
});
