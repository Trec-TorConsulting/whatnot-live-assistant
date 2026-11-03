# Tasks

## 1. Branch

- [x] 1.1 Create branch `ai-provider-dropdown` from main and verify `git status` shows that branch. Leave tokens, .env files, and Chrome profiles out of every commit.

## 2. Provider dropdown

- [x] 2.1 Add `preferredProvider` and the OpenAI, Anthropic, and OpenRouter key and model fields to `AppraisalSettings` in `src/shared/storage.ts`. A missing `preferredProvider` reads as `gemini`, and `geminiApiKey` stays. Verify a vitest that loads settings with only a Gemini key and reads Gemini as preferred, and that a stored OpenAI key is still present.
- [x] 2.2 Replace the Gemini key and model inputs in `src/sidepanel/index.html` and `src/sidepanel/sections/settings.ts` with a dropdown of Gemini, OpenAI, Anthropic, and OpenRouter, one password field, and one model field. Switching the dropdown shows that provider's saved values. Save writes the provider on screen and leaves the other keys. Clearing the key clears only that provider. Test saves first, then tests the provider on screen. Verify a vitest that the four choices render, saving an OpenAI key and then saving Gemini keeps the OpenAI key, and an existing Gemini-only profile shows Gemini and that key.
- [x] 2.3 On save of an OpenAI, Anthropic, or OpenRouter key, request that provider's origin (`https://api.openai.com/*`, `https://api.anthropic.com/*`, or `https://openrouter.ai/*`) the way a remote Ollama URL is requested. A denial saves nothing and shows which host was blocked. Gemini stays a required host in `manifest.config.ts`. Verify a vitest that a denied prompt does not call the settings write.

## 3. Appraisal failover

- [x] 3.1 In `src/background/appraisal.ts`, insert `gemini-3.5-flash-lite` before `gemini-2.5-flash` in the automatic Gemini list. Verify the existing overload test tries `gemini-3.5-flash-lite` after the two cheaper Gemini models and before `gemini-2.5-flash`.
- [x] 3.2 Add OpenAI, Anthropic, and OpenRouter calls that send the same appraisal instructions, schema, and JPEG. Blank models use `gpt-5-nano` then `gpt-5.4-nano`, `claude-haiku-5-5` then `claude-haiku-4-5`, and `openai/gpt-5-nano` then `anthropic/claude-haiku-5.5`. A typed model is tried first. Answers are named `openai:…`, `anthropic:…`, or `openrouter:…`. Verify a vitest that a scripted OpenAI JSON body becomes a successful appraisal with that model name.
- [x] 3.3 After on-device misses, run the preferred provider, or the next saved key when that key is blank. At the existing hedge, or as soon as the provider fails, start one next saved provider and Ollama when configured. A fast preferred answer does not call another cloud provider. Every saved provider overloaded through the deadline fails and names those providers. Ollama-only calls no cloud provider. `geminiJson` uses the same cloud order. Verify those cases in `src/background/appraisal.test.ts`.

## 4. Delivery

- [x] 4.1 Bump `package.json` from 0.12.3 to 0.13.0 once, run `npm test` and `npm run build`, and verify `dist/manifest.json` and `dist-userscript/whatnot-auto-share.user.js` show 0.13.0.
- [x] 4.2 Commit, push, and open a detailed pull request from `ai-provider-dropdown` into main, then merge it with `gh pr merge --admin`. The commits contain no tokens, .env files, or Chrome profiles.

## Workflow follow-up

- Archive this change only after the pull request into main is merged.
