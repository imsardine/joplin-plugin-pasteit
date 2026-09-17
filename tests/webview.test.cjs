const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createWindow } = require('@mixmark-io/domino');
function setup(mobile = false) {
    const window = createWindow(`<div role="tablist"><button id="tab-markdown" role="tab" aria-selected="true"></button></div><p id="status">Ready to paste.</p><div id="content-panels"><div id="panel-markdown"><textarea id="markdown"></textarea></div></div><fieldset id="options"><input type="checkbox" data-option="removeTextStyling"><input type="checkbox" data-option="addBlockQuote"><input type="checkbox" data-option="tableHtmlLists" checked><input type="checkbox" data-option="cleanTracking" checked><input type="text" data-option="extraTracking" value=""></fieldset><input id="draft"><button id="clear"></button>`);
    const document = window.document;
    const timers = [];
    let focusCount = 0;
    if (mobile) {
        document.body.className = 'paste-dialog mobile';
        Object.defineProperty(document.getElementById('markdown'), 'focus', { value: () => { focusCount++; } });
    }
    const $ = id => document.getElementById(id);
    const listeners = {};
    for (const id of ['markdown', 'options', 'clear', 'tab-markdown']) $(id).addEventListener = (event, fn) => { listeners[id + ':' + event] = fn; };
    // Browser bundle has no Joplin/Node API and no clipboard.read permission.
    vm.runInNewContext(fs.readFileSync('dist/webview.js', 'utf8'), { window, document, console, setTimeout: mobile ? callback => timers.push(callback) : setTimeout, clearTimeout, setInterval, clearInterval });
    const pasteFormats = values => listeners['markdown:paste']({ clipboardData: { types: Object.keys(values), getData: type => values[type] || '' }, preventDefault() {} });
    const paste = (html, text) => pasteFormats(Object.fromEntries(Object.entries({ 'text/html': html, 'text/plain': text }).filter(([, value]) => value)));
    const tab = mime => document.querySelector(`[data-mime="${mime}"]`) || null;
    const panel = mime => tab(mime) && $(tab(mime).getAttribute('aria-controls'));
    const field = mime => panel(mime)?.querySelector('textarea');
    const key = (button, value) => { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); event.key = value; button.dispatchEvent(event); };
    return { $, document, listeners, paste, pasteFormats, tab, panel, field, key, timers, focusCount: () => focusCount };

}
test('paste automatically replaces the field with Markdown without a second screen', () => {
    const h = setup(); h.paste('<b>Hello</b> <code>code</code>', 'Hello code');
    assert.equal(h.$('markdown').value, '**Hello** `code`');
    h.listeners['markdown:input']({ inputType: 'insertFromPaste' });
    h.listeners['options:input']();
    assert.equal(h.$('markdown').value, '**Hello** `code`');
});
test('options reconvert original HTML, preserve inline code, and can restore styling', () => {
    const h = setup(); h.paste('<b>Hello</b> <code>code</code>', 'Hello code');
    const toggle = h.document.querySelector('[data-option="removeTextStyling"]');
    toggle.checked = true; h.listeners['options:input']();
    assert.equal(h.$('markdown').value, 'Hello `code`');
    h.$('markdown').value = 'manual edit'; h.listeners['markdown:input']({ inputType: 'insertText' });
    toggle.checked = false; h.listeners['options:input']();
    assert.equal(h.$('markdown').value, '**Hello** `code`');
});
test('no HTML shows the requested message and still cleans links', () => {
    const h = setup(); h.paste('', 'https://x.test/?id=1&utm_source=x');
    assert.equal(h.$('markdown').value, 'https://x.test/?id=1');
    assert.equal(h.$('status').textContent, 'No styling or structure information is available for conversion.');
});
test('quote option rebuilds original without accumulating quote levels', () => {
    const h = setup(); h.paste('<blockquote>Hello</blockquote>', 'Hello');
    const toggle = h.document.querySelector('[data-option="addBlockQuote"]');
    toggle.checked = true; h.listeners['options:input'](); h.listeners['options:input']();
    assert.equal(h.$('markdown').value, '> > Hello');
    toggle.checked = false; h.listeners['options:input']();
    assert.equal(h.$('markdown').value, '> Hello');
});
test('native keyboard input without a paste event reports missing HTML', () => {
    const h = setup(); h.$('markdown').value = 'native paste'; h.listeners['markdown:input']({ inputType: 'insertText' });
    assert.match(h.$('status').textContent, /No styling or structure/);
});

test('mobile does not automatically focus on opening or clearing', () => {
    const h = setup(true);
    assert.equal(h.focusCount(), 0);
    assert.equal(h.timers.length, 0);
    h.listeners['clear:click']();
    assert.equal(h.focusCount(), 0);
});

test('table list option switches modes and restores nesting from the original paste', () => {
    const h = setup();
    h.paste('<table><tr><th>Items</th></tr><tr><td><ul><li><b>Fruit</b><ol><li>Apple</li></ol></li></ul></td></tr></table>', 'Fruit Apple');
    const original = h.$('markdown').value;
    assert.match(original, /<ul><li>\*\*Fruit\*\*<ol><li>Apple<\/li><\/ol><\/li><\/ul>/);
    const toggle = h.document.querySelector('[data-option="tableHtmlLists"]');
    toggle.checked = false; h.listeners['options:input']();
    assert.equal(h.$('markdown').value, '| Items |\n| --- |\n| - **Fruit**<br>1. Apple |');
    toggle.checked = true; h.listeners['options:input']();
    assert.equal(h.$('markdown').value, original);
});
test('every string MIME type uses the same dynamically created source tab', () => {
    const h = setup();
    assert.equal(h.document.querySelectorAll('[role="tab"]').length, 1);
    const formats = { 'text/plain': ' Hello\n', 'text/html': '<b>Hello</b>', 'text/rtf': '{\\rtf1 Hello}', 'application/example': '<raw>value</raw>' };
    h.pasteFormats(formats);
    assert.equal(h.document.querySelectorAll('[role="tab"]').length, 5);
    for (const [type, value] of Object.entries(formats)) {
        assert.equal(h.tab(type).textContent, '📋 ' + type);
        assert.equal(h.field(type).value, value);
        assert.equal(h.field(type).readOnly, true);
        assert.equal(h.field(type).hasAttribute('name'), false);
        assert.equal(h.field(type).getAttribute('aria-describedby'), 'status');
        h.tab(type).click();
        assert.equal(h.$('status').textContent, 'Original clipboard data · Read-only');
        assert.equal(h.panel(type).hidden, false);
        assert.equal(h.$('panel-markdown').hidden, true);
    }
    const oldTab = h.tab('text/html');
    h.paste('', 'Next');
    assert.equal(h.document.contains(oldTab), false);
    assert.equal(h.tab('text/html'), null);
    assert.equal(h.document.querySelectorAll('[role="tab"]').length, 2);
    h.listeners['clear:click']();
    assert.equal(h.document.querySelectorAll('[role="tab"]').length, 1);
    assert.equal(h.$('content-panels').children.length, 1);
});
test('tab switches preserve edits and source payload while options update Markdown', () => {
    const h = setup(); h.paste('<b>Hello</b>', 'Hello');
    h.$('markdown').value = 'edited'; h.listeners['markdown:input']({ inputType: 'insertText' });
    h.tab('text/html').click();
    h.listeners['tab-markdown:click']();
    assert.equal(h.$('markdown').value, 'edited');
    h.tab('text/plain').click();
    h.document.querySelector('[data-option="removeTextStyling"]').checked = true;
    h.listeners['options:input']();
    assert.equal(h.$('markdown').value, 'Hello');
    assert.equal(h.field('text/html').value, '<b>Hello</b>');
    assert.equal(h.panel('text/plain').hidden, false);
});
test('keyboard navigation includes dynamically received formats and resets on new paste', () => {
    const h = setup(); h.pasteFormats({ 'text/rtf': 'RTF', 'text/plain': 'Text' });
    h.listeners['tab-markdown:keydown']({ key: 'ArrowRight', preventDefault() {} });
    assert.equal(h.panel('text/rtf').hidden, false);
    h.key(h.tab('text/rtf'), 'ArrowRight');
    assert.equal(h.panel('text/plain').hidden, false);
    h.key(h.tab('text/plain'), 'Home');
    assert.equal(h.$('panel-markdown').hidden, false);
    h.tab('text/plain').click(); h.paste('<i>New</i>', 'New');
    assert.equal(h.$('panel-markdown').hidden, false);
    assert.equal(h.panel('text/plain').hidden, true);
});
test('empty advertised string formats are listed without erasing an existing edit', () => {
    const h = setup(); h.$('markdown').value = 'Keep';
    h.pasteFormats({ 'text/html': '', 'text/plain': '' });
    assert.equal(h.$('markdown').value, 'Keep');
    assert.equal(h.document.querySelectorAll('[role="tab"]').length, 3);
});
test('shared status follows the active tab and preserves the Markdown conversion state', () => {
    const h = setup();
    assert.equal(h.$('status').textContent, 'Ready to paste.');
    h.paste('<b>Hello</b>', 'Hello');
    assert.equal(h.$('status').textContent, 'Converted to Markdown. You can edit the result.');
    h.tab('text/html').click();
    h.listeners['options:input']();
    assert.equal(h.$('status').textContent, 'Original clipboard data · Read-only');
    h.listeners['tab-markdown:click']();
    assert.equal(h.$('status').textContent, 'Converted to Markdown. You can edit the result.');
    h.tab('text/plain').click();
    h.listeners['clear:click']();
    assert.equal(h.$('status').textContent, 'Ready to paste.');
    h.paste('', 'Plain'); h.tab('text/plain').click(); h.listeners['tab-markdown:click']();
    assert.equal(h.$('status').textContent, 'No styling or structure information is available for conversion.');
});
test('binary MIME types are listed without panels, reading bytes or erasing Markdown', () => {
    const h = setup(); h.$('markdown').value = 'Keep edits';
    h.listeners['markdown:paste']({ clipboardData: {
        types: ['Files'], items: [{ kind: 'file', type: 'image/png', getAsFile() { throw Error('Must not read'); } }],
        files: [{ type: 'image/png' }], getData() { throw Error('No string data'); },
    }, preventDefault() {} });
    assert.equal(h.tab('image/png').textContent, '📋 image/png · binary');
    assert.equal(h.tab('image/png').hasAttribute('role'), false);
    assert.equal(h.$('content-panels').children.length, 1);
    assert.equal(h.$('markdown').value, 'Keep edits');
    assert.match(h.$('status').textContent, /No supported text/);
    h.listeners['options:input']();
    assert.equal(h.$('markdown').value, 'Keep edits');
    h.listeners['clear:click']();
    assert.equal(h.tab('image/png'), null);
});
test('mixed clipboard formats list text and binary and deduplicate file MIME types', () => {
    const h = setup();
    h.listeners['markdown:paste']({ clipboardData: {
        types: ['text/plain', 'Files'], items: [{ kind: 'string', type: 'text/plain' }, { kind: 'file', type: 'image/png' }],
        files: [{ type: 'image/png' }, { type: 'application/pdf' }, { type: '' }], getData: () => 'Hello',
    }, preventDefault() {} });
    assert.equal(h.$('markdown').value, 'Hello');
    assert.equal(h.document.querySelectorAll('[data-mime]').length, 4);
    assert.equal(h.tab('').textContent, '📋 Unknown type · binary');
    assert.equal(h.tab('application/octet-stream'), null);
    assert.equal(h.field('text/plain').value, 'Hello');
    h.listeners['tab-markdown:keydown']({ key: 'ArrowRight', preventDefault() {} });
    assert.equal(h.panel('text/plain').hidden, false);
    h.key(h.tab('text/plain'), 'ArrowRight');
    assert.equal(h.$('panel-markdown').hidden, false);
    h.paste('', 'Next');
    assert.equal(h.tab('application/pdf'), null);
});
