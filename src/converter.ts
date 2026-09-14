import TurndownService from 'turndown';
import { quoteLine } from './quote';
// Domino ships an ambient declaration under a different package name.
const { createDocument } = require('@mixmark-io/domino') as { createDocument(html: string): Document };

export const defaults = {
    removeTextStyling: false, addBlockQuote: false, tableHtmlLists: true, cleanTracking: true, extraTracking: '',
};
export type Options = typeof defaults;
export const labels: Record<keyof Options, string> = {
    removeTextStyling: 'Remove text styling (except inline code)',
    addBlockQuote: 'Add a block quote level',
    tableHtmlLists: 'Use HTML lists in tables (otherwise use line breaks)',
    cleanTracking: 'Remove advertising and tracking parameters',
    extraTracking: 'Additional parameters to remove (comma-separated; trailing * matches a prefix)',
};
export const trackingParameters = ['utm_*', 'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid', 'twclid', 'igshid', 'mc_cid', 'mc_eid', '_ga', '_gl', 'mkt_tok', 'vero_id', 'oly_anon_id', 'oly_enc_id'];

export const trackingDescription = `Removes these built-in parameters: ${trackingParameters.join(', ')}. The * matches any suffix; matching ignores case. Additional parameters are removed when listed below.`;

// Filter raw query components to preserve encoding, ordering, fragments and duplicate keys.
export function cleanUrl(url: string, options: Options): string {
    if (!options.cleanTracking || !/^https?:\/\//i.test(url)) return url;
    const hash = url.indexOf('#');
    const end = hash < 0 ? url.length : hash;
    const query = url.indexOf('?');
    if (query < 0 || query > end) return url;
    const patterns = trackingParameters.concat(options.extraTracking.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    const kept = url.slice(query + 1, end).split('&').filter(part => {
        let key: string;
        try { key = decodeURIComponent(part.split('=')[0].replace(/\+/g, ' ')).toLowerCase(); }
        catch { return true; }
        return !patterns.some(p => p.endsWith('*') ? key.startsWith(p.slice(0, -1)) : key === p);
    });
    return url.slice(0, query) + (kept.length ? '?' + kept.join('&') : '') + url.slice(end);
}
const safeUrl = (url: string) => /^(https?:\/\/|mailto:|tel:|#|:\/)/i.test(url.trim());
const destination = (url: string) => url.replace(/[()<>\s\\]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));

function convertTable(table: HTMLElement, service: TurndownService): string {
    // Exclude rows belonging to nested tables; their content stays in the parent cell.
    const rows = Array.from(table.querySelectorAll('tr')).filter(row => {
        let parent = row.parentElement;
        while (parent && parent.tagName !== 'TABLE') parent = parent.parentElement;
        return parent === table;
    });
    const grid: string[][] = rows.map(() => []);
    const alignments: string[] = [];
    const inline = (element: Element) => service.turndown(element as any)
        .replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, '<br>').trim();
    rows.forEach((row, rowIndex) => {
        let column = 0;
        for (const cell of Array.from(row.children).filter(cell => /^(TH|TD)$/.test(cell.tagName))) {
            while (grid[rowIndex][column] !== undefined) column++;
            const colspan = Math.min(1000, Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1));
            const rawRowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
            const groupRows = rows.slice(rowIndex).filter(candidate => candidate.parentElement === row.parentElement).length;
            const rowspan = rawRowspan === 0 ? groupRows : Math.min(groupRows, Math.max(1, rawRowspan || 1));
            for (let r = 0; r < rowspan; r++) {
                for (let c = 0; c < colspan; c++) grid[rowIndex + r][column + c] = '';
            }
            grid[rowIndex][column] = inline(cell);
            const alignment = /text-align\s*:\s*(left|center|right)\b/i.exec(cell.getAttribute('style') || '')?.[1]
                || cell.getAttribute('align') || '';
            if (!alignments[column]) alignments[column] = ({ left: ':---', center: ':---:', right: '---:' })[alignment.toLowerCase()] || '';
            column += colspan;
        }
    });
    const width = Math.max(0, ...grid.map(row => row.length));
    const caption = Array.from(table.children).find(child => child.tagName === 'CAPTION');
    const title = caption ? service.turndown(caption.innerHTML) : '';
    if (!width) return title;
    const line = (cells: string[]) => '| ' + Array.from({ length: width }, (_, i) => cells[i] || '').join(' | ') + ' |';
    const hasHeader = rows[0].parentElement.tagName === 'THEAD'
        || Array.from(rows[0].children).some(cell => cell.tagName === 'TH');
    const header = hasHeader ? grid.shift() : [];
    return '\n\n' + (title ? title + '\n\n' : '') + [line(header),
        line(Array.from({ length: width }, (_, i) => alignments[i] || '---')), ...grid.map(line)].join('\n') + '\n\n';
}

function convertContent(input: { html?: string; text?: string }, options: Options = defaults): string {
    if (!input.html) {
        // Plain text is not treated as HTML or rewritten as Markdown. Only standalone URLs are cleaned.
        return (input.text || '').replace(/https?:\/\/[^\s<>]+/gi, url => {
            const tail = url.match(/[.,;!?)\]]+$/)?.[0] || '';
            return cleanUrl(url.slice(0, url.length - tail.length), options) + tail;
        });
    }
    const doc = createDocument(input.html);
    const body = doc.body;
    for (const node of Array.from(body.querySelectorAll('script,style,iframe,object,embed,form,input,button,svg,template,noscript'))) node.parentNode.removeChild(node);
    // Common clipboard producers use inline CSS instead of semantic tags.
    for (const node of Array.from(body.querySelectorAll('[style]'))) {
        const style = node.getAttribute('style') || '';
        const tags: string[] = [];
        if (/font-weight\s*:\s*(bold|[6-9]00)\b/i.test(style) && !/^(B|STRONG)$/.test(node.tagName)) tags.push('strong');
        if (/font-style\s*:\s*italic\b/i.test(style) && !/^(I|EM)$/.test(node.tagName)) tags.push('em');
        if (/text-decoration(?:-line)?\s*:[^;]*line-through/i.test(style) && !/^(S|DEL|STRIKE)$/.test(node.tagName)) tags.push('del');
        for (const tag of tags) {
            const wrapper = doc.createElement(tag);
            while (node.firstChild) wrapper.appendChild(node.firstChild);
            node.appendChild(wrapper);
        }
    }
    const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
    service.addRule('strike', { filter: node => /^(DEL|S|STRIKE)$/.test(node.nodeName), replacement: content => `~~${content}~~` });
    if (options.removeTextStyling) service.addRule('remove-text-styling', {
        filter: node => /^(STRONG|B|EM|I|DEL|S|STRIKE|U|MARK|SUB|SUP)$/.test(node.nodeName),
        replacement: content => content,
    });
    service.addRule('links', {
        filter: 'a', replacement: (content, node) => {
            const href = (node as HTMLElement).getAttribute('href') || '';
            if (!safeUrl(href)) return content;
            const url = cleanUrl(href.trim(), options);
            return `[${content || service.escape(url)}](${destination(url)})`;
        },
    });
    service.addRule('images', {
        filter: 'img', replacement: (_content, node) => {
            const element = node as HTMLElement;
            const alt = service.escape(element.getAttribute('alt') || '');
            return alt;
        },
    });
    service.addRule('tables', {
        filter: 'table', replacement: (_content, node) => convertTable(node as HTMLElement, service),
    });
    service.addRule('table-lists', {
        filter: node => {
            if (!options.tableHtmlLists && node.nodeName !== 'LI') return false;
            if (!/^(UL|OL|LI)$/.test(node.nodeName)) return false;
            for (let parent = node.parentNode; parent; parent = parent.parentNode) {
                if (/^(TD|TH)$/.test(parent.nodeName)) return true;
            }
            return false;
        },
        replacement: (content, node) => {
            if (!options.tableHtmlLists) {
                const parent = node.parentNode as HTMLElement;
                const start = Number(parent.getAttribute('start') || 1);
                const marker = parent.nodeName === 'OL'
                    ? `${start + Array.from(parent.children).indexOf(node as Element)}.` : '-';
                // Table cells flatten nesting to BRs, so no Markdown indentation is needed.
                return `${marker} ${content.trim()}\n`;
            }
            // Keep list structure as HTML, while children use the usual Markdown rules.
            const tag = node.nodeName.toLowerCase();
            const start = (node as HTMLElement).getAttribute('start');
            const attribute = tag === 'ol' && start && /^-?\d+$/.test(start) ? ` start="${start}"` : '';
            return `<${tag}${attribute}>${content.trim()}</${tag}>`;
        },
    });
    return service.turndown(body as any);
}

export function convert(input: { html?: string; text?: string }, options: Options = defaults): string {
    const markdown = convertContent(input, options);
    return options.addBlockQuote && markdown.trim()
        ? markdown.split(/\r?\n/).map(quoteLine).join('\n')
        : markdown;
}
