const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { cleanMarkdown } = require('../src/cleanup.ts');
const { defaults } = require('../src/converter.ts');
const clean = (text, options = {}) => cleanMarkdown(text, { ...defaults, removeTextStyling: true, ...options });

test('cleanup removes nested styling without rewriting structure, escapes or literal underscores', () => {
    const source = '# **Title**\r\n\r\n- ***Bold italic*** and ~~old~~\r\n> __Quote__\r\n\r\n| Header |\r\n| :--- |\r\n| *Value* |\r\n\r\nfile_name.txt \\*literal\\*\r\n';
    assert.equal(clean(source), '# Title\r\n\r\n- Bold italic and old\r\n> Quote\r\n\r\n| Header |\r\n| :--- |\r\n| Value |\r\n\r\nfile_name.txt \\*literal\\*\r\n');
});
test('cleanup preserves inline, fenced, indented and HTML code', () => {
    const source = '`**code** https://x.test/?utm_source=x`\n\n```md\n**Bold** https://x.test/?utm_source=x\n```\n\n    **Code** https://x.test/?utm_source=x\n\n<code>**Code** https://x.test/?utm_source=x</code>\n\n<pre>**Code** https://x.test/?utm_source=x</pre>';
    assert.equal(clean(source), source);
});
test('cleanup shares URL rules across links, images, references and bare URLs', () => {
    const source = '[**Read**](https://x.test/a(b)?id=1&utm_source=x&id=2#f "Title")\n![Image](https://x.test/i?fbclid=x)\n<https://x.test/?gclid=x>\nhttps://x.test/?id=1&utm_medium=x.\n\n[ref]: <https://x.test/?id=2&utm_source=x> "Ref"\n[link][ref]';
    assert.equal(clean(source), '[Read](https://x.test/a(b)?id=1&id=2#f "Title")\n![Image](https://x.test/i)\n<https://x.test/>\nhttps://x.test/?id=1.\n\n[ref]: <https://x.test/?id=2> "Ref"\n[link][ref]');
});
test('cleanup options are independent and support extra tracking parameters', () => {
    const source = '**Bold** [Link](https://x.test/?ref=1&utm_source=x)';
    assert.equal(clean(source, { cleanTracking: false }), 'Bold [Link](https://x.test/?ref=1&utm_source=x)');
    assert.equal(clean(source, { removeTextStyling: false }), '**Bold** [Link](https://x.test/?ref=1)');
    assert.equal(clean(source, { extraTracking: 'ref' }), 'Bold [Link](https://x.test/)');
    assert.equal(clean(source, { removeTextStyling: false, cleanTracking: false }), source);
});
test('cleanup preserves HTML list structure and cleans inline styling and HTML links', () => {
    assert.equal(clean('| Items |\n| --- |\n| <ul><li>**Bold** <i>Italic</i></li></ul> |'), '| Items |\n| --- |\n| <ul><li>Bold Italic</li></ul> |');
    assert.equal(clean('<a href="https://x.test/?id=1&amp;utm_source=x">Read</a>'), '<a href="https://x.test/?id=1">Read</a>');
    assert.equal(clean('[Read](https://x.test/?id=1&amp;utm_source=x&amp;q=a%20b)'), '[Read](https://x.test/?id=1&amp;q=a%20b)');
});
test('cleanup removes Joplin highlight markers while protecting code, URLs and escaped markers', () => {
    const source = '==Highlight== and ==**bold**== and **==nested==**\n\n| H |\n| --- |\n| ==cell== |\n\n`==code==` \\==literal== [link](https://x.test/?q===value==) https://x.test/?q===value==';
    assert.equal(clean(source), 'Highlight and bold and nested\n\n| H |\n| --- |\n| cell |\n\n`==code==` \\==literal== [link](https://x.test/?q===value==) https://x.test/?q===value==');
    assert.equal(clean('==Keep==', { removeTextStyling: false }), '==Keep==');
    assert.equal(clean('== spaced == and ===literal==='), '== spaced == and ===literal===');
});
