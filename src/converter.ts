import TurndownService from 'turndown';
// Domino ships an ambient declaration under a different package name.
const { createDocument } = require('@mixmark-io/domino') as { createDocument(html: string): Document };

export const defaults = {
    bold: true, italic: true, strike: true, headings: true,
    lists: true, quotes: true, code: true, links: true, images: false,
    cleanTracking: true, extraTracking: '',
};
export type Options = typeof defaults;
export const labels: Record<keyof Options, string> = {
    bold: '保留粗體', italic: '保留斜體', strike: '保留刪除線', headings: '保留標題',
    lists: '保留清單', quotes: '保留引用', code: '保留程式碼', links: '保留連結',
    images: '保留圖片網址（可能載入遠端圖片）', cleanTracking: '移除廣告及追蹤參數',
    extraTracking: '額外移除的參數名稱（逗號分隔，結尾 * 表示前綴）',
};
const tracking = ['utm_*', 'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid', 'twclid', 'igshid', 'mc_cid', 'mc_eid', '_ga', '_gl', 'mkt_tok', 'vero_id', 'oly_anon_id', 'oly_enc_id'];

// Filter raw query components to preserve encoding, ordering, fragments and duplicate keys.
export function cleanUrl(url: string, options: Options): string {
    if (!options.cleanTracking || !/^https?:\/\//i.test(url)) return url;
    const hash = url.indexOf('#');
    const end = hash < 0 ? url.length : hash;
    const query = url.indexOf('?');
    if (query < 0 || query > end) return url;
    const patterns = tracking.concat(options.extraTracking.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    const kept = url.slice(query + 1, end).split('&').filter(part => {
        let key: string;
        try { key = decodeURIComponent(part.split('=')[0].replace(/\+/g, ' ')).toLowerCase(); }
        catch { return true; }
        return !patterns.some(p => p.endsWith('*') ? key.startsWith(p.slice(0, -1)) : key === p);
    });
    return url.slice(0, query) + (kept.length ? '?' + kept.join('&') : '') + url.slice(end);
}
const safeUrl = (url: string) => /^(https?:\/\/|mailto:|tel:|#|:\/)/i.test(url.trim());
const destination = (url: string) => url.replace(/[<>\s\\]/g, c => encodeURIComponent(c));

export function convert(input: { html?: string; text?: string }, options: Options = defaults): string {
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
    const groups: [keyof Options, string[]][] = [
        ['bold', ['strong', 'b']], ['italic', ['em', 'i']], ['strike', ['del', 's', 'strike']],
        ['headings', ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']], ['lists', ['ul', 'ol', 'li']],
        ['quotes', ['blockquote']], ['code', ['pre', 'code']],
    ];
    service.addRule('strike', { filter: node => /^(DEL|S|STRIKE)$/.test(node.nodeName), replacement: content => `~~${content}~~` });
    for (const [key, tags] of groups) {
        if (!options[key]) service.addRule(`without-${key}`, {
            filter: tags as any,
            replacement: (content, node) => (node as any).isBlock ? `\n\n${content}\n\n` : content,
        });
    }
    service.addRule('links', {
        filter: 'a', replacement: (content, node) => {
            const href = (node as HTMLElement).getAttribute('href') || '';
            if (!options.links || !safeUrl(href)) return content;
            const url = cleanUrl(href.trim(), options);
            return `[${content || service.escape(url)}](<${destination(url)}>)`;
        },
    });
    service.addRule('images', {
        filter: 'img', replacement: (_content, node) => {
            const element = node as HTMLElement;
            const alt = service.escape(element.getAttribute('alt') || '');
            const src = element.getAttribute('src') || '';
            return options.images && safeUrl(src) ? `![${alt}](<${destination(cleanUrl(src, options))}>)` : alt;
        },
    });
    return service.turndown(body as any);
}
