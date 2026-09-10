/* global webviewApi */
(async function () {
    const $ = id => document.getElementById(id);
    let clipboardHtml = '';
    const status = text => { $('status').textContent = text; };
    const send = async message => {
        const response = await webviewApi.postMessage(message);
        if (response && response.error) throw new Error(response.error);
        return response;
    };
    const run = action => async () => {
        try { await action(); } catch (error) { status(error.message || String(error)); }
    };
    const init = await send({ type: 'init' });
    for (const [key, value] of Object.entries(init.options)) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.id = 'option-' + key;
        input.type = typeof value === 'boolean' ? 'checkbox' : 'text';
        if (input.type === 'checkbox') input.checked = value;
        else input.value = value;
        label.append(input, document.createTextNode(init.labels[key]));
        $('options').append(label);
    }
    const convert = async () => {
        const options = {};
        for (const key of Object.keys(init.options)) {
            const input = $('option-' + key);
            options[key] = input.type === 'checkbox' ? input.checked : input.value;
        }
        const response = await send({ type: 'convert', options, input: {
            html: $('rawHtml').checked ? $('source').value : clipboardHtml,
            text: $('source').value,
        } });
        $('preview').value = response.markdown;
        status('預覽已更新；插入或複製前可修改 Markdown。');
    };
    $('source').addEventListener('paste', event => {
        const data = event.clipboardData;
        if (!data) return;
        event.preventDefault();
        clipboardHtml = data.getData('text/html');
        $('source').value = data.getData('text/plain') || clipboardHtml;
        $('rawHtml').checked = false;
        $('preview').value = '';
        status(clipboardHtml ? '已取得 HTML 格式，請按轉換。' : '系統只提供純文字，無法還原粗體、斜體或隱藏的連結網址。');
    });
    $('source').addEventListener('input', () => { clipboardHtml = ''; $('preview').value = ''; });
    $('read').onclick = run(async () => {
        const response = await send({ type: 'read' });
        clipboardHtml = '';
        $('rawHtml').checked = false;
        $('source').value = response.text;
        $('preview').value = '';
        status('已讀取純文字；若需要格式，請嘗試直接在欄位貼上。');
    });
    const invalidate = () => { $('preview').value = ''; status('選項已變更，請重新轉換。'); };
    $('options').addEventListener('change', invalidate);
    $('rawHtml').addEventListener('change', invalidate);
    $('convert').onclick = run(convert);
    for (const type of ['insert', 'copy']) $('' + type).onclick = run(async () => {
        if (!$('preview').value.trim()) throw new Error('請先轉換內容。');
        $('' + type).disabled = true;
        try {
            await send({ type, markdown: $('preview').value });
            status(type === 'insert' ? '已插入筆記。' : '已複製 Markdown。');
        } finally { $('' + type).disabled = false; }
    });
})().catch(error => { document.getElementById('status').textContent = String(error); });
