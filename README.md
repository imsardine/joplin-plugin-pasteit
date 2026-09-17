# Paste It

Tools for pasting and editing Markdown in Joplin 3.0+ on desktop and mobile. Convert copied web content—including tables and lists—to Markdown, clear formatting and remove tracking parameters from links, and toggle block quotes in the editor.

**Tables beyond `<table>`:** converts recognizable tables built with CSS grids or accessibility markup to Markdown.

## Install

Open **Settings → Plugins** in Joplin, search for **Paste It**, and select **Install**. Restart Joplin when prompted.

## Use

### Paste

1. Open a Markdown note in the Markdown editor and place the cursor where the content should go.
2. Select **Paste It…** in the editor toolbar. On desktop, you can also use **Edit → Paste It…** or **Ctrl+Alt+V** (**Cmd+Alt+V** on macOS).
3. Paste into the dialog using **Ctrl/Cmd+V** or **long-press → Paste**. The field immediately replaces the pasted content with converted Markdown.
4. Adjust the options or edit the Markdown, then choose **Insert into note**.

Choose your options before editing the Markdown: changing an option replaces manual edits. Use **Clear** to start over.

For troubleshooting, the **📋** tabs list all received clipboard types. Conversion currently uses only `text/html` and `text/plain`.

On desktop, turn off **Show dialog before pasting** under **Settings → Paste It** to paste immediately using your global conversion settings. This setting is available only on desktop; mobile always opens the paste dialog.

On Android, use the standard long-press **Paste** action. **Paste as plain text** and keyboard clipboard history may discard formatting.

> [!NOTE]
> **Why paste into a dialog?** Paste It lets you preview and edit the Markdown, choose formatting options, and clean tracking links before inserting it into your note. On mobile, Joplin's plugin API can read only plain text from the clipboard. Pasting into the dialog lets Paste It receive formatted content, so the dialog is required on mobile. If the source app or paste method provides only plain text, Paste It can still clean web links, but cannot recover the missing formatting.

#### Supported content

The plugin converts common text formatting, headings, lists, quotes, code, links and tables into Markdown. Fonts, colors and page layout are not preserved. Images contribute their alternative text only. Use Joplin's Markdown editor; Rich Text editor behavior has not been verified.

Tables preserve columns, headers, alignment, and formatting and links within cells. Lists can retain their nesting or use simple line breaks (see **Options**). Merged cells and nested tables are simplified to fit Markdown tables.

Some visual tables may remain plain text if the copied content does not retain enough table structure.

#### When formatting is unavailable

Some apps and paste methods provide only plain text. The dialog will let you know when source formatting is unavailable. You can still edit and insert the text and clean its web links, but lost formatting cannot be recovered. If the text already contains Markdown, **Remove text styling** can remove its styling.

### Quote / Unquote

Use **Quote / Unquote** in the Markdown editor toolbar without opening Paste It. On desktop, this command is also available in the **Edit** menu and the editor's right-click menu.

Toggle quoting for the selected block, or the current line if nothing is selected. Existing quotes are preserved as nested quotes when adding a level. Use the editor's **Undo** command to undo the change.

### Clear formatting

Select text and choose **Clear formatting** in the editor toolbar. Choose whether to remove text styling, clean tracking parameters, or both, then select **Clear formatting**. Code, links and document structure are preserved. On desktop, the command is also available in the **Edit** menu, right-click menu and Command Palette.

To skip the dialog, turn off **Show dialog before clearing formatting** under **Settings → Paste It**. The command then uses your global text styling and tracking settings. A selection is always required, and changes can be undone with the editor's **Undo** command.

## Options

Set your defaults under **Settings → Paste It**. The Paste and Clear formatting dialogs let you adjust their options for the current operation.

| Option | Behavior |
| --- | --- |
| Remove text styling (except inline code) | Removes bold, italic, strikethrough and highlighting while keeping code, links and document structure. Off by default. |
| Add a block quote level | Quotes the pasted content, preserving existing quotes as nested quotes. Off by default. |
| Use HTML lists in tables (otherwise use line breaks) | Preserves nested lists in table cells. Turn off to use simple line breaks instead, without nesting. On by default. |
| Remove advertising and tracking parameters | Cleans tracking parameters from web links. On by default. |
| Additional parameters to remove | Comma-separated names, such as `ref, source`. Use `track_*` to match a prefix. Matching ignores case. Requires tracking removal to be enabled. |

The following switches are available in global settings only:

| Option | Behavior |
| --- | --- |
| Show dialog before pasting | Desktop only. Turn off to paste immediately using your global conversion settings. On by default; mobile always opens the dialog. |
| Show dialog before clearing formatting | Turn off to clear formatting using your global text styling and tracking settings. On by default. |

For example, tracking removal changes:

```text
https://example.com/article?id=42&utm_source=newsletter&fbclid=abc
```

to:

```text
https://example.com/article?id=42
```

### Parameters removed by default

When tracking removal is enabled, the plugin removes the following parameters. Names are matched without regard to case.

| Parameter group | Names |
| --- | --- |
| UTM campaign parameters | `utm_*` — including `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` |
| Click identifiers | `fbclid`, `gclid`, `dclid`, `gbraid`, `wbraid`, `msclkid`, `ttclid`, `twclid` |
| Other tracking identifiers | `igshid`, `mc_cid`, `mc_eid`, `_ga`, `_gl`, `mkt_tok`, `vero_id`, `oly_anon_id`, `oly_enc_id` |

Other parameters are kept unless you add them under **Additional parameters to remove**.

## Development

```sh
npm ci
npm test
```

`npm test` builds the plugin and runs the automated tests. Use `npm run dist` to build without running tests. Install the resulting `publish/joplin.plugin.pasteit.jpl` through Joplin's **Install from file** option.

Automated tests use a DOM implementation and a simulated Joplin API. Native clipboard behavior requires testing in Joplin on the target device.

## References

- [Joplin clipboard API](https://joplinapp.org/api/references/plugin_api/classes/joplinclipboard.html)
- [Joplin dialog API](https://joplinapp.org/api/references/plugin_api/classes/joplinviewsdialogs.html)
- [Joplin Markdown editor plugin API](https://joplinapp.org/help/api/tutorials/cm6_plugin/)
- [Turndown HTML-to-Markdown converter](https://github.com/mixmark-io/turndown)
