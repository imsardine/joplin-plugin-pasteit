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
