import joplin from 'api';
import { createMobilePaste } from './mobile';
import { MenuItemLocation, SettingItemType, ToolbarButtonLocation } from 'api/types';
import { convert, defaults, labels, Options } from './converter';

joplin.plugins.register({
    onStart: async () => {
        await joplin.settings.registerSection('pasteMarkdown', { label: 'Paste as Markdown', iconName: 'fas fa-paste' });
        const settings = {};
        for (const key of Object.keys(defaults)) settings[key] = {
            value: defaults[key], type: typeof defaults[key] === 'boolean' ? SettingItemType.Bool : SettingItemType.String,
            section: 'pasteMarkdown', public: true, label: labels[key],
        };
        await joplin.settings.registerSettings(settings);
        const options = async (): Promise<Options> => {
            const result = { ...defaults };
            for (const key of Object.keys(defaults)) result[key] = await joplin.settings.value(key);
            return result;
        };
        const platform = (await joplin.versionInfo()).platform;
        const insert = async (markdown: string, expectedId?: string) => {
            if (!markdown.trim()) throw new Error('沒有可插入的內容。');
            const note = await joplin.workspace.selectedNote();
            if (!note || (expectedId && note.id !== expectedId)) throw new Error('筆記已切換，請重新開啟貼上面板。');
            if (note.markup_language !== 1) throw new Error('請選擇 Markdown 筆記並開啟 Markdown 編輯器。');
            await joplin.commands.execute('insertText', markdown);
        };
        if (platform === 'mobile') {
            const open = await createMobilePaste(options, insert);
            for (const [name, label, iconName] of [
                ['pasteAsMarkdown', '貼為 Markdown', 'fas fa-paste'],
                ['pasteMarkdownOptions', '貼為 Markdown：選項與預覽', 'fas fa-sliders-h'],
            ]) {
                await joplin.commands.register({ name, label, iconName, execute: open });
                await joplin.views.toolbarButtons.create(`${name}Button`, name, ToolbarButtonLocation.EditorToolbar);
            }
            console.info('[Paste as Markdown] 1.0.2 mobile ready');
            return;
        }
        const panel = await joplin.views.panels.create('pasteMarkdownPanel');
        await joplin.views.panels.setHtml(panel, `
            <h2>貼為 Markdown</h2>
            <p>在下方長按貼上或按 Ctrl/Cmd+V。格式取決於系統是否提供 HTML；只有純文字時無法還原格式。</p>
            <label for="source">貼上內容</label><textarea id="source" rows="6" placeholder="在此貼上"></textarea>
            <label><input id="rawHtml" type="checkbox">將內容視為 HTML 原始碼</label>
            <button id="read">讀取純文字剪貼簿</button>
            <fieldset id="options"><legend>本次保留效果與連結清理</legend></fieldset>
            <button id="convert">轉換 / 更新預覽</button>
            <label for="preview">Markdown 預覽（可編輯）</label><textarea id="preview" rows="8"></textarea>
            <button id="insert">插入筆記</button><button id="copy">複製 Markdown</button>
            <p id="status" role="status" aria-live="polite"></p>`);
        await joplin.views.panels.hide(panel);
        let targetNote: string | undefined;
        await joplin.views.panels.onMessage(panel, async message => {
            try {
                switch (message.type) {
                    case 'init': return { options: await options(), labels };
                    case 'read': return { text: await joplin.clipboard.readText() };
                    case 'convert': return { markdown: convert(message.input, { ...await options(), ...message.options }) };
                    case 'copy': await joplin.clipboard.writeText(message.markdown); return { ok: true };
                    case 'insert':
                        if (!targetNote) throw new Error('請先選擇筆記，再按工具列的貼上面板按鈕。');
                        await insert(message.markdown, targetNote); return { ok: true };
                }
            } catch (error) { return { error: error.message || String(error) }; }
        });
        await joplin.views.panels.addScript(panel, './panel.css');
        await joplin.views.panels.addScript(panel, './panel.js');
        await joplin.commands.register({
            name: 'pasteMarkdownOptions', label: '貼為 Markdown：選項與預覽', iconName: 'fas fa-sliders-h',
            execute: async () => {
                targetNote = (await joplin.workspace.selectedNote())?.id;
                await joplin.views.panels.show(panel);
            },
        });
        await joplin.commands.register({
            name: 'pasteAsMarkdown', label: '貼為 Markdown', iconName: 'fas fa-paste',
            execute: async () => {
                try {
                    const noteId = (await joplin.workspace.selectedNote())?.id;
                    if (!noteId) throw new Error('請先選擇筆記。');
                    const html = await joplin.clipboard.readHtml();
                    const text = html ? '' : await joplin.clipboard.readText();
                    await insert(convert({ html, text }, await options()), noteId);
                } catch (error) { await joplin.views.dialogs.showMessageBox(`貼上失敗：${error.message || error}`); }
            },
        });
        await joplin.views.toolbarButtons.create('pasteMarkdownButton', 'pasteAsMarkdown', ToolbarButtonLocation.EditorToolbar);
        await joplin.views.toolbarButtons.create('pasteMarkdownOptionsButton', 'pasteMarkdownOptions', ToolbarButtonLocation.EditorToolbar);
        if (platform === 'desktop') {
            await joplin.views.menuItems.create('pasteMarkdownMenu', 'pasteAsMarkdown', MenuItemLocation.Edit, { accelerator: 'CmdOrCtrl+Alt+V' });
            await joplin.views.menuItems.create('pasteMarkdownOptionsMenu', 'pasteMarkdownOptions', MenuItemLocation.Edit);
        }
    },
});
