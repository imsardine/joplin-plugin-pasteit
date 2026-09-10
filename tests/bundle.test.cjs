const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
for (const platform of ['desktop']) test(`bundled plugin starts and pastes on ${platform} without Node globals`, async () => {
    const commands = {};
    const values = {};
    const inserted = [];
    let start, handler;
    let note = { id: 'one', markup_language: 1 };
    const api = {
        plugins: { register: value => { start = value.onStart; } },
        settings: { registerSection: async () => {}, registerSettings: async items => { for (const [k, v] of Object.entries(items)) values[k] = v.value; }, value: async key => values[key] },
        versionInfo: async () => ({ platform }),
        clipboard: { readHtml: async () => { assert.equal(platform, 'desktop'); return '<b>Hello</b>'; }, readText: async () => 'text', writeText: async () => {} },
        workspace: { selectedNote: async () => note },
        views: {
            panels: { create: async () => 'panel', setHtml: async () => {}, addScript: async () => {}, hide: async () => {}, show: async () => {}, onMessage: async (_id, fn) => { handler = fn; } },
            toolbarButtons: { create: async () => {} }, menuItems: { create: async () => { assert.equal(platform, 'desktop'); } },
            dialogs: { showMessageBox: async text => { throw new Error(text); } },
        },
        commands: { register: async command => { commands[command.name] = command.execute; }, execute: async (name, ...args) => name === 'insertText' ? inserted.push(args[0]) : commands[name](...args) },
    };
    // api/index.ts uses the global joplin bridge supplied by the host.
    vm.runInNewContext(fs.readFileSync('dist/index.js', 'utf8'), { joplin: api, console, setTimeout, clearTimeout, setInterval, clearInterval });
    await start();
    await commands.pasteAsMarkdown();
    if (platform === 'desktop') assert.deepEqual(inserted, ['**Hello**']);
    else assert.deepEqual(inserted, []);
    await commands.pasteMarkdownOptions();
    const result = await handler({ type: 'convert', input: { html: '<em>Mobile</em>' }, options: {} });
    assert.equal(result.markdown, '*Mobile*');
    assert.equal((await handler({ type: 'insert', markdown: result.markdown })).ok, true);
    note = { ...note, id: 'two' };
    assert.match((await handler({ type: 'insert', markdown: 'wrong note' })).error, /筆記已切換/);
});
