// Use form fields for the dialog API; no panel postMessage bridge is needed.
(() => {
    const source = document.getElementById('source');
    if (!source) return;
    const html = document.getElementById('clipboardHtml');
    const raw = document.getElementById('rawHtml');
    const status = document.getElementById('status');
    let capturedText = null;
    let sawPaste = false;
    const diagnose = message => {
        document.getElementById('pasteDiagnostic').value = message;
        document.getElementById('diagnostic').textContent = '剪貼簿診斷：' + message;
    };
    source.addEventListener('paste', event => {
        sawPaste = true;
        if (!event.clipboardData) {
            diagnose('paste 事件沒有 clipboardData');
            return;
        }
        const rich = event.clipboardData.getData('text/html');
        const text = event.clipboardData.getData('text/plain');
        // Only report known MIME categories and lengths, never clipboard content.
        const types = Array.from(event.clipboardData.types || []);
        const known = ['text/html', 'text/plain', 'text/uri-list', 'Files'].filter(type => types.includes(type));
        diagnose(`paste：格式=${known.join(', ') || '無已知格式'}；HTML=${rich.length} 字元；文字=${text.length} 字元`);
        if (!rich && !text) return; // Let native paste handle platforms without clipboardData.
        event.preventDefault();
        source.value = text || rich;
        capturedText = source.value;
        html.value = rich;
        raw.checked = false;
        status.textContent = rich ? '已取得 HTML 格式；輸入欄只顯示文字，轉換會使用 HTML。' : '這次貼上事件只提供純文字，無法還原格式或隱藏連結。';
    });
    source.addEventListener('input', () => {
        // Some WebViews emit input even after a handled paste. Do not discard its HTML
        // unless the visible text actually changed.
        if (capturedText !== null && source.value === capturedText) return;
        capturedText = null;
        html.value = '';
        diagnose(sawPaste ? '文字已修改或由系統輸入；目前沒有保留 HTML' : '收到文字輸入，但未觸發 paste 事件（可能經由鍵盤貼上）');
        status.textContent = '目前為文字內容；HTML 原始碼請勾選下方選項。';
    });
})();
