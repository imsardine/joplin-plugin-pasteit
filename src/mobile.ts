import joplin from 'api';
import { convert, defaults, labels, Options } from './converter';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// panels.show only enables a tab on mobile; dialogs.open presents an actual modal.
export async function createMobilePaste(getOptions: () => Promise<Options>, insert: (text: string, id: string) => Promise<void>) {
    const dialogs = joplin.views.dialogs;
    const source = await dialogs.create('pasteMarkdownSource');
    const preview = await dialogs.create('pasteMarkdownPreview');
    for (const handle of [source, preview]) {
        await dialogs.addScript(handle, './panel.css');
        await dialogs.setFitToContent(handle, false);
    }
    await dialogs.addScript(source, './mobile-paste.js');
    await dialogs.setButtons(source, [{ id: 'ok', title: '轉換並預覽' }, { id: 'cancel', title: '取消' }]);
    await dialogs.setButtons(preview, [{ id: 'ok', title: '插入筆記' }, { id: 'copy', title: '複製 Markdown' }, { id: 'cancel', title: '取消' }]);
    let active = false;
    return async () => {
        console.info('[Paste as Markdown] mobile command invoked');
        if (active) return;
        active = true;
        try {
            const note = await joplin.workspace.selectedNote();
            if (!note) throw new Error('請先開啟筆記。');
            const options = await getOptions();
            const fields = Object.keys(defaults).map(key => typeof defaults[key] === 'boolean'
                ? `<label><input type="checkbox" name="${key}" value="1" ${options[key] ? 'checked' : ''}>${labels[key]}</label>`
                : `<label>${labels[key]}<input type="text" name="${key}" value="${escapeHtml(options[key])}"></label>`).join('');
            await dialogs.setHtml(source, `<h2>貼為 Markdown</h2><form name="paste">
                <p>在下方長按貼上。系統若只提供純文字，無法還原格式或隱藏連結。</p>
                <label for="source">貼上內容</label><textarea id="source" name="text" rows="7"></textarea>
                <input id="clipboardHtml" type="hidden" name="html" value="">
                <input id="pasteDiagnostic" type="hidden" name="diagnostic" value="尚未收到貼上事件">
                <label><input id="rawHtml" name="rawHtml" type="checkbox" value="1">將內容視為 HTML 原始碼</label>
                <fieldset><legend>本次選項</legend>${fields}</fieldset>
                <p id="diagnostic" role="status">剪貼簿診斷：尚未收到貼上事件</p>
                <p id="status" role="status">請貼上內容，再按「轉換並預覽」。</p></form>`);
            console.info('[Paste as Markdown] opening mobile input dialog');
            const result = await dialogs.open(source);
            if (result?.id !== 'ok') return;
            const data = result.formData?.paste;
            if (!data) throw new Error('未收到貼上表單資料，請重新開啟視窗。');
            console.info('[Paste as Markdown] clipboard diagnostic', data.diagnostic || 'unavailable');
            for (const key of Object.keys(defaults)) options[key] = typeof defaults[key] === 'boolean' ? data[key] === '1' : (data[key] || '');
            const markdown = convert({ text: data.text || '', html: data.rawHtml === '1' ? data.text : data.html }, options);
            if (!markdown.trim()) throw new Error('沒有可轉換的內容，請先在輸入欄貼上。');
            await dialogs.setHtml(preview, `<h2>Markdown 預覽</h2><p>${escapeHtml(data.diagnostic || "診斷資料不可用")}</p><form name="preview"><label for="markdown">可修改後插入或複製</label><textarea id="markdown" name="markdown" rows="14">${escapeHtml(markdown)}</textarea></form>`);
            const decision = await dialogs.open(preview);
            if (!decision || !['ok', 'copy'].includes(decision.id)) return;
            const text = decision.formData?.preview?.markdown;
            if (!text?.trim()) throw new Error('沒有可插入或複製的內容。');
            if (decision.id === 'copy') await joplin.clipboard.writeText(text);
            else await insert(text, note.id);
            console.info('[Paste as Markdown] mobile action completed');
        } catch (error) {
            console.error('[Paste as Markdown] mobile action failed', error);
            await dialogs.showMessageBox(`貼上失敗：${error.message || String(error)}`);
        } finally { active = false; }
    };
}
