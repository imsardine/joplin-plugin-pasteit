# Paste It

Paste web content as Markdown in Joplin 3.0+ on desktop and mobile. Preserve formatting and links, optionally remove text styling, quote the pasted content, and clean advertising or tracking parameters from URLs.

## Install

Open **Settings → Plugins** in Joplin, search for **Paste It**, and select **Install**. Restart Joplin when prompted.

## Use

1. Open a Markdown note in the Markdown editor and place the cursor where the content should go.
2. Select **Paste It…** in the editor toolbar. On desktop, you can also use **Edit → Paste It…** or **Ctrl+Alt+V** (**Cmd+Alt+V** on macOS).
3. Paste into the dialog using **Ctrl/Cmd+V** or **long-press → Paste**. The field immediately replaces the pasted content with converted Markdown.
4. Adjust the options or edit the Markdown, then choose **Insert into note**.

Choose your conversion options before making manual edits: changing an option regenerates the Markdown and replaces those edits. Use **Clear** to start over, or the editor’s **Undo** command to undo an insertion.

On Android, use the standard long-press **Paste** action. **Paste as plain text** and keyboard clipboard history may discard formatting.

> [!NOTE]
> **Why paste into a dialog?** Joplin's plugin API can read HTML directly from the clipboard on desktop, but does not provide that capability on mobile. The dialog uses a WebView to receive HTML when you paste, giving desktop and mobile the same workflow. The available formatting still depends on what your source app and device provide.

## Options

Set your defaults under **Settings → Paste It**, or adjust the options for the current paste in the dialog.

| Option | Behavior |
| --- | --- |
| Remove text styling (except inline code) | Removes bold, italic and strikethrough formatting while keeping inline code, headings, lists, quotes, code blocks and links. Off by default. |
| Add a block quote level | Presents the pasted content as a quotation. Any quotations already in the content remain nested inside it. Off by default. |
| Remove advertising and tracking parameters | Cleans tracking parameters from web links, such as `utm_source`, `utm_campaign`, `fbclid`, `gclid` and `msclkid`. On by default. |
| Additional parameters to remove | Add parameter names separated by commas, such as `ref, source`, to remove those exact names. Use `track_*` to remove names starting with `track_`, such as `track_id` and `track_source`. Matching ignores case. Requires tracking removal to be enabled. |

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

Your **Additional parameters to remove** entries extend this list. Other parameter names are kept.

## Supported content

The plugin converts common text formatting, headings, lists, quotes, code and links into Markdown. Fonts, colors, page layout and table structure are not preserved. Images contribute their alternative text only. Use Joplin's Markdown editor; Rich Text editor behavior has not been verified.

### When formatting is unavailable

Some apps and paste methods provide only plain text. In that case, the dialog displays:

> No styling or structure information is available for conversion.

You can still edit and insert the text, and pasted web links can still be cleaned. Formatting and hidden link destinations cannot be recovered from plain text. Existing Markdown is not converted again to apply text styling options.

## Privacy

Conversion runs locally on your device. Clipboard content is not sent to a server or saved in plugin settings.

## Development

```sh
npm ci
npm test
```

`npm test` builds the plugin and runs the conversion, dialog and WebView tests. Use `npm run dist` to build without running tests. Install the resulting `publish/joplin.plugin.pasteit.jpl` through Joplin's **Install from file** option.

Automated tests use a DOM implementation and a simulated Joplin API. Native clipboard behavior requires testing in Joplin on the target device.

## References

- [Joplin clipboard API](https://joplinapp.org/api/references/plugin_api/classes/joplinclipboard.html)
- [Joplin dialog API](https://joplinapp.org/api/references/plugin_api/classes/joplinviewsdialogs.html)
- [Turndown HTML-to-Markdown converter](https://github.com/mixmark-io/turndown)
