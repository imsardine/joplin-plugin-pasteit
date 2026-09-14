const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { convert, defaults, cleanUrl } = require('../src/converter.ts');
const html = (value, options = {}) => convert({ html: value }, { ...defaults, ...options });
test('tables preserve headers, alignment, captions and surrounding paragraphs', () => {
    assert.equal(html('<p>Before</p><table><caption>Items</caption><thead><tr><th>Name</th><th style="text-align:right">Price</th></tr></thead><tbody><tr><td>Tea</td><td>20</td></tr></tbody></table><p>After</p>'),
        'Before\n\nItems\n\n| Name | Price |\n| --- | ---: |\n| Tea | 20 |\n\nAfter');
});
test('tables without headers retain the first row and pad uneven rows', () => {
    assert.equal(html('<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>'),
        '|  |  |\n| --- | --- |\n| A | B |\n| C |  |');
    assert.equal(html('<table><tr><th></th><th>B</th></tr><tr><td></td><td></td></tr></table>'),
        '|  | B |\n| --- | --- |\n|  |  |');
});
test('table cells escape pipes, retain line breaks and honor conversion options', () => {
    const source = '<table><tr><th>Value</th></tr><tr><td><b>A|B</b><br><a href="https://x.test/?id=1&amp;utm_source=x">Link</a><p><code>x|y</code></p></td></tr></table>';
    assert.equal(html(source), '| Value |\n| --- |\n| **A\\|B**<br>[Link](https://x.test/?id=1)<br>`x\\|y` |');
    assert.equal(html(source, { removeTextStyling: true, addBlockQuote: true }),
        '> | Value |\n> | --- |\n> | A\\|B<br>[Link](https://x.test/?id=1)<br>`x\\|y` |');
});
test('merged cells expand into blank placeholders without shifting later cells', () => {
    assert.equal(html('<table><tr><th colspan="2">Header</th></tr><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>'),
        '| Header |  |\n| --- | --- |\n| A | B |\n|  | C |');
});
test('table lists retain HTML structure with Markdown styling and cleaned links', () => {
    const source = '<table><tr><th>Items</th></tr><tr><td><ul class="source" onclick="bad()"><li><b>Bold</b><ol start="3"><li><em>Italic</em> <s>Old</s> <code>x|y</code></li></ol></li><li><a href="https://x.test/?id=1&amp;utm_source=x">Link</a></li></ul></td></tr></table>';
    assert.equal(html(source), '| Items |\n| --- |\n| <ul><li>**Bold**<ol start="3"><li>*Italic* ~~Old~~ `x\\|y`</li></ol></li><li>[Link](https://x.test/?id=1)</li></ul> |');
    assert.equal(html(source, { removeTextStyling: true, addBlockQuote: true }), '> | Items |\n> | --- |\n> | <ul><li>Bold<ol start="3"><li>Italic Old `x\\|y`</li></ol></li><li>[Link](https://x.test/?id=1)</li></ul> |');
});
test('table lists preserve item paragraphs and leave lists outside tables as Markdown', () => {
    assert.equal(html('<ul><li>Outside</li></ul><table><tr><th><ol><li>Header</li></ol></th></tr><tr><td><ul><li><p>First</p><p>Second</p></li><li>Third<br>Fourth</li></ul></td></tr></table>'),
        '-   Outside\n\n| <ol><li>Header</li></ol> |\n| --- |\n| <ul><li>First<br>Second</li><li>Third<br>Fourth</li></ul> |');
});
test('table lists can use line breaks while retaining Markdown styling and numbering', () => {
    assert.equal(defaults.tableHtmlLists, true);
    const source = '<table><tr><th>Items</th></tr><tr><td><ul><li><b>Fruit</b><ol start="3"><li><em>Apple</em></li></ol></li><li>Tea</li></ul></td></tr></table>';
    assert.equal(html(source, { tableHtmlLists: false }), '| Items |\n| --- |\n| - **Fruit**<br>3. *Apple*<br>- Tea |');
    assert.equal(html(source, { tableHtmlLists: false, removeTextStyling: true, addBlockQuote: true }), '> | Items |\n> | --- |\n> | - Fruit<br>3. Apple<br>- Tea |');
});
test('nested and empty tables do not duplicate rows or lose content', () => {
    const output = html('<table><tr><th>Outer</th></tr><tr><td><table><tr><td>Inner</td></tr></table></td></tr></table>');
    assert.equal(output.split('\n').length, 3);
    assert.equal(output.match(/Inner/g).length, 1);
    assert.equal(html('<table></table>'), '');
});
test('nested semantic formatting and independent toggles', () => {
    assert.equal(html('<p><strong>粗體 <em>斜體</em></strong></p>'), '**粗體 *斜體***');
    assert.equal(html('<b>粗體</b> <i>斜體</i> <del>刪除</del>', { removeTextStyling: true }), '粗體 斜體 刪除');
});
test('inline CSS from rich clipboard sources', () => {
    assert.equal(html('<span style="font-weight:700;font-style:italic">Hello</span>'), '***Hello***');
});
test('headings lists quotes and code', () => {
    const value = html('<h2>Title</h2><ul><li>One</li><li>Two</li></ul><blockquote>Quote</blockquote><pre><code>a &lt; b</code></pre>');
    assert.match(value, /^## Title/); assert.match(value, /-\s+One/); assert.match(value, /> Quote/); assert.match(value, /```\na < b\n```/);
    assert.equal(html('<h1>Title</h1><blockquote>Quote</blockquote>', { removeTextStyling: true }), '# Title\n\n> Quote');
});
test('tracking cleanup preserves raw query encoding, duplicates, fragment and functional parameters', () => {
    assert.equal(cleanUrl('https://x.test/p?id=1&utm_source=a&id=2&q=a%20b&fbclid=x#part', defaults), 'https://x.test/p?id=1&id=2&q=a%20b#part');
    assert.equal(cleanUrl('https://x.test/?%75TM_source=x&GCLID=y#x', defaults), 'https://x.test/#x');
    assert.equal(cleanUrl('https://x.test/?ref=abc&source=news', defaults), 'https://x.test/?ref=abc&source=news');
    assert.equal(cleanUrl('https://x.test/?utm_source=x', { ...defaults, cleanTracking: false }), 'https://x.test/?utm_source=x');
});
test('custom parameters and malformed escaping', () => {
    assert.equal(cleanUrl('https://x.test/?track_id=1&id=2&%ZZ=3', { ...defaults, extraTracking: 'track_*' }), 'https://x.test/?id=2&%ZZ=3');
});
test('links preserve labels and escape destinations', () => {
    assert.equal(html('<a href="https://x.test/a(b)?id=1&amp;utm_source=x#f">Read</a>'), '[Read](https://x.test/a%28b%29?id=1#f)');
    assert.equal(html('<a href="https://x.test/">Read</a>', { removeTextStyling: true }), '[Read](https://x.test/)');
    assert.equal(html('<a href="javascript:alert(1)">Read</a>'), 'Read');
});
test('untrusted HTML is never executed or retained', () => {
    assert.equal(html('<p onclick="alert(1)">Safe</p><script>alert(1)</script><style>body{}</style><iframe src="https://x.test"></iframe>'), 'Safe');
    assert.equal(html('<img src="https://x.test/pixel" alt="Picture">'), 'Picture');
    assert.equal(html('<img src="https://x.test/a?utm_source=x" alt="Picture">'), 'Picture');
});
test('plain text stays literal and URL punctuation is preserved', () => {
    assert.equal(convert({ text: '<b>literal</b> **existing**' }), '<b>literal</b> **existing**');
    assert.equal(convert({ text: 'See https://x.test/?id=1&utm_source=x.' }), 'See https://x.test/?id=1.');
    assert.equal(convert({ text: '' }), '');
});

test('removing text styling preserves inline code, code blocks and links', () => {
    assert.equal(html('<b>Bold</b> <i>Italic</i> <s>Strike</s> <code>a &lt; b</code>', { removeTextStyling: true }), 'Bold Italic Strike `a < b`');
    assert.match(html('<pre><code>example</code></pre>', { removeTextStyling: true }), /```\nexample\n```/);
});
test('paste handles highlighting in HTML and plain Markdown with styling cleanup enabled', () => {
    assert.equal(html('<mark>Highlight</mark>'), '==Highlight==');
    assert.equal(html('<mark><b>Highlight</b></mark>', { removeTextStyling: true }), 'Highlight');
    assert.equal(convert({ text: '==Highlight== **Bold** `==Code==`' }, { ...defaults, removeTextStyling: true }), 'Highlight Bold `==Code==`');
    assert.equal(convert({ text: '==Keep==' }), '==Keep==');
});

test('block quote adds exactly one level including existing quotes and blank lines', () => {
    assert.equal(html('<p>Hello</p><blockquote>Quoted</blockquote>', { addBlockQuote: true }), '> Hello\n>\n> > Quoted');
    assert.equal(convert({ text: '> Existing\n\nText' }, { ...defaults, addBlockQuote: true }), '> > Existing\n>\n> Text');
    assert.equal(convert({ text: '' }, { ...defaults, addBlockQuote: true }), '');
    assert.equal(convert({ text: 'First\n  \n\t\nLast' }, { ...defaults, addBlockQuote: true }), '> First\n>\n>\n> Last');
    assert.equal(defaults.addBlockQuote, false);
});
