import { convert, defaults, Options } from './converter';

const editor = document.getElementById('markdown') as HTMLTextAreaElement;
if (editor) {
    const isMobile = !!document.querySelector('.paste-dialog.mobile');
    if (!isMobile) editor.focus();
    const status = document.getElementById('status');
    const controls = Array.from(document.querySelectorAll<HTMLInputElement>('[data-option]'));
    const noHtml = 'No styling or structure information is available for conversion.';
    let original: { html?: string; text?: string } = null;
    let message = 'Ready to paste.';
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
        status.textContent = message;
    };
    editor.addEventListener('paste', event => {
        const data = event.clipboardData;
        if (!data) return;
        const html = data.getData('text/html');
        const text = data.getData('text/plain');
        if (!html && !text) return;
        event.preventDefault();
        // Each paste starts a new conversion. Keep its source separate from the editable result.
        original = { html, text };
        render();
    });
    editor.addEventListener('input', (event: InputEvent) => {
        if (editor.value === lastValue) return;
        lastValue = editor.value;
        // Keyboard/native paste may bypass ClipboardEvent, leaving no HTML to convert.
        if (!original || event.inputType === 'insertFromPaste') {
            original = { text: editor.value };
            message = noHtml;
        }
        status.textContent = message;
    });
    document.getElementById('options').addEventListener('input', render);
    document.getElementById('clear').addEventListener('click', () => {
        original = null;
        editor.value = '';
        lastValue = '';
        message = 'Ready to paste.';
        status.textContent = message;
        if (!isMobile) editor.focus();
    });
}
