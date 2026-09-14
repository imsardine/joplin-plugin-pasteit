import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { defaults, labels, trackingDescription } from './converter';
import { cleanMarkdown } from './cleanup';
import { selectionCommands } from './selectionEditor';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const checked = (value: unknown) => value === true || value === 'on' || value === 'true' || value === '1';
export const cleanupDialogSetting = 'cleanupShowDialog';

export async function registerCleanup(isDesktop: boolean): Promise<void> {
    const dialogs = joplin.views.dialogs;
    let dialog: string;
    let active = false;
    const command = 'pasteItPlugin.cleanSelection';
    const executeEditor = (name: string, ...args: any[]) => joplin.commands.execute('editor.execCommand', { name, args });
    await joplin.commands.register({
        name: command, label: 'Clear formatting', iconName: 'fas fa-eraser',
        ...(isDesktop ? { enabledCondition: 'markdownEditorPaneVisible && oneNoteSelected && noteIsMarkdown && !noteIsReadOnly && (!modalDialogVisible || gotoAnythingVisible)' } : {}),
        execute: async () => {
            if (active) return;
            active = true;
            let token: string;
            try {
                const note = await joplin.workspace.selectedNote();
                if (!note || note.markup_language !== 1) return;
                const selection = await executeEditor(selectionCommands.capture);
                if (!selection?.text) {
                    await dialogs.showMessageBox('Select the text you want to clean up first.');
                    return;
                }
                token = selection.token;
                const options = { ...defaults };
                const fields: string[] = [];
                for (const key of ['removeTextStyling', 'cleanTracking', 'extraTracking']) {
                    const value = await joplin.settings.value(key);
                    options[key] = value ?? defaults[key];
                    fields.push(key === 'extraTracking'
                        ? `<label>${labels[key]}<input name="${key}" type="text" value="${escapeHtml(value || '')}"></label>`
                        : `<label><input name="${key}" type="checkbox" ${value ? 'checked' : ''}> ${labels[key]}</label>`);
                }
                if (await joplin.settings.value(cleanupDialogSetting) !== false) {
                    if (!dialog) {
                        dialog = await dialogs.create('pasteItCleanupDialog');
                        await dialogs.addScript(dialog, './webview.css');
                        await dialogs.setFitToContent(dialog, false);
                        await dialogs.setButtons(dialog, [{ id: 'ok', title: 'Clear formatting' }, { id: 'cancel', title: 'Cancel' }]);
                    }
                    await dialogs.setHtml(dialog, `<div class="paste-dialog ${isDesktop ? 'desktop' : 'mobile'}"><h2>Clear formatting</h2><form name="cleanup">
                    <fieldset><legend>What would you like to clean up?</legend>${fields.join('')}</fieldset>
                    <details><summary>Parameters removed by default</summary><p>${escapeHtml(trackingDescription)}</p></details>
                    <p>Only the selected text will be changed. Code and document structure are preserved.</p>
                    </form></div>`);
                    const result = await dialogs.open(dialog);
                    if (result?.id !== 'ok') return;
                    const values = result.formData?.cleanup;
                    if (!values) throw new Error('No cleanup options were received. Please reopen the dialog.');
                    options.removeTextStyling = checked(values.removeTextStyling);
                    options.cleanTracking = checked(values.cleanTracking);
                    options.extraTracking = String(values.extraTracking || '');
                }
                const cleaned = cleanMarkdown(selection.text, options);
                if (cleaned === selection.text) return;
                const current = await joplin.workspace.selectedNote();
                if (!current || current.id !== note.id || current.markup_language !== 1) throw new Error('The selected note changed. Reopen Clear formatting.');
                if (await executeEditor(selectionCommands.apply, token, cleaned) !== true) throw new Error('The original selection could not be updated. Reopen Clear formatting.');
            } catch (error) {
                await dialogs.showMessageBox(`Cleanup failed: ${error.message || String(error)}`);
            } finally {
                if (token) {
                    try { await executeEditor(selectionCommands.discard, token); } catch { /* Editor may have closed. */ }
                }
                active = false;
            }
        },
    });
    await joplin.views.toolbarButtons.create('pasteIt-cleanup', command, ToolbarButtonLocation.EditorToolbar);
    if (isDesktop) {
        await joplin.views.menuItems.create('pasteIt-cleanup-menu', command, MenuItemLocation.Edit);
        await joplin.views.menuItems.create('pasteIt-cleanup-context', command, MenuItemLocation.EditorContextMenu);
    }
}
