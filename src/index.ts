import joplin from 'api';
import { MenuItemLocation, SettingItemType, ToolbarButtonLocation } from 'api/types';
import { defaults, labels, trackingDescription } from './converter';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
joplin.plugins.register({
    onStart: async () => {
        await joplin.settings.registerSection('pasteIt', { label: 'Paste It', iconName: 'fas fa-paste' });
        const settings = {};
        for (const key of Object.keys(defaults)) settings[key] = {
            value: defaults[key], type: typeof defaults[key] === 'boolean' ? SettingItemType.Bool : SettingItemType.String,
            section: 'pasteIt', public: true, label: labels[key],
            ...(key === 'cleanTracking' ? { description: trackingDescription } : {}),
        };
        await joplin.settings.registerSettings(settings);
        const dialogs = joplin.views.dialogs;
        const dialog = await dialogs.create('pasteItPluginDialog');
        await dialogs.addScript(dialog, './webview.css');
        await dialogs.addScript(dialog, './webview.js');
        const isDesktop = (await joplin.versionInfo()).platform === 'desktop';
        // Let Joplin size the dialog from its host window, independently of content.
        await dialogs.setFitToContent(dialog, false);
        await dialogs.setButtons(dialog, [{ id: 'ok', title: 'Insert into note' }, { id: 'cancel', title: 'Close' }]);
        let active = false;
        let session = 0;
        const open = async () => {
            if (active) return;
            active = true;
            try {
                const note = await joplin.workspace.selectedNote();
                const fields = [];
                for (const key of Object.keys(defaults)) {
                    const value = await joplin.settings.value(key);
                    fields.push(typeof defaults[key] === 'boolean'
                        ? `<label><input data-option="${key}" type="checkbox" ${value ? 'checked' : ''}> ${labels[key]}</label>`
                        : `<label>${labels[key]}<input data-option="${key}" type="text" value="${escapeHtml(value || '')}"></label>`);
                    if (key === 'cleanTracking') fields.push(`<details><summary>Parameters removed by default</summary><p>${escapeHtml(trackingDescription)}</p></details>`);
                }
                await dialogs.setHtml(dialog, `<div class="paste-dialog ${isDesktop ? 'desktop' : 'mobile'}"><h2>Paste It</h2><form name="paste" data-session="${++session}">
                    <label for="markdown">Markdown (editable)</label><textarea id="markdown" name="markdown" rows="12" ${isDesktop ? 'autofocus' : ''} placeholder="Paste using Ctrl/Cmd+V or long-press → Paste. Markdown replaces the pasted content automatically."></textarea>
                    <button id="clear" type="button">Clear</button>
                    <p id="status" role="status" aria-live="polite">Ready to paste.</p>
                    <fieldset id="options"><legend>Conversion options</legend>${fields.join('')}</fieldset>
                    <p>Changing options rebuilds Markdown from the original paste and replaces manual edits.</p>
                    </form></div>`);
                const result = await dialogs.open(dialog);
                if (result?.id !== 'ok') return;
                const text = result.formData?.paste?.markdown;
                if (!text?.trim()) throw new Error('Paste some content first.');
                const current = await joplin.workspace.selectedNote();
                if (!note || !current || current.id !== note.id) throw new Error('The selected note changed. Reopen the dialog before inserting.');
                if (current.markup_language !== 1) throw new Error('Open a Markdown note in the Markdown editor.');
                await joplin.commands.execute('insertText', text);
            } catch (error) {
                console.error('[Paste It] action failed', error);
                await dialogs.showMessageBox(`Paste failed: ${error.message || String(error)}`);
            } finally { active = false; }
        };
        await joplin.commands.register({ name: 'pasteItPlugin.openDialog', label: 'Paste It…', iconName: 'fas fa-paste', execute: open });
        await joplin.views.toolbarButtons.create('pasteItButton', 'pasteItPlugin.openDialog', ToolbarButtonLocation.EditorToolbar);
        if (isDesktop) {
            await joplin.window.loadChromeCssFile(`${await joplin.plugins.installationDir()}/chrome.css`);
            await joplin.views.menuItems.create('pasteItMenu', 'pasteItPlugin.openDialog', MenuItemLocation.Edit, { accelerator: 'CmdOrCtrl+Alt+V' });
        }
        console.info('[Paste It] ready');
    },
});
