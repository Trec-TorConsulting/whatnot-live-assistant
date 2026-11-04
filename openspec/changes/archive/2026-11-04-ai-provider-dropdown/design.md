# Design

## Context

See proposal.md for why. Appraisal already asks Chrome's on-device model, then races Gemini models in `src/background/appraisal.ts`, then hedges Ollama at about five seconds. Settings in `src/sidepanel/index.html` and `src/sidepanel/sections/settings.ts` store one Gemini key on `AppraisalSettings` in `src/shared/storage.ts`. Gemini's host is required in `manifest.config.ts`. Other Ollama origins are optional and requested on save. A fast Gemini answer stays a few seconds and does not call a backup. An overloaded Gemini pool today fails the click at the deadline.

## Goals / Non-Goals

**Goals:**

- One dropdown edits one provider at a time and leaves the other keys stored.
- The preferred provider is tried first. One other saved provider, plus Ollama when configured, starts on failure or at the existing hedge.
- Gemini's automatic list gains `gemini-3.5-flash-lite` before `gemini-2.5-flash`.
- Existing `geminiApiKey` values keep working with Gemini selected.

**Non-Goals:**

- A token total that mixes providers. Gemini usage stays the Gemini counter.
- New hosts in the required permission list.

## Decisions

1. **Keep flat fields on `AppraisalSettings`.** Add `preferredProvider` (`gemini` by default), `openaiApiKey`, `openaiModel`, `anthropicApiKey`, `anthropicModel`, `openrouterApiKey`, and `openrouterModel`. Leave `geminiApiKey`, `geminiModel`, and `resolvedModel` as they are. A missing `preferredProvider` means Gemini, so a profile saved by the current extension does not need a migration. Alternative: one map of providers. That is cleaner and would ignore the keys already stored under `geminiApiKey`.

2. **The dropdown is the editor, not the only live provider.** `src/sidepanel/index.html` replaces the Gemini key and model inputs with a select (Gemini, OpenAI, Anthropic, OpenRouter) plus one password field and one model field. Changing the select swaps those two fields from the saved settings. Save writes the provider on screen into its own fields and writes `preferredProvider`. Clearing the password clears that provider only. Test saves first, then calls a provider test for the select's current value. The same denied-permission path as Ollama aborts the save and shows a note.

3. **Optional hosts, specific origins.** On save of a non-Gemini key, request `https://api.openai.com/*`, `https://api.anthropic.com/*`, or `https://openrouter.ai/*`. Gemini stays on the required host list. The manifest already allows optional `https` origins. Do not request the wildcard. Alternative: add the three origins as required hosts. That would let the extension call them before the user has a key.

4. **One adapter per provider, same appraisal JSON.** `src/background/appraisal.ts` keeps the Gemini race and adds a call for each other provider that posts the existing instructions, schema, and JPEG. OpenAI uses `POST https://api.openai.com/v1/chat/completions` with `json_schema`, image as a data URL, automatic models `gpt-5-nano` then `gpt-5.4-nano`. Anthropic uses `POST https://api.anthropic.com/v1/messages` with the JPEG as a base64 image block, automatic models `claude-haiku-5-5` then `claude-haiku-4-5`. OpenRouter uses `POST https://openrouter.ai/api/v1/chat/completions` with a bearer key, automatic models `openai/gpt-5-nano` then `anthropic/claude-haiku-5.5`. A typed model is tried first, then that provider's automatic list, using the same overload and timeout race Gemini uses. Turn thinking down where the API allows it. The stored model name is `openai:…`, `anthropic:…`, or `openrouter:…`. Gemini's name stays bare. Alternative: send every provider through OpenRouter. That needs an OpenRouter key even when the user pasted an OpenAI key.

5. **Hedge one backup, not every saved key.** After on-device misses, start the preferred provider, or the next saved key if the preferred key is blank. At the existing hedge, or as soon as that provider fails, start the next saved provider in dropdown order and start Ollama if it is configured. If that backup fails before the deadline, start the next saved provider. Abort the losers when the first good answer arrives. A bad key on one provider does not end the click while another key remains. Text JSON (`geminiJson` and the price follow-up) uses this cloud order and Ollama, and still skips the on-device model. Wheel and table reads keep asking "a model"; they pick up the same order because they already go through that function.

6. **Gemini automatic order.** `MODELS_BY_PRICE` becomes `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`. Cheapest stays first. 3.5 Flash-Lite is the same price band as 2.5 Flash and sits on the capacity Google is steering new traffic toward.

## Risks / Trade-offs

- [A hedged OpenAI or Anthropic call is billed even if Gemini answers a second later] → Start the backup at the existing five-second hedge, not at t=0, and start only one backup at a time.
- [`claude-haiku-4-5` costs more than Haiku 5.5] → It is only the second Anthropic try, after Haiku 5.5 is overloaded, missing, or too slow.
- [gpt-5-nano or Haiku returns JSON the parser does not accept] → Reuse the existing JSON extraction. A bad parse fails that provider and lets the backup run inside the deadline.
- [OpenRouter's automatic models can be the same upstream that just failed] → Its pair is OpenAI's nano, then Anthropic's Haiku, not the Gemini id that was overloaded.
- [Denying a host permission aborts the whole save, including PCGS edits on that click] → Same as a denied Ollama URL today. The note says which host was blocked.

## Migration Plan

Ship on branch `ai-provider-dropdown` as a pull request into `main`, then merge with `gh pr merge --admin`. Bump `package.json` from 0.12.3 to 0.13.0 once. No storage rewrite: absent `preferredProvider` is Gemini, and `geminiApiKey` is unchanged. Rolling back the extension leaves the extra fields in `chrome.storage.local`; the previous build does not read them.

## Open Questions

None.
