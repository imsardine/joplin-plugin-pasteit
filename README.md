# Paste as Markdown

將剪貼簿的 HTML 轉成 Markdown，選擇保留格式並移除已知廣告／追蹤參數。目標為 Joplin 3.7+ 的桌機及手機 Markdown 編輯器。

## 使用

### 桌機

在 Joplin「設定 → 外掛」使用「從檔案安裝」選取 `publish/joplin.plugin.paste.jpl`，重新啟動。

- 在 Markdown 編輯器放置游標或選取要取代的文字。
- 按工具列「貼為 Markdown」，或 `Ctrl+Alt+V`（macOS：`Cmd+Alt+V`）。亦可從「編輯」選單執行。
- 「設定 → Paste as Markdown」可儲存預設效果。
- 「貼為 Markdown：選項與預覽」開啟面板，手動貼上、選擇本次效果、轉換，再插入或複製結果。本次選項不改變全域預設。

### 手機

外掛宣告支援 mobile；安裝途徑取決於 Joplin 與作業系統允許的外掛來源。尚未提交官方外掛目錄，因此不保證 iOS 可安裝此本機檔案。

1. 開啟筆記的 Markdown 編輯器，放置游標。
2. 按「貼為 Markdown」或「選項與預覽」工具列按鈕，直接開啟貼上視窗。
3. 在輸入欄長按並貼上，選擇格式，按「轉換並預覽」。
4. 確認預覽後按「插入筆記」。也可複製 Markdown，關閉視窗後自行貼上。

**手機限制：** Joplin 的 `clipboard.readHtml()` 只支援桌機。手機貼上視窗嘗試使用系統貼上事件的 `text/html`；WebView／來源 app 若只提供 `text/plain`，粗斜體與文字背後的連結無法復原。此時會顯示提示，可繼續貼純文字並清理網址，或勾選「將內容視為 HTML 原始碼」轉換手動提供的 HTML。這不是保證所有手機 app 都能保留格式的原生剪貼簿方案。

## 選項與行為

- 粗體、斜體、刪除線、標題、清單、引用、程式碼與連結可獨立保留。
- 支援 HTML 語意標籤及 inline CSS 的粗體／斜體／刪除線；不讀取外部樣式表。字型、顏色、版面與表格結構不保留。
- 圖片預設只留下替代文字；啟用後保留圖片網址，不下載為 Joplin 附件。
- 連結清理預設移除 `utm_*`、`fbclid`、`gclid`、`dclid`、`gbraid`、`wbraid`、`msclkid`、`ttclid`、`twclid`、`igshid`、`mc_cid`、`mc_eid`、`_ga`、`_gl`、`mkt_tok`、`vero_id`、`oly_anon_id`、`oly_enc_id`。
- 可增加逗號分隔的參數名称，結尾 `*` 表示前綴；忽略大小寫。一般 `id`、`q`、`ref`、`source` 等不會預設刪除。保留剩餘參數原始編碼、順序、重複鍵及 `#fragment`。
- 不展開短網址或廣告轉址、不刪除頁面中的廣告內容，不保證移除所有追蹤。簽章網址如需完全原樣保留，可關閉清理。
- 純文字不當成 HTML 解析；既有 Markdown 不重新解析或套用格式開關。純文字模式清理文字中的 HTTP(S) 網址。
- 轉換過程離線，不傳送或記錄剪貼簿內容。原始 HTML 不放進面板 DOM 執行；腳本與嵌入物件移除，連結只允許 HTTP(S)、mailto、tel、錨點及 Joplin 資源連結。
- 使用編輯器命令插入，支援編輯器復原。面板開啟後若切換筆記，插入會拒絕，請重新按面板按鈕選定目標筆記。請使用 Markdown 編輯器；Rich Text 模式未驗證。

## 開發及驗證

```sh
npm ci
npm test
npm run dist
node --test tests/bundle.test.cjs
```

產物為 `publish/joplin.plugin.paste.jpl`。轉換測試檢查格式、CSS、URL 邊界與不安全 HTML；bundle 測試在沒有 Node 全域變數的 VM 中以模擬 Joplin API 檢查桌機與手機流程。尚未在真實 Joplin 桌機、Android 或 iOS 完成端到端測試。

裝置驗收：從瀏覽器複製包含粗斜體及追蹤連結的內容；分別驗證直接貼上／面板貼上、關閉各格式、游標／選取取代、Undo、切換筆記拒絕、純文字回退、空剪貼簿、深色主題，以及手機面板的長按貼上行為。

## API 依據

- [Joplin clipboard API（readHtml 僅桌機）](https://joplinapp.org/api/references/plugin_api/classes/joplinclipboard.html)
- [Joplin panels API（手機面板）](https://joplinapp.org/api/references/plugin_api/classes/joplinviewspanels.html)
- [Plugin manifest 平台宣告](https://joplinapp.org/help/api/references/plugin_manifest/)
- [Turndown](https://github.com/mixmark-io/turndown)

## 1.0.1 手機按鈕修正

手機改用 `dialogs.open()` 開啟「貼上 → 預覽 → 插入／複製」視窗。原版的 `panels.show()` 只啟用面板分頁，不會打開手機面板容器，造成按鈕看起來沒有反應。啟動與命令流程會輸出 `[Paste as Markdown]` 診斷 log；命令失敗會顯示錯誤訊息。測試現在驗證兩個按鈕確實呼叫 dialog open，以及取消、複製、插入、失敗後重試及筆記切換保護。仍需手機實機確認。

## 1.0.2 Android 剪貼簿診斷

貼上視窗與預覽顯示事件格式、HTML／文字字元數，區分純文字事件與沒有 paste 事件的鍵盤輸入。診斷 log 不包含剪貼簿內容。修正收到重複 input 事件時，不應在文字未變更的情況下清掉已取得的 HTML。

Android 測試請從 Firefox 選取含粗體與連結的網頁文字，複製後，在外掛輸入欄長按選「貼上」，避免「貼為純文字」或鍵盤剪貼簿歷史。請記錄診斷列及 Joplin／Firefox／Android 版本。這一版提供定位資訊，尚未確認使用者裝置上 HTML 遺失的原因。
