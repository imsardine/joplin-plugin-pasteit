import { fromMarkdown, Extension } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { cleanUrl, Options } from './conversionOptions';

interface Edit { from: number; to: number; insert: string }

// Edit source ranges instead of serializing Markdown again: table layout, list
// indentation, escapes, code, and unrelated URL parameters remain as written.
export function cleanMarkdown(markdown: string, options: Options): string {
    if (!options.removeTextStyling && !options.cleanTracking) return markdown;
    const edits: Edit[] = [];
    const textRanges: { from: number; to: number }[] = [];
    const inlineRanges: { from: number; to: number }[] = [];
    const replace = (from: number, to: number, insert: string) => {
        if (markdown.slice(from, to) !== insert) edits.push({ from, to, insert });
    };
    const cleanDestination = (from: number, to: number) => {
        if (!options.cleanTracking) return;
        const raw = markdown.slice(from, to);
        // Markdown permits HTML-escaped ampersands in link destinations.
        const decoded = raw.replace(/&amp;/gi, '&');
        const cleaned = cleanUrl(decoded, options);
        if (cleaned !== decoded) replace(from, to, /&amp;/i.test(raw) ? cleaned.replace(/&/g, '&amp;') : cleaned);
    };
    const destinations: Extension = { enter: {
        resourceDestinationString(token) {
            cleanDestination(token.start.offset, token.end.offset);
            this.buffer();
        },
        definitionDestinationString(token) {
            cleanDestination(token.start.offset, token.end.offset);
            this.buffer();
        },
    } };
    // Protect HTML code as well as Markdown code, including code inside HTML lists.
    const source = markdown.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, match => match.replace(/[^\r\n]/g, ' '));
    const tree = fromMarkdown(source, { extensions: [gfm({ singleTilde: false })], mdastExtensions: [gfmFromMarkdown(), destinations] });
    const visit = (node: any, parent?: any) => {
        if (node.type === 'code' || node.type === 'inlineCode') return;
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (['paragraph', 'heading', 'tableCell'].includes(node.type)) inlineRanges.push({ from, to });
        if (node.type === 'text' && !(parent?.type === 'link' && /^<?https?:\/\//i.test(source.slice(parent.position.start.offset)))) {
            textRanges.push({ from, to });
        }
        if (options.removeTextStyling && ['strong', 'emphasis', 'delete'].includes(node.type)) {
            const width = node.type === 'emphasis' ? 1 : 2;
            replace(from, from + width, '');
            replace(to - width, to, '');
        }
        if (node.type === 'text' && options.cleanTracking) {
            const raw = source.slice(from, to);
            for (const match of raw.matchAll(/https?:\/\/[^\s<>]+/gi)) {
                const url = match[0];
                const tail = url.match(/[.,;!?]+$/)?.[0] || '';
                cleanDestination(from + match.index, from + match.index + url.length - tail.length);
            }
        }
        if (node.type === 'html') {
            const raw = source.slice(from, to);
            if (/^<!--/.test(raw)) return;
            if (options.removeTextStyling) {
                for (const match of raw.matchAll(/<\/?(?:strong|b|em|i|del|s|strike|u|mark|sub|sup)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
                    replace(from + match.index, from + match.index + match[0].length, '');
                }
            }
            if (options.cleanTracking) {
                for (const tag of raw.matchAll(/<(?:a|img)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
                    const attr = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
                    if (!attr) continue;
                    const url = attr[1] ?? attr[2] ?? attr[3];
                    const offset = from + tag.index + attr.index + attr[0].indexOf(url, attr[0].indexOf('=') + 1);
                    cleanDestination(offset, offset + url.length);
                }
            }
        }
        for (const child of node.children || []) visit(child, node);
    };
    visit(tree);
    if (options.removeTextStyling) {
        // Joplin's ==mark== extension is not part of GFM. Only recognize paired
        // delimiters in parsed prose, never URLs, code, attributes or escaped text.
        const isDelimiter = (offset: number) => {
            let backslashes = 0;
            for (let i = offset - 1; i >= 0 && source[i] === '\\'; i--) backslashes++;
            return backslashes % 2 === 0 && source[offset - 1] !== '=' && source[offset + 2] !== '='
                && textRanges.some(range => offset >= range.from && offset + 2 <= range.to);
        };
        for (const range of inlineRanges) {
            for (const match of source.slice(range.from, range.to).matchAll(/==(?=\S)([^\r\n]*?\S)==/g)) {
                const start = range.from + match.index, end = start + match[0].length - 2;
                if (isDelimiter(start) && isDelimiter(end)) {
                    replace(start, start + 2, '');
                    replace(end, end + 2, '');
                }
            }
        }
    }
    let result = markdown;
    let boundary = markdown.length;
    for (const edit of edits.sort((a, b) => b.from - a.from || b.to - a.to)) {
        // A URL can occur in both a link token and its text child.
        if (edit.to > boundary) continue;
        result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
        boundary = edit.from;
    }
    return result;
}
