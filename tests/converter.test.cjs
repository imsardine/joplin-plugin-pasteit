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

const layoutGrid = (width, count = 3) => '<div>' + Array.from({ length: count }, (_, r) =>
    `<div style="display:grid;grid-template-columns:repeat(${width}, 1fr);border-bottom:1px solid gray">` +
    Array.from({ length: width }, (_, c) => `<div>${r}:${c}</div>`).join('') + '</div>').join('') + '</div>';
test('grid tables infer two, four and five columns and retain ambiguous first rows', () => {
    for (const width of [2, 4, 5]) {
        const output = html(layoutGrid(width));
        assert.equal(output.split('\n').length, 5);
        assert.equal(output.split('\n')[0], '| ' + Array(width).fill('').join(' | ') + ' |');
        assert.match(output, /0:0/);
        assert.match(output, new RegExp(`2:${width - 1}`));
    }
});
test('ARIA tables support rowgroups, headers, formatting and conversion options', () => {
    const source = '<div role="table"><div role="rowgroup"><div role="row"><div role="columnheader">Name</div><div role="columnheader">Value</div></div></div><div role="rowgroup"><div role="row"><div role="rowheader"><b>A|B</b></div><div role="cell"><a href="https://x.test/?utm_source=a">Link</a><br><svg aria-label="Available"></svg></div></div></div></div>';
    assert.equal(html(source), '| Name | Value |\n| --- | --- |\n| **A\\|B** | [Link](https://x.test/)<br>Available |');
    assert.match(html(source, { removeTextStyling: true, addBlockQuote: true }), /^> \| Name/);
    assert.doesNotMatch(html(source, { removeTextStyling: true }), /\*\*/);
});
test('ordinary cards, partial rows, reordered grids and missing layout hints stay non-tabular', () => {
    const sources = [
        '<div class="grid grid-cols-2"><div><h3>One</h3><p>Text</p></div><div><h3>Two</h3><p>Text</p></div></div>',
        layoutGrid(3).replace('<div>1:2</div>', ''),
        layoutGrid(3).replace('<div>1:2</div>', '<div style="order:1">1:2</div>'),
        layoutGrid(3).replace(/style="[^"]*"/g, ''),
        layoutGrid(3).replace(/border-bottom:1px solid gray/g, ''),
        layoutGrid(3).replace('0:0', '<h3>Card</h3>'),
        layoutGrid(3).replace('0:0', '<img alt="Card">'),
        layoutGrid(3).replace('0:0', '0:0').replace('<div>1:2</div>', '<div class="md:col-span-2">1:2</div>'),
    ];
    for (const source of sources) assert.doesNotMatch(html(source), /\| ---/);
});
test('unnamed SVG geometry is not guessed and recognized icons retain text', () => {
    const source = layoutGrid(2).replace('1:0', '<svg><path d="M0 0"></path></svg>').replace('1:1', '<svg class="lucide-check"></svg>');
    assert.match(html(source), /\|  \| ✓ \|/);
});
test('grids that wrap cells or change column count at a breakpoint are not tables', () => {
    assert.doesNotMatch(html(layoutGrid(3).replace(/repeat\(3, 1fr\)/g, 'repeat(2, 1fr)')), /\| ---/);
    const source = layoutGrid(3).replace(/style="[^"]*"/g, 'class="grid grid-cols-3 md:grid-cols-2 border-b"');
    assert.doesNotMatch(html(source), /\| ---/);
    assert.doesNotMatch(html(layoutGrid(3).replace(/repeat\(3, 1fr\)/g, 'repeat(auto-fit, minmax(100px, 1fr))')), /\| ---/);
});

test('repeated grid rows infer headers and retain accessible icon text', () => {
    const source = '<div>' + [
        '<div class="grid grid-cols-3 border-b"><div class="header">Item</div><div class="header text-center">Small</div><div class="header text-center">Large</div></div>',
        '<div class="grid grid-cols-3 border-b"><div>Storage</div><div>10 GB</div><div>50 GB</div></div>',
        '<div class="grid grid-cols-3"><div>Backup</div><div><svg aria-label="Included"></svg></div><div><svg aria-label="Included"></svg></div></div>',
    ].join('') + '</div>';
    assert.equal(html(source), '| Item | Small | Large |\n| --- | :---: | :---: |\n| Storage | 10 GB | 50 GB |\n| Backup | Included | Included |');
});
const groupedGrid = () => fs.readFileSync(require('node:path').join(__dirname, 'fixtures/grouped-grid.html'), 'utf8');
const groupedExpected = '### Storage\n\n|  | Small | Large |\n| --- | --- | --- |\n| Capacity | **10 GB** | 50 GB |\n| Backup | No | Yes |\n\n### Extras\n\n|  | Small | Large |\n| --- | --- | --- |\n| Support | No | Priority |';
test('grouped grids recover shared DOM headers and leave only cell values', () => {
    assert.equal(html(groupedGrid()), groupedExpected);
    assert.doesNotMatch(html(groupedGrid(), { removeTextStyling: true }), /\*\*/);
});
test('changing label keys and all coordinate text preserves the same output structure', () => {
    const replace = text => text.replace(/Small/g, 'Entry').replace(/Large/g, 'Full').replace(/Backup/g, 'Archive');
    const source = replace(groupedGrid()).replace(/Tier:/g, 'Anything:').replace(/Item:/g, 'Another:');
    assert.equal(html(source), replace(groupedExpected));
});
test('missing or mismatched DOM headers do not fabricate column names or strip descriptions', () => {
    const source = groupedGrid().replace('<div>Small</div><div>Large</div>', '<div>Other</div><div>Unknown</div>');
    assert.match(html(source), /Tier: Small, Item: Backup, No/);
    assert.doesNotMatch(html(source), /\|  \| Other \| Unknown \|/);
});
test('a section with a single separated heading row retains its data', () => {
    const source = '<h3>Extras</h3><div><div class="grid grid-cols-2 border-b"><div><h6>Backup</h6></div><div>Included</div></div></div>';
    assert.equal(html(source), '### Extras\n\n|  |  |\n| --- | --- |\n| Backup | Included |');
});
test('coordinate removal preserves punctuation in values and literal header characters', () => {
    const source = groupedGrid().replace(/Small/g, 'A (basic)').replace(/Backup/g, 'Copy [daily]')
        .replace(/, No</g, ', Limited, with review<');
    const expected = groupedExpected.replace(/Small/g, 'A (basic)').replace(/Backup/g, 'Copy \\[daily\\]')
        .replace(/\| No \|/g, '| Limited, with review |');
    assert.equal(html(source), expected);
});
test('incomplete copies retain descriptions and never invent missing headers', () => {
    const source = groupedGrid().replace('<div class="grid grid-cols-3"><div></div><div>Small</div><div>Large</div></div>', '');
    const output = html(source);
    assert.match(output, /\|  \|  \|  \|/);
    assert.match(output, /Tier: Small, Item: Backup, No/);
});
test('header navigation and visible cell formatting survive normalization', () => {
    const source = groupedGrid().replace('<div>Small</div>', '<div>Small<a href="https://example.test/">Choose</a></div>')
        .replace('<b>10 GB</b>', '<a href="https://example.test/storage"><b>10 GB</b></a>');
    const output = html(source);
    assert.match(output, /\|  \| Small \| Large \|/);
    assert.match(output, /\[Choose\]\(https:\/\/example.test\/\)/);
    assert.match(output, /\[\*\*10 GB\*\*\]\(https:\/\/example.test\/storage\)/);
    assert.doesNotMatch(output, /Tier:|Item:/);
});
const clippedGrid = () => fs.readFileSync(require('node:path').join(__dirname, 'fixtures/clipped-grid.html'), 'utf8');
test('clipboard selection may omit the empty corner and last icon description', () => {
    const output = html(clippedGrid());
    assert.match(output, /\|  \| Basic \| Extra \|\n\| --- \| --- \| --- \|\n\| Storage \| 10 GB \| 20 GB \|\n\| Backup, daily \| Included \| Included \|/);
    assert.doesNotMatch(output, /Column:|Row:/);
});
test('icon recovery requires the same symbol and unambiguous evidence', () => {
    const changed = clippedGrid().replace('<div><svg><use href="/icons.svg#tick"></use></svg></div>', '<div><svg><use href="/icons.svg#other"></use></svg></div>');
    assert.match(html(changed), /\| Backup, daily \| Included \|  \|/);
    const conflicting = clippedGrid().replace('<div>10 GB<span', '<div><svg><use href="/icons.svg#tick"></use></svg><span')
        .replace('Row: Storage, 10 GB', 'Row: Storage, Excluded');
    assert.match(html(conflicting), /\| Backup, daily \| Included \|  \|/);
});
test('named rows with no missing grid track are not treated as clipped headers', () => {
    const source = clippedGrid().replace('grid-template-columns:1fr repeat(2,1fr)', 'grid-template-columns:repeat(2,1fr)');
    assert.doesNotMatch(html(source), /\|  \| Basic \| Extra \|/);
    assert.match(html(source), /Column: Basic, Row: Backup, daily, Included/);
});
test('link labels discard wrapper whitespace and flatten block boundaries', () => {
    assert.equal(html('<a href="https://example.test/plus"><div><p> Get Plus </p></div></a>'), '[Get Plus](https://example.test/plus)');
    assert.equal(html('<a href="https://example.test/plus"><div>Get</div><div><strong>Plus</strong></div></a>'), '[Get **Plus**](https://example.test/plus)');
    assert.equal(html('<a href="https://example.test/"><div><code>a b</code></div></a>'), '[`a b`](https://example.test/)');
    assert.equal(html('<a href="https://example.test/"><div> </div></a>'), '[https://example.test/](https://example.test/)');
});
test('link whitespace cleanup applies in paragraphs and table cells alike', () => {
    const link = '<a href="https://example.test/plus"><div><p>Get Plus</p></div></a>';
    assert.equal(html('<p>Before</p>' + link + '<p>After</p>'), 'Before\n\n[Get Plus](https://example.test/plus)\n\nAfter');
    assert.equal(html('<table><tr><th>Action</th></tr><tr><td>' + link + '</td></tr></table>'), '| Action |\n| --- |\n| [Get Plus](https://example.test/plus) |');
});
