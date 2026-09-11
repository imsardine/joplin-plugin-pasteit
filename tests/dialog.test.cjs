const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function setup(platform) {
    const commands = { pasteAsMarkdown: () => assert.fail('Built-in paste command must not be used') }, settings = {}, errors = [], inserted = [], copied = [], opened = [], replies = [], rendered = [];
    let start, note = { id: 'one', markup_language: 1 };
    const api = {
        window: { loadChromeCssFile: async path => { assert.equal(platform, 'desktop'); assert.equal(path, '/plugin/chrome.css'); } },
        plugins: { installationDir: async () => '/plugin', register: p => { start = p.onStart; } },
        settings: { registerSection: async () => {}, registerSettings: async items => { for (const [k,v] of Object.entries(items)) settings[k] = v.value; }, value: async k => settings[k] },
        versionInfo: async () => ({ platform }), workspace: { selectedNote: async () => note },
        // Neither platform may read clipboard data through the plugin API.
        clipboard: { readHtml: () => assert.fail('Unexpected clipboard read'), readText: () => assert.fail('Unexpected clipboard read'), writeText: async text => copied.push(text) },
        commands: { register: async c => { assert.equal(commands[c.name], undefined, 'Command must not collide with a built-in'); commands[c.name] = c.execute; }, execute: async (name, text) => { assert.equal(name, 'insertText'); inserted.push(text); } },
        views: { toolbarButtons: { create: async (_id, command) => { assert.equal(command, 'pasteItPlugin.openDialog'); } }, menuItems: { create: async (_id, command) => { assert.equal(command, 'pasteItPlugin.openDialog'); } }, dialogs: {
            create: async id => id, addScript: async () => {},
            setFitToContent: async (_id, enabled) => { assert.equal(enabled, false, 'Joplin must size the dialog from its host window on both platforms'); },
            setButtons: async () => {},
            setHtml: async (_id, value) => rendered.push(value),
            open: async id => { opened.push(id); const r = replies.shift(); return typeof r === 'function' ? r() : r || { id: 'cancel' }; },
            showMessageBox: async text => errors.push(text),
        } },
    };
    vm.runInNewContext(fs.readFileSync('dist/index.js', 'utf8'), { joplin: api, console, setTimeout, clearTimeout, setInterval, clearInterval });
    await start();
    return { commands, errors, inserted, copied, opened, replies, rendered, switchNote: () => { note = { ...note, id: 'two' }; } };
}
for (const platform of ['desktop', 'mobile']) test(`${platform} opens one dialog, starts empty and inserts edited Markdown`, async () => {
    const h = await setup(platform);
    assert.deepEqual(Object.keys(h.commands), ['pasteAsMarkdown', 'pasteItPlugin.openDialog']);
    h.replies.push({ id: 'ok', formData: { paste: { markdown: '**Hello** edited', draft: 'saved-draft' } } });
    await h.commands['pasteItPlugin.openDialog']();
    assert.deepEqual(h.opened, ['pasteItPluginDialog']);
    assert.deepEqual(h.inserted, ['**Hello** edited']);
    await h.commands['pasteItPlugin.openDialog']();
    assert.notEqual(h.rendered[0], h.rendered[1]);
    assert.doesNotMatch(h.rendered[1], /saved-draft|Hello/);
    assert.match(h.rendered[1], /<textarea[^>]*><\/textarea>/);
    assert.equal(/<textarea[^>]*\bautofocus\b/.test(h.rendered[1]), platform === 'desktop');
    assert.match(h.rendered[1], /<\/textarea>\s*<button id="clear"/);
});
test('cancel never inserts; changed notes are rejected', async () => {
    const h = await setup('mobile'); await h.commands['pasteItPlugin.openDialog']();
    h.replies.push(() => { h.switchNote(); return { id: 'ok', formData: { paste: { markdown: 'wrong note' } } }; });
    await h.commands['pasteItPlugin.openDialog']();
    assert.deepEqual(h.inserted, []); assert.match(h.errors[0], /selected note changed/);
});
