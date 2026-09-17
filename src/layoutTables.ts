// Clipboard HTML has no computed styles. Recognize only explicit row structures;
// never infer a table from a single grid container or fetch the source stylesheet.
const role = (node: Element) => node.getAttribute('role') || '';
const classes = (node: Element) => (node.getAttribute('class') || '').split(/\s+/);
const styleValue = (node: Element, name: string) => {
    const declarations = (node.getAttribute('style') || '').split(';');
    return declarations.map(value => value.split(':')).filter(parts => parts[0].trim().toLowerCase() === name)
        .map(parts => parts.slice(1).join(':').trim().toLowerCase()).pop() || '';
};
const hasLooseText = (node: Element) => Array.from(node.childNodes).some(child => child.nodeType === 3 && child.textContent.trim());
const decoration = (node: Element) => node.getAttribute('aria-hidden') === 'true'
    && !node.textContent.trim() && !node.querySelector('svg,img,video');
const rowCells = (node: Element) => Array.from(node.children).filter(child => !decoration(child));
function gridDefinition(node: Element): string {
    const tokens = classes(node);
    if (styleValue(node, 'display') === 'grid' && styleValue(node, 'grid-template-columns')) {
        return styleValue(node, 'grid-template-columns').replace(/\s+/g, ' ');
    }
    if (!tokens.includes('grid')) return '';
    return tokens.filter(token => /^(?:[\w-]+:)*grid-cols-(?:\d+|\[.+\])$/.test(token)).sort().join(' ');
}
function separated(node: Element): boolean {
    return classes(node).some(token => /^border-b(?:-\d+)?$/.test(token))
        || Array.from(node.children).some(child => decoration(child) && classes(child).includes('h-px'))
        || /^(?!0(?:px)?\b|none\b).+/.test(styleValue(node, 'border-bottom'));
}
function trackCount(template: string): number {
    // Only count explicit tracks. Auto-fit, named lines and stylesheet variables
    // need layout information that a clipboard fragment cannot supply.
    if (/\[|\]|var\(|auto-fit|auto-fill|subgrid|none/.test(template)) return 0;
    let depth = 0;
    let token = '';
    const tracks: string[] = [];
    for (const char of template.trim()) {
        if (/\s/.test(char) && depth === 0) {
            if (token) tracks.push(token);
            token = '';
        } else {
            token += char;
            if (char === '(') depth++;
            if (char === ')') depth--;
        }
    }
    if (token) tracks.push(token);
    if (depth !== 0) return 0;
    return tracks.reduce((total, track) => {
        const repeat = /^repeat\(\s*(\d+)\s*,\s*(.*)\)$/.exec(track);
        return total + (repeat ? Number(repeat[1]) * trackCount(repeat[2]) : 1);
    }, 0);
}
function matchesWidth(row: Element, width: number): boolean {
    const resolve = (value: string) => {
        for (let i = 0; i < 8 && value.includes('var('); i++) {
            const previous = value;
            value = value.replace(/var\((--[\w-]+)\)/g, (match, name) => {
                for (let node: Element = row; node; node = node.parentElement) {
                    const declaration = styleValue(node, name);
                    if (declaration) return declaration;
                }
                return match;
            });
            if (value === previous) break;
        }
        return value;
    };
    const inline = styleValue(row, 'grid-template-columns');
    if (styleValue(row, 'display') === 'grid' && inline) return trackCount(resolve(inline)) === width;
    const definitions = classes(row).filter(token => /(?:^|:)grid-cols-/.test(token));
    const counts = definitions.map(token => {
        const value = token.slice(token.indexOf('grid-cols-') + 10);
        return /^\d+$/.test(value) ? Number(value)
            : value.startsWith('[') && value.endsWith(']') ? trackCount(resolve(value.slice(1, -1).replace(/_/g, ' '))) : 0;
    });
    // Responsive auto-fit layouts can use a resolvable explicit desktop layout.
    return counts.includes(width) && counts.every(count => count === 0 || count === width);
}
function unsafeLayout(node: Element): boolean {
    return [node, ...Array.from(node.querySelectorAll('*'))].some(element => {
        if (decoration(element)) return false;
        const tokens = classes(element);
        return ['grid-column', 'grid-row', 'grid-area', 'order', 'grid-auto-flow'].some(name => styleValue(element, name))
            || tokens.some(token => /(?:^|:)(?:col-span-|row-span-|col-start-|row-start-|order-|grid-flow-)/.test(token))
            || ['aria-colspan', 'aria-rowspan', 'aria-colindex', 'aria-rowindex'].some(name => element.hasAttribute(name));
    });
}
function iconText(svg: Element): string {
    const label = svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent;
    if (label?.trim()) return label.trim();
    // Named icons carry meaning; arbitrary path geometry does not.
    if (classes(svg).includes('lucide-check')) return '✓';
    if (classes(svg).includes('lucide-x')) return '✗';
    return '';
}
const normalizedText = (value: string) => value.replace(/\s+/g, ' ').trim();
function descriptionValue(description: string, column: string, row: string): string | null {
    if (!column || !row) return null;
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Coordinates come from DOM headers, never from label vocabulary. Only
    // remove a complete pair of delimited coordinates, not arbitrary prose.
    const field = (value: string) => `(?:[^:：,，;；]+[:：]\\s*)?${escape(normalizedText(value))}`;
    for (const pair of [[column, row], [row, column]]) {
        const match = new RegExp(`^${field(pair[0])}\\s*[,，;；]\\s*${field(pair[1])}\\s*[,，;；]\\s*(.+)$`)
            .exec(normalizedText(description));
        if (match) return match[1];
    }
    return null;
}
type SharedHeader = { element: Element; names: string[] };
function symbolReference(cell: Element): string | null {
    const svgs = Array.from(cell.querySelectorAll('svg'));
    if (svgs.length !== 1) return null;
    const children = Array.from(svgs[0].children);
    if (children.length !== 1 || children[0].tagName.toLowerCase() !== 'use') return null;
    const reference = children[0].getAttribute('href') || children[0].getAttribute('xlink:href');
    return reference && reference.includes('#') ? reference : null;
}
function findSharedHeader(container: Element, cells: Element[][], headers: SharedHeader[]): SharedHeader | undefined {
    for (let scope = container.parentElement; scope; scope = scope.parentElement) {
        const candidates = headers.filter(header => scope.contains(header.element)
            && !container.contains(header.element) && header.names.length === cells[0].length
            && !!(header.element.compareDocumentPosition(container) & 4)
            && cells.some(row => row.slice(1).some((cell, column) =>
                Array.from(cell.querySelectorAll('.sr-only')).some(label =>
                    descriptionValue(label.textContent, header.names[column + 1], row[0].textContent) !== null))));
        if (candidates.length) return candidates.length === 1 ? candidates[0] : undefined;
    }
    return undefined;
}
export function normalizeLayoutTables(body: HTMLElement): void {
    const doc = body.ownerDocument;
    // Snapshot separate header rows before replacing any grouped data rows.
    const headers: SharedHeader[] = Array.from(body.querySelectorAll('div,[role="row"]')).flatMap(element => {
        const cells = Array.from(element.children);
        if (cells.length < 2 || hasLooseText(element) || !gridDefinition(element)
            || unsafeLayout(element)) return [];
        const names = cells.map(cell => {
            const copy = cell.cloneNode(true) as Element;
            for (const control of Array.from(copy.querySelectorAll('a,button,.sr-only'))) control.parentNode.removeChild(control);
            return normalizedText(copy.textContent);
        });
        // Selection can start at the first named column and omit the empty
        // corner. The retained grid definition must prove exactly one gap.
        if (names[0]) {
            if (!matchesWidth(element, cells.length + 1)) return [];
            names.unshift('');
        } else if (!matchesWidth(element, cells.length)) return [];
        return names.slice(1).every(Boolean) && new Set(names.slice(1)).size === names.length - 1
            ? [{ element, names }] : [];
    });
    const usedHeaders = new Set<Element>();
    for (const container of [body, ...Array.from(body.querySelectorAll('div,section,[role="table"],[role="grid"]'))]) {
        if (!body.contains(container) || container.closest('table') || hasLooseText(container)) continue;
        const semantic = ['table', 'grid'].includes(role(container));
        const children = Array.from(container.children);
        const rows = semantic ? children.flatMap(child => role(child) === 'rowgroup' && !hasLooseText(child)
            ? Array.from(child.children) : [child]) : children;
        if (rows.length < 1 || rows.some(hasLooseText)) continue;
        const cells = rows.map(rowCells);
        const width = cells[0].length;
        if (width < 2 || cells.some(row => row.length !== width) || unsafeLayout(container)) continue;
        if (semantic) {
            if (rows.some(row => role(row) !== 'row') || cells.some(row => row.some(cell =>
                !['cell', 'gridcell', 'columnheader', 'rowheader'].includes(role(cell))))) continue;
        } else {
            const definition = gridDefinition(rows[0]);
            if (!definition || rows.some(row => gridDefinition(row) !== definition || !matchesWidth(row, width))
                || !(rows.length === 1 ? rows.every(separated) : rows.slice(0, -1).every(separated))) continue;
            // Cards commonly contain headings, media and nested layout grids.
            if (cells.some(row => row.some((cell, column) => cell.querySelector('img,table,article')
                || (column > 0 && cell.querySelector('h1,h2,h3,h4,h5,h6'))
                || [cell, ...Array.from(cell.querySelectorAll('*'))].some(node => gridDefinition(node))))) continue;
            const headingSelector = 'h1,h2,h3,h4,h5,h6';
            if (cells.some(row => row[0].querySelector(headingSelector))
                && !cells.every(row => row[0].querySelector(headingSelector))) continue;
            if (rows.length === 1 && !cells[0][0].querySelector('h1,h2,h3,h4,h5,h6')) continue;
        }
        const header = semantic ? cells[0].every(cell => role(cell) === 'columnheader')
            : cells[0].every(cell => cell.textContent.trim()) && rows.length >= 3
                && cells[0].some((cell, column) => {
                    const signature = (node: Element) => (node.getAttribute('class') || '') + '|' + (node.getAttribute('style') || '');
                    return signature(cell) !== signature(cells[1][column])
                        && cells.slice(1).every(row => signature(row[column]) === signature(cells[1][column]));
                });
        const table = doc.createElement('table');
        const shared = header ? undefined : findSharedHeader(container, cells, headers);
        if (shared) {
            const tr = doc.createElement('tr');
            for (const name of shared.names) {
                const th = doc.createElement('th');
                th.textContent = name;
                tr.appendChild(th);
            }
            table.appendChild(tr);
            usedHeaders.add(shared.element);
        }
        const symbolValues = new Map<string, string | null>();
        if (shared) for (const row of cells) for (let column = 1; column < row.length; column++) {
            const reference = symbolReference(row[column]);
            if (!reference) continue;
            for (const label of Array.from(row[column].querySelectorAll('.sr-only'))) {
                const value = descriptionValue(label.textContent, shared.names[column], row[0].textContent);
                if (value === null) continue;
                if (!symbolValues.has(reference)) symbolValues.set(reference, value);
                else if (symbolValues.get(reference) !== value) symbolValues.set(reference, null);
            }
        }
        rows.forEach((row, index) => {
            const tr = doc.createElement('tr');
            const rowLabel = cells[index][0].textContent;
            cells[index].forEach((cell, column) => {
                const td = doc.createElement(header && index === 0 ? 'th' : 'td');
                const alignment = styleValue(cell, 'text-align') || classes(cell).map(token => /^text-(left|center|right)$/.exec(token)?.[1]).find(Boolean);
                if (alignment && /^(left|center|right)$/.test(alignment)) td.setAttribute('align', alignment);
                const reference = symbolReference(cell);
                const inferred = column > 0 && !cell.textContent.trim() && reference ? symbolValues.get(reference) : '';
                for (const svg of Array.from(cell.querySelectorAll('svg'))) svg.parentNode.replaceChild(doc.createTextNode(iconText(svg) || inferred || ''), svg);
                // Prefer the visible representation when both versions exist.
                // If only an accessibility description remains, preserve it whole.
                const accessible = Array.from(cell.querySelectorAll('.sr-only'));
                if (shared && column > 0) for (const label of accessible) {
                    const value = descriptionValue(label.textContent, shared.names[column], rowLabel);
                    if (value !== null) label.textContent = value;
                }
                const visible = cell.cloneNode(true) as Element;
                for (const node of Array.from(visible.querySelectorAll('.sr-only'))) node.parentNode.removeChild(node);
                if (visible.textContent.trim()) for (const node of accessible) node.parentNode.removeChild(node);
                for (const heading of Array.from(cell.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
                    const span = doc.createElement('span');
                    while (heading.firstChild) span.appendChild(heading.firstChild);
                    heading.parentNode.replaceChild(span, heading);
                }
                // Keep inline formatting and lists for the existing converter.
                const content = doc.createElement('div');
                if (cell.hasAttribute('style')) content.setAttribute('style', cell.getAttribute('style'));
                while (cell.firstChild) content.appendChild(cell.firstChild);
                td.appendChild(content);
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });
        if (container === body) {
            while (body.firstChild) body.removeChild(body.firstChild);
            body.appendChild(table);
        } else container.parentNode.replaceChild(table, container);
    }
    // Keep actionable links if a header doubles as a purchase/navigation panel.
    for (const element of usedHeaders) if (!element.querySelector('a,button') && element.parentNode) element.parentNode.removeChild(element);
}
