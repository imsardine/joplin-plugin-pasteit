const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { convert, defaults, cleanUrl } = require('../src/converter.ts');
const html = (value, options = {}) => convert({ html: value }, { ...defaults, ...options });
test('nested semantic formatting and independent toggles', () => {
    assert.equal(html('<p><strong>粗體 <em>斜體</em></strong></p>'), '**粗體 *斜體***');
    assert.equal(html('<b>粗體</b> <i>斜體</i> <del>刪除</del>', { bold: false, strike: false }), '粗體 *斜體* 刪除');
});
test('inline CSS from rich clipboard sources', () => {
    assert.equal(html('<span style="font-weight:700;font-style:italic">Hello</span>'), '***Hello***');
});
test('headings lists quotes and code', () => {
    const value = html('<h2>Title</h2><ul><li>One</li><li>Two</li></ul><blockquote>Quote</blockquote><pre><code>a &lt; b</code></pre>');
    assert.match(value, /^## Title/); assert.match(value, /-\s+One/); assert.match(value, /> Quote/); assert.match(value, /```\na < b\n```/);
    assert.equal(html('<h1>Title</h1><blockquote>Quote</blockquote>', { headings: false, quotes: false }), 'Title\n\nQuote');
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
    assert.equal(html('<a href="https://x.test/a(b)?id=1&amp;utm_source=x#f">Read</a>'), '[Read](<https://x.test/a(b)?id=1#f>)');
    assert.equal(html('<a href="https://x.test/">Read</a>', { links: false }), 'Read');
    assert.equal(html('<a href="javascript:alert(1)">Read</a>'), 'Read');
});
test('untrusted HTML is never executed or retained', () => {
    assert.equal(html('<p onclick="alert(1)">Safe</p><script>alert(1)</script><style>body{}</style><iframe src="https://x.test"></iframe>'), 'Safe');
    assert.equal(html('<img src="https://x.test/pixel" alt="Picture">'), 'Picture');
    assert.equal(html('<img src="https://x.test/a?utm_source=x" alt="Picture">', { images: true }), '![Picture](<https://x.test/a>)');
});
test('plain text stays literal and URL punctuation is preserved', () => {
    assert.equal(convert({ text: '<b>literal</b> **existing**' }), '<b>literal</b> **existing**');
    assert.equal(convert({ text: 'See https://x.test/?id=1&utm_source=x.' }), 'See https://x.test/?id=1.');
    assert.equal(convert({ text: '' }), '');
});
