import TurndownService from 'turndown';
// Domino ships an ambient declaration under a different package name.
const { createDocument } = require('@mixmark-io/domino') as { createDocument(html: string): Document };

export const defaults = {
    removeTextStyling: false, addBlockQuote: false, cleanTracking: true, extraTracking: '',
};
export type Options = typeof defaults;
export const labels: Record<keyof Options, string> = {
    removeTextStyling: 'Remove text styling (except inline code)',
    addBlockQuote: 'Add a block quote level',
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
    return service.turndown(body as any);
}

export function convert(input: { html?: string; text?: string }, options: Options = defaults): string {
    const markdown = convertContent(input, options);
    return options.addBlockQuote && markdown.trim()
        ? markdown.split(/\r?\n/).map(line => line.trim() ? `> ${line}` : '>').join('\n')
        : markdown;
}
