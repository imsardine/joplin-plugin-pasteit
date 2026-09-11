const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createWindow } = require('@mixmark-io/domino');
function setup(mobile = false) {
    const window = createWindow(`<textarea id="markdown"></textarea><p id="status"></p><fieldset id="options"><input type="checkbox" data-option="removeTextStyling"><input type="checkbox" data-option="addBlockQuote"><input type="checkbox" data-option="cleanTracking" checked><input type="text" data-option="extraTracking" value=""></fieldset><input id="draft"><button id="clear"></button>`);
    const document = window.document;
    const timers = [];
    let focusCount = 0;
    if (mobile) {
        document.body.className = 'paste-dialog mobile';
        Object.defineProperty(document.getElementById('markdown'), 'focus', { value: () => { focusCount++; } });
    }
    const $ = id => document.getElementById(id);
    const listeners = {};
    for (const id of ['markdown', 'options', 'clear']) $(id).addEventListener = (event, fn) => { listeners[id + ':' + event] = fn; };
    // Browser bundle has no Joplin/Node API and no clipboard.read permission.
    vm.runInNewContext(fs.readFileSync('dist/webview.js', 'utf8'), { window, document, console, setTimeout: mobile ? callback => timers.push(callback) : setTimeout, clearTimeout, setInterval, clearInterval });
    const paste = (html, text) => listeners['markdown:paste']({ clipboardData: { getData: type => type === 'text/html' ? html : text }, preventDefault() {} });
    return { $, document, listeners, paste, timers, focusCount: () => focusCount };
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
