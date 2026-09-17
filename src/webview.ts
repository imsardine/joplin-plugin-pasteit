import { convert, defaults, Options } from './converter';

const editor = document.getElementById('markdown') as HTMLTextAreaElement;
if (editor) {
    const isMobile = !!document.querySelector('.paste-dialog.mobile');
    if (!isMobile) editor.focus();
    const status = document.getElementById('status');
    let message = 'Ready to paste.';
    let activeTab = 'markdown';
    const updateStatus = () => { status.textContent = activeTab === 'markdown' ? message : 'Original clipboard data · Read-only'; };
    const panels = document.getElementById('content-panels');
    const tabs = [{ key: 'markdown', button: document.getElementById('tab-markdown'), panel: document.getElementById('panel-markdown') }];
    const selectTab = (key: string, focus = false) => {
        activeTab = key;
        updateStatus();
        for (const tab of tabs) {
            const selected = tab.key === key;
            tab.button.setAttribute('aria-selected', String(selected));
            tab.button.tabIndex = selected ? 0 : -1;
            tab.panel.hidden = !selected;
            if (selected && focus) tab.button.focus();
        }
    };
    const bindTab = (tab: typeof tabs[number]) => {
        tab.button.addEventListener('click', () => selectTab(tab.key));
        tab.button.addEventListener('keydown', (event: KeyboardEvent) => {
            const available = tabs.filter(item => !item.button.hidden);
            const index = available.indexOf(tab);
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % available.length;
            else if (event.key === 'ArrowLeft') next = (index + available.length - 1) % available.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = available.length - 1;
            else return;
            event.preventDefault();
            selectTab(available[next].key, true);
        });
    };
    tabs.forEach(bindTab);
    const binaryLabels: HTMLElement[] = [];
    const showSource = (formats = new Map<string, string | null>()) => {
        for (const label of binaryLabels.splice(0)) label.parentNode.removeChild(label);
        for (const tab of tabs.splice(1)) {
            tab.button.parentNode.removeChild(tab.button);
            tab.panel.parentNode.removeChild(tab.panel);
        }
        for (const [type, value] of formats) {
            if (value === null) {
                const label = document.createElement('span');
                label.className = 'binary-format';
                label.setAttribute('data-mime', type);
                label.textContent = `📋 ${type || 'Unknown type'} · binary`;
                label.title = 'Binary clipboard data · Preview unavailable';
                tabs[0].button.parentNode.appendChild(label);
                binaryLabels.push(label);
                continue;
            }
            const key = `source-${tabs.length}`;
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('data-mime', type);
            button.id = `tab-${key}`;
            const icon = document.createElement('span');
            icon.textContent = '📋';
            icon.setAttribute('aria-hidden', 'true');
            button.appendChild(icon);
            button.appendChild(document.createTextNode(` ${type}`));
            button.title = 'Original clipboard data';
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', `panel-${key}`);
            const panel = document.createElement('div');
            panel.id = `panel-${key}`;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', button.id);
            const field = document.createElement('textarea');
            field.setAttribute('aria-describedby', 'status');
            field.readOnly = true;
            field.rows = 12;
            field.spellcheck = false;
            field.setAttribute('aria-label', `Original content (${type}) (read-only)`);
            field.value = value;
            panel.appendChild(field);
            tabs[0].button.parentNode.appendChild(button);
            panels.appendChild(panel);
            const tab = { key, button, panel };
            tabs.push(tab);
            bindTab(tab);
        }
        selectTab('markdown');
    };
    const controls = Array.from(document.querySelectorAll<HTMLInputElement>('[data-option]'));
    const noHtml = 'No styling or structure information is available for conversion.';
    let original: { html?: string; text?: string } = null;
    let lastValue = '';
    const options = (): Options => {
        const result = { ...defaults };
        for (const input of controls) result[input.getAttribute('data-option')] = input.type === 'checkbox' ? input.checked : input.value;
        return result;
    };
    const render = () => {
        if (!original) return;
        try {
            editor.value = convert(original, options());
            message = original.html ? 'Converted to Markdown. You can edit the result.' : noHtml;
        } catch {
            editor.value = original.text || '';
            message = 'Conversion failed. The original text is shown; paste again to retry.';
        }
        lastValue = editor.value;
        updateStatus();
    };
    editor.addEventListener('paste', event => {
        const data = event.clipboardData;
        if (!data) return;
        // DataTransfer.types uses "Files" as an aggregate marker. Individual
        // file MIME types are exposed through items/files, without reading bytes.
        const formats = new Map<string, string | null>();
        for (const type of Array.from(data.types || [])) {
            if (type === 'Files') continue;
            const value = data.getData(type);
            formats.set(type, value);
        }
        for (const item of Array.from(data.items || [])) {
            const type = item.type;
            if (item.kind === 'file') formats.set(type, null);
            else if (item.kind === 'string' && !formats.has(type)) formats.set(type, data.getData(type));
        }
        for (const file of Array.from(data.files || [])) formats.set(file.type, null);
        if (Array.from(data.types || []).includes('Files') && !Array.from(formats.values()).includes(null)) formats.set('Files', null);
        if (!formats.size) return;
        const html = formats.get('text/html') || '';
        const text = formats.get('text/plain') || '';
        event.preventDefault();
        // Each paste starts a new conversion. Keep its source separate from the editable result.
        showSource(formats);
        if (html || text) {
            original = { html, text };
            render();
        } else {
            original = null;
            lastValue = editor.value;
            message = 'Clipboard formats listed. No supported text content to convert.';
            updateStatus();
        }
    });
    editor.addEventListener('input', (event: InputEvent) => {
        if (editor.value === lastValue) return;
        lastValue = editor.value;
        // Keyboard/native paste may bypass ClipboardEvent, leaving no HTML to convert.
        if (!original || event.inputType === 'insertFromPaste') {
            original = { text: editor.value };
            // No ClipboardEvent payload was received; don't present edited text as raw clipboard data.
            showSource();
            message = noHtml;
        }
        updateStatus();
    });
    document.getElementById('options').addEventListener('input', render);
    document.getElementById('clear').addEventListener('click', () => {
        original = null;
        showSource();
        editor.value = '';
        lastValue = '';
        message = 'Ready to paste.';
        updateStatus();
        if (!isMobile) editor.focus();
    });
}
