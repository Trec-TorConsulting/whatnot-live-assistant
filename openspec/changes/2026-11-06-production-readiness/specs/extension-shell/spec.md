# Extension shell

## Purpose
The Chrome extension named Whatnot Assistant loads on Whatnot, opens a side panel, and keeps credentials on this browser profile. It does not ship a popup or a Whatnot login.

## Requirements

### Requirement: Manifest identity
The extension SHALL be Manifest V3, named Whatnot Assistant, with its version taken from package.json. The toolbar action SHALL have no popup and SHALL open the side panel when the action click behavior is set.

#### Scenario: Toolbar click
- **WHEN** the user clicks the toolbar icon and Chrome accepted open-on-action-click
- **THEN** the side panel opens

### Requirement: Permissions and hosts
The extension SHALL request storage, alarms, side panel, notifications, active tab, and scripting. It SHALL declare explicit host permissions for Whatnot, Gemini, gold-api.com, PCGS, Scryfall, Pokémon TCG, YGOPRODeck, PSA, Discogs, Greysheet, eBay, and NumisMedia, plus loopback HTTP for a local Ollama server.
The manifest SHALL NOT contain broad wildcard optional host permissions such as `http://*:*/*` or `https://*:*/*`.
Saving a key for OpenAI, Anthropic, or OpenRouter SHALL require an optional host permission matching that specific provider origin. Any non-loopback Ollama origin SHALL require an optional host permission for that specific origin granted at runtime from Settings.

#### Scenario: Loopback Ollama
- **WHEN** the user saves an Ollama URL on localhost or 127.0.0.1
- **THEN** no extra host permission is requested

#### Scenario: Remote Ollama denied
- **WHEN** the user saves a non-loopback Ollama URL and denies the permission prompt
- **THEN** the settings are not saved

#### Scenario: Backup provider denied
- **WHEN** the user saves an OpenAI, Anthropic, or OpenRouter key and denies the permission prompt
- **THEN** the settings are not saved

### Requirement: Service worker session persistence
The background service worker SHALL store transient concurrency locks, active background job tokens, and debounced network timestamps in `chrome.storage.session`. When the service worker wakes from an idle termination, it SHALL rehydrate its state from `chrome.storage.session` without losing active task progress.

#### Scenario: Worker idle wakeup
- **WHEN** the background service worker terminates due to 30 seconds of inactivity and is woken by an incoming alarm or message
- **THEN** it reads existing active locks and state from session storage and continues execution without deadlock

### Requirement: Shortcuts
The extension SHALL suggest Alt+Shift+A to show or hide the on-page assistant, Alt+Shift+S to start or stop Auto Share, and Alt+Shift+V to appraise the item on screen. Share and appraise SHALL use the active tab of the last focused window.

#### Scenario: Appraise with no tab
- **WHEN** Alt+Shift+V runs and there is no active tab id
- **THEN** the command returns without sending an appraisal

### Requirement: Content scripts
On https://*.whatnot.com/*, the extension SHALL install a main-world page hook at document start and an isolated content script at document idle. The isolated script SHALL do nothing inside an iframe. On install or update it SHALL re-inject the isolated script into open Whatnot tabs that do not answer a ping, and SHALL NOT re-inject the main-world hook that way.

#### Scenario: Iframe
- **WHEN** the isolated content script loads in a frame that is not the top window
- **THEN** it returns without starting features

### Requirement: On-page assistant
The on-page assistant SHALL mount only while the top page path is a live show, and SHALL unmount and stop local share after the path leaves that show. It SHALL be hidden when overlay prefs say so, except while a notice is showing. A user-requested appraisal SHALL reveal it. An automatic appraisal SHALL leave it hidden.

#### Scenario: Leave the show
- **WHEN** the page navigates off the live path
- **THEN** the on-page assistant is removed within about one second

