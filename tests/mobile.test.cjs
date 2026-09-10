const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function setup() {
    const commands = {}, settings = {}, html = {}, errors = [], logs = [], inserted = [], copied = [], opened = [], replies = [];
    let start, note = { id: 'one', markup_language: 1 };
    const api = {
        plugins: { register: p => { start = p.onStart; } },
        settings: { registerSection: async () => {}, registerSettings: async items => { for (const [k,v] of Object.entries(items)) settings[k] = v.value; }, value: async k => settings[k] },
        versionInfo: async () => ({ platform: 'mobile' }),
        workspace: { selectedNote: async () => note },
        clipboard: { writeText: async text => copied.push(text) },
        commands: { register: async c => { commands[c.name] = c.execute; }, execute: async (name, text) => { assert.equal(name, 'insertText'); inserted.push(text); } },
        views: {
            // Any use of panels on mobile fails: show does not present the panel host.
            panels: new Proxy({}, { get: () => () => { throw new Error('Mobile must use dialogs.open, not panels'); } }),
            toolbarButtons: { create: async () => {} },
            dialogs: {
                create: async id => id, addScript: async () => {}, setFitToContent: async () => {}, setButtons: async () => {},
                setHtml: async (id, value) => { html[id] = value; },
                open: async id => { opened.push(id); const reply = replies.shift(); if (reply instanceof Error) throw reply; return typeof reply === 'function' ? reply() : reply || { id: 'cancel' }; },
                showMessageBox: async text => { errors.push(text); return 0; },
            },
        },
    };
    vm.runInNewContext(fs.readFileSync('dist/index.js', 'utf8'), { joplin: api, console: { info: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) }, setTimeout, clearTimeout, setInterval, clearInterval });
    await start();
    return { commands, html, errors, logs, inserted, copied, opened, replies, switchNote: () => { note = { ...note, id: 'two' }; } };
}
const input = { id: 'ok', formData: { paste: { text: 'Hello', html: '<b>Hello</b>', bold: '1' } } };
const output = { id: 'ok', formData: { preview: { markdown: '**Hello** edited' } } };
test('both mobile toolbar commands actually open a dialog', async () => {
    const h = await setup();
    await h.commands.pasteAsMarkdown();
    await h.commands.pasteMarkdownOptions();
    assert.deepEqual(h.opened, ['pasteMarkdownSource', 'pasteMarkdownSource']);
    assert.equal(h.logs.filter(s => s.includes('command invoked')).length, 2);
});
test('mobile converts captured HTML and inserts edited preview after dialog closes', async () => {
    const h = await setup(); h.replies.push(input, output);
    await h.commands.pasteAsMarkdown();
    assert.match(h.html.pasteMarkdownPreview, /\*\*Hello\*\*/);
    assert.deepEqual(h.inserted, ['**Hello** edited']); assert.deepEqual(h.errors, []);
});
test('cancel and copy do not modify the note', async () => {
    const h = await setup(); h.replies.push(input, { id: 'cancel' });
    await h.commands.pasteAsMarkdown();
    h.replies.push(input, { ...output, id: 'copy' });
    await h.commands.pasteMarkdownOptions();
    assert.deepEqual(h.inserted, []); assert.deepEqual(h.copied, ['**Hello** edited']);
});
test('dialog errors are visible, logged, and allow retry', async () => {
    const h = await setup(); h.replies.push(new Error('Dialog unavailable'));
    await h.commands.pasteAsMarkdown();
    assert.match(h.errors[0], /Dialog unavailable/);
    assert.ok(h.logs.some(s => s.includes('action failed')));
    await h.commands.pasteAsMarkdown(); assert.equal(h.opened.length, 2);
});
test('changing the note while preview is open rejects insertion', async () => {
    const h = await setup(); h.replies.push(input, () => { h.switchNote(); return output; });
    await h.commands.pasteAsMarkdown();
    assert.deepEqual(h.inserted, []); assert.match(h.errors[0], /筆記已切換/);
});
