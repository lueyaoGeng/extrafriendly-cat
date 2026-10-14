# extrafriendly.cat

`companion.js` owns runtime orchestration, one serialized `ctx.storage` state, native menu/capability registration, timers, panel messages, chat generations and lifecycle cleanup. `state.js` owns deterministic validation, independent care transitions, cache freshness and persisted daily record selection. `weather.js` owns bounded Open-Meteo requests and interprets actual returned observations. `albums.js` and `jokes.js` are reviewed local content; `ALBUM_SOURCES.md` records album provenance. `gateway-config.js` owns the release-time free gateway origin.

`panel/` is the host-sandboxed local settings/card surface. It exchanges clone-safe messages only; it neither owns persistence nor performs network requests. Appearance/import/provider configuration uses the desktop host's purpose-bound `host:` messages; the desktop owns these settings. Other settings use the plugin's single storage object.

Panel source is `template.html`, `panel.js` and `style.css`. The build embeds script/style into the manifest-declared `index.html`, with exact CSP hashes in the source page. At installation the host replaces that policy with its SDK panel CSP and restricts requests to the installed plugin. This matches the declared-file snapshot without adding a resource-copy pathway or renderer authority.

`build.mjs` emits readable self-contained `index.js` for the existing data-URL plugin runtime. `test.js` exercises the shipped bundle using the SDK mock, plus pure state/forecast behavior. `openpets.plugin.json` declares permissions, exact network hosts and the home panel; `locales/` resolves manifest labels.

`chat-protocol.js` bounds free-gateway UTF-8 messages, retained history and JSON request sizes. It preserves the latest user turn and sends no untrusted client system prompt. Care uses one rearmed host `schedule.once` slot because the current recurring-schedule API has a ten-minute minimum.

`api-guide.js` owns reviewed provider instructions and an explicit official-link allowlist. `quota-notice.js` owns bounded quota parsing, freshness, user wording and per-period escalation decisions. The companion's existing state stores `apiGuideSeen`, `freeQuota` and `lastApiNotice`; the panel renders these snapshots and its independent reminder switch. First-use guidance is shown once, including the 0.1 upgrade; a manual API route remains available. Software notices never enter AI conversation history or select a personal provider automatically.
