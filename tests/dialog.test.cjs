const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function setup(platform) {
    const commands = { pasteAsMarkdown: () => assert.fail('Built-in paste command must not be used') }, declarations = {}, editorHandlers = {}, settings = {}, errors = [], inserted = [], copied = [], opened = [], replies = [], rendered = [], editorCalls = [], toolbar = [], menus = [];
    let start, note = { id: 'one', markup_language: 1 };
    const api = {
        contentScripts: { register: async (type, id, path) => { assert.equal(type, 'codeMirrorPlugin'); assert.equal(id, 'pasteItQuoteEditor'); assert.equal(path, './quoteEditor.js'); } },
        window: { loadChromeCssFile: async path => { assert.equal(platform, 'desktop'); assert.equal(path, '/plugin/chrome.css'); } },
        plugins: { installationDir: async () => '/plugin', register: p => { start = p.onStart; } },
        settings: { registerSection: async () => {}, registerSettings: async items => { for (const [k,v] of Object.entries(items)) settings[k] = v.value; }, value: async k => settings[k] },
        versionInfo: async () => ({ platform }), workspace: { selectedNote: async () => note },
        // Default dialog mode must not read the clipboard; direct-paste tests opt in below.
        clipboard: { readHtml: () => assert.fail('Unexpected clipboard read'), readText: () => assert.fail('Unexpected clipboard read'), writeText: async text => copied.push(text) },
        commands: { register: async c => { assert.equal(commands[c.name], undefined, 'Command must not collide with a built-in'); declarations[c.name] = c; commands[c.name] = c.execute; }, execute: async (name, text) => { if (name === 'editor.execCommand') { editorCalls.push(text); return editorHandlers[text.name]?.(...text.args); } assert.equal(name, 'insertText'); inserted.push(text); } },
        views: { toolbarButtons: { create: async (_id, command, location) => { toolbar.push({ command, location }); } }, menuItems: { create: async (_id, command, location) => { menus.push({ command, location }); } }, dialogs: {
            create: async id => id, addScript: async () => {},
            setFitToContent: async (_id, enabled) => { assert.equal(enabled, false, 'Both dialogs must use host-window sizing to avoid narrow option fields'); },
            setButtons: async () => {},
            setHtml: async (_id, value) => rendered.push(value),
            open: async id => { opened.push(id); const r = replies.shift(); return typeof r === 'function' ? r() : r || { id: 'cancel' }; },
            showMessageBox: async text => errors.push(text),
        } },
    };
    vm.runInNewContext(fs.readFileSync('dist/index.js', 'utf8'), { joplin: api, console, setTimeout, clearTimeout, setInterval, clearInterval });
    await start();
    return { clipboard: api.clipboard, editorHandlers, declarations, editorCalls, toolbar, menus, setNote: value => { note = value; }, settings, commands, errors, inserted, copied, opened, replies, rendered, switchNote: () => { note = { ...note, id: 'two' }; } };
}
for (const platform of ['desktop', 'mobile']) test(`${platform} opens one dialog, starts empty and inserts edited Markdown`, async () => {
    const h = await setup(platform);
    assert.deepEqual(Object.keys(h.commands), ['pasteAsMarkdown', 'pasteItPlugin.toggleQuote', 'pasteItPlugin.openDialog', 'pasteItPlugin.cleanSelection']);
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

test('saved table list preference is reflected each time the dialog opens', async () => {
    const h = await setup('desktop');
    assert.equal(h.settings.tableHtmlLists, true);
    await h.commands['pasteItPlugin.openDialog']();
    assert.match(h.rendered[0], /data-option="tableHtmlLists" type="checkbox" checked/);
    h.settings.tableHtmlLists = false;
    await h.commands['pasteItPlugin.openDialog']();
    assert.match(h.rendered[1], /data-option="tableHtmlLists" type="checkbox" > /);
});

for (const platform of ['desktop', 'mobile']) test(`${platform} exposes quote commands outside the paste dialog`, async () => {
    const h = await setup(platform);
    for (const action of ['toggleQuote']) {
        const name = 'pasteItPlugin.' + action;
        assert.ok(h.toolbar.some(item => item.command === name && item.location === 'editorToolbar'));
        assert.equal(h.menus.filter(item => item.command === name).length, platform === 'desktop' ? 2 : 0);
        await h.commands[name]();
    }
    assert.deepEqual(h.editorCalls.map(call => call.name), ['pasteItPlugin.toggleQuote']);
    assert.deepEqual(h.opened, []);
    h.setNote(null);
    await h.commands['pasteItPlugin.toggleQuote']();
    h.setNote({ id: 'html', markup_language: 2 });
    await h.commands['pasteItPlugin.toggleQuote']();
    assert.equal(h.editorCalls.length, 1);
});

test('quote command is enabled in the desktop Markdown editor with or without selected text', async () => {
    const h = await setup('desktop');
    const condition = h.declarations['pasteItPlugin.toggleQuote'].enabledCondition;
    // Use real Joplin context names, and fail if a condition refers to an unknown name.
    const context = { markdownEditorPaneVisible: true, oneNoteSelected: true, noteIsMarkdown: true, noteIsReadOnly: false, modalDialogVisible: false, gotoAnythingVisible: false, textSelected: false };
    const enabled = overrides => vm.runInNewContext(condition, { ...context, ...overrides });
    assert.equal(enabled({}), true);
    assert.equal(enabled({ textSelected: true }), true);
    assert.equal(enabled({ modalDialogVisible: true, gotoAnythingVisible: true }), true);
    for (const overrides of [{ markdownEditorPaneVisible: false }, { oneNoteSelected: false }, { noteIsMarkdown: false }, { noteIsReadOnly: true }, { modalDialogVisible: true }]) {
        assert.equal(enabled(overrides), false);
    }
});
test('mobile quote command does not depend on desktop-only context variables', async () => {
    const h = await setup('mobile');
    assert.equal(h.declarations['pasteItPlugin.toggleQuote'].enabledCondition, undefined);
    await h.commands['pasteItPlugin.toggleQuote']();
    assert.equal(h.editorCalls.length, 1);
});

function prepareCleanup(h, text = '**Bold** ==highlight== [Link](https://x.test/?id=1&utm_source=x)') {
    h.editorHandlers['pasteItPlugin.captureSelection'] = () => ({ token: 'original', text });
    const applied = [];
    h.editorHandlers['pasteItPlugin.applyCleanup'] = (token, result) => { applied.push({ token, result }); return true; };
    return applied;
}
for (const platform of ['desktop', 'mobile']) test(`${platform} cleanup dialog offers options without a text preview`, async () => {
    const h = await setup(platform), applied = prepareCleanup(h);
    assert.equal(h.settings.cleanupShowDialog, true);
    h.replies.push({ id: 'ok', formData: { cleanup: { removeTextStyling: 'on', cleanTracking: 'on', extraTracking: '' } } });
    await h.commands['pasteItPlugin.cleanSelection']();
    assert.deepEqual(h.opened, ['pasteItCleanupDialog']);
    assert.doesNotMatch(h.rendered[0], /textarea|readonly|preview/i);
    assert.match(h.rendered[0], /name="removeTextStyling"/);
    assert.match(h.rendered[0], /name="cleanTracking"/);
    assert.deepEqual(applied, [{ token: 'original', result: 'Bold highlight [Link](https://x.test/?id=1)' }]);
    assert.equal(h.editorCalls.at(-1).name, 'pasteItPlugin.discardSelection');
});
test('cleanup requires a selection and cancellation leaves it unchanged', async () => {
    const h = await setup('desktop');
    await h.commands['pasteItPlugin.cleanSelection']();
    assert.deepEqual(h.opened, []);
    assert.match(h.errors[0], /Select the text/);
    const applied = prepareCleanup(h);
    await h.commands['pasteItPlugin.cleanSelection']();
    assert.deepEqual(applied, []);
});
test('cleanup can run directly using global options without opening a dialog', async () => {
    const h = await setup('desktop'), applied = prepareCleanup(h);
    h.settings.cleanupShowDialog = false;
    h.settings.removeTextStyling = true;
    h.settings.extraTracking = 'id';
    await h.commands['pasteItPlugin.cleanSelection']();
    assert.deepEqual(h.opened, []);
    assert.deepEqual(applied, [{ token: 'original', result: 'Bold highlight [Link](https://x.test/)' }]);
    await h.commands['pasteItPlugin.openDialog']();
    assert.doesNotMatch(h.rendered[0], /data-option="cleanupShowDialog"/);
});
test('cleanup with no selected options does not change text', async () => {
    const h = await setup('desktop'), applied = prepareCleanup(h);
    h.replies.push({ id: 'ok', formData: { cleanup: {} } });
    await h.commands['pasteItPlugin.cleanSelection']();
    assert.deepEqual(applied, []);
});
test('cleanup rejects a note switch while its dialog is open', async () => {
    const h = await setup('desktop'), applied = prepareCleanup(h);
    h.replies.push(() => { h.switchNote(); return { id: 'ok', formData: { cleanup: { removeTextStyling: 'on' } } }; });
    await h.commands['pasteItPlugin.cleanSelection']();
    assert.deepEqual(applied, []);
    assert.match(h.errors[0], /selected note changed/);
});

test('Clear formatting is the registered command label', async () => {
    const h = await setup('desktop');
    assert.equal(h.declarations['pasteItPlugin.cleanSelection'].label, 'Clear formatting');
});
test('desktop direct paste reads HTML and applies global conversion settings', async () => {
    const h = await setup('desktop');
    assert.equal(h.settings.pasteShowDialog, true);
    h.settings.pasteShowDialog = false;
    h.settings.removeTextStyling = true;
    h.settings.addBlockQuote = true;
    h.clipboard.readHtml = async () => '<mark>Highlight</mark> <a href="https://x.test/?id=1&utm_source=x">Link</a>';
    h.clipboard.readText = async () => 'Highlight Link';
    await h.commands['pasteItPlugin.openDialog']();
    assert.deepEqual(h.opened, []);
    assert.deepEqual(h.inserted, ['> Highlight [Link](https://x.test/?id=1)']);
});
test('mobile always opens the dialog, even if a desktop preference disables it', async () => {
    const h = await setup('mobile');
    assert.equal(h.settings.pasteShowDialog, undefined);
    h.settings.pasteShowDialog = false;
    await h.commands['pasteItPlugin.openDialog']();
    assert.deepEqual(h.opened, ['pasteItPluginDialog']);
    assert.deepEqual(h.inserted, []);
});
test('direct paste rejects empty clipboard and note switches, and can return to dialog mode', async () => {
    const h = await setup('desktop');
    h.settings.pasteShowDialog = false;
    h.clipboard.readHtml = async () => '';
    h.clipboard.readText = async () => '';
    await h.commands['pasteItPlugin.openDialog']();
    assert.deepEqual(h.inserted, []);
    assert.match(h.errors[0], /clipboard has no text/);
    h.clipboard.readText = async () => { h.switchNote(); return 'Text'; };
    await h.commands['pasteItPlugin.openDialog']();
    assert.deepEqual(h.inserted, []);
    assert.match(h.errors[1], /selected note changed/);
    h.settings.pasteShowDialog = true;
    await h.commands['pasteItPlugin.openDialog']();
    assert.deepEqual(h.opened, ['pasteItPluginDialog']);
    assert.doesNotMatch(h.rendered[0], /data-option="pasteShowDialog"/);
});
