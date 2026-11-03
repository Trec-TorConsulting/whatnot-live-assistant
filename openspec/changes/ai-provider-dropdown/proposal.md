# Proposal

## Why

Appraisal failed because every cheap Gemini model returned overloaded: six tries across `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`, and `gemini-2.5-flash` in 30 seconds. Settings stores one cloud key, so a live lot has no other vision model to ask. A dropdown of popular providers that take an API key lets a second saved key answer that same click.

## What Changes

- Settings gains a cloud-provider dropdown: Gemini, OpenAI, Anthropic, and OpenRouter. Choosing one shows that provider's key and optional model. Saving writes that provider and leaves the other saved keys in place. The choice is which provider is preferred and which key is on screen, not a switch that forgets the rest.
- A blank model still means automatic. Gemini's automatic list adds `gemini-3.5-flash-lite` ahead of `gemini-2.5-flash`, because Google is limiting 2.5 capacity and 3.5 Flash-Lite is the same price band as 2.5 Flash. The other providers each have their own cheapest vision model, then one fallback.
- Appraisal order stays on-device first. Cloud providers that have a key run next, preferred provider first. Another saved provider starts if the preferred one fails or has not answered within about five seconds, inside the same deadline. The first good answer wins. Ollama still starts on that same hedge when it is configured.
- A Gemini-only setup keeps today's path, plus the extra Gemini model in the race. An existing Gemini key still loads with Gemini selected.
- The version moves from 0.12.3 to 0.13.0 because this is a requested feature.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `settings-and-overrides`: Appraisal save stores one key and optional model per dropdown provider, and tests the provider on screen.
- `appraisal`: Model order covers the preferred provider, saved backups, and Gemini's added automatic model.
- `extension-shell`: OpenAI, Anthropic, and OpenRouter are optional hosts, and their keys stay in local storage with the Gemini key.

## Impact

- `src/sidepanel/index.html` and `src/sidepanel/sections/settings.ts` replace the single Gemini key and model fields with the dropdown. `src/shared/storage.ts` keeps `geminiApiKey` and adds the other providers. `src/background/appraisal.ts` sends the same appraisal instructions and schema to the provider that is actually called. `manifest.config.ts` keeps Gemini's host permission and asks for the other origins only when that provider's key is saved.
- Time-to-answer on a fast Gemini reply stays a few seconds, and the backup is not called. When Gemini is overloaded, a saved backup starts at about five seconds instead of the click dying at 30 seconds. The answer is still an identification plus a labeled estimate. The card names the model that answered. No new sale or melt source is added.
- Branch `ai-provider-dropdown`, opened as a pull request into `main`, then merged with `gh pr merge --admin`.

## Out of scope

- Groq, xAI, Mistral, Together, Fireworks, or a provider the user types in. Those need their own request shapes and are not in this dropdown.
- A combined token bill across providers. The answering model name is enough.
- Changing PCGS, PSA, Discogs, the bid guard, or the phone userscript.
- Placing a bid, entering a giveaway, or inventing a certification number.
