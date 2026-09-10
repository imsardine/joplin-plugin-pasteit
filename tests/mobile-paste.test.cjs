const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
    const handlers = {};
    const elements = Object.fromEntries(['source', 'clipboardHtml', 'rawHtml', 'status', 'pasteDiagnostic', 'diagnostic'].map(id => [id, { value: '', textContent: '', addEventListener: (event, fn) => { handlers[event] = fn; } }]));
    vm.runInNewContext(fs.readFileSync('src/mobile-paste.js', 'utf8'), { document: { getElementById: id => elements[id] } });
    return { handlers, elements };
}
test('captured HTML survives redundant input and diagnostic excludes content', () => {
    const { handlers, elements } = setup();
    handlers.paste({ clipboardData: { types: ['text/html', 'text/plain'], getData: type => type === 'text/html' ? '<b>secret</b>' : 'secret' }, preventDefault() {} });
    handlers.input();
    assert.equal(elements.clipboardHtml.value, '<b>secret</b>');
    assert.match(elements.pasteDiagnostic.value, /HTML=13/);
    assert.doesNotMatch(elements.pasteDiagnostic.value, /secret/);
    elements.source.value = 'edited'; handlers.input();
    assert.equal(elements.clipboardHtml.value, '');
});
test('diagnostic distinguishes plain-only paste from keyboard input without paste', () => {
    const a = setup();
    a.handlers.paste({ clipboardData: { types: ['text/plain'], getData: type => type === 'text/plain' ? 'plain' : '' }, preventDefault() {} });
    assert.match(a.elements.pasteDiagnostic.value, /HTML=0/);
    const b = setup(); b.elements.source.value = 'plain'; b.handlers.input();
    assert.match(b.elements.pasteDiagnostic.value, /未觸發 paste/);
});
