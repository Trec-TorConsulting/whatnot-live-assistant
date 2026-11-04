// ==UserScript==
// @name         Whatnot Auto Share (iPhone)
// @namespace    whatnot-assistant
// @version      0.16.0
// @description  Keeps Whatnot's Share menu open on a live show and taps Copy link on your delay.
// @match        https://www.whatnot.com/*
// @match        https://whatnot.com/*
// @run-at       document-start
// @inject-into  page
// @noframes
// @grant        none
// ==/UserScript==
//
// iPhone setup (once):
//   1. Install "Userscripts" from the App Store, open it, and pick a folder for scripts.
//   2. Put this file in that folder (AirDrop it to the phone and save to Files, or use iCloud Drive).
//   3. Settings > Apps > Safari > Extensions > Userscripts: turn it on and allow whatnot.com.
// Each show:
//   4. Open whatnot.com in Safari and tap aA > Request Desktop Website (otherwise Whatnot shows phones
//      a "Continue on Whatnot" app screen instead of the show). Log in, then open the show.
//   5. Tap "Start sharing" on the Auto Share panel. Keep Safari open on the show; switching apps or
//      locking the phone pauses it. "Confirmed" counts the shares Whatnot recorded.

(function() {
	// src/content/dom.ts
	var normalize = (s) => (s ?? "").replace(/\s+/g, " ").trim();
	var textOf = (el) => normalize(el.innerText || el.textContent);
	var isVisible = (el) => {
		if (!(el instanceof HTMLElement) || !el.isConnected) return false;
		const rect = el.getBoundingClientRect();
		if (rect.width < 6 || rect.height < 6) return false;
		const style = getComputedStyle(el);
		return style.display !== "none" && style.visibility !== "hidden" && parseFloat(style.opacity || "1") > .05;
	};
	var waitFor = (find, timeoutMs) => new Promise((resolve) => {
		const initial = find();
		if (initial) {
			resolve(initial);
			return;
		}
		let done = false;
		let queued = false;
		const finish = (value) => {
			if (done) return;
			done = true;
			observer.disconnect();
			clearTimeout(timer);
			resolve(value);
		};
		const observer = new MutationObserver(() => {
			if (queued) return;
			queued = true;
			queueMicrotask(() => {
				queued = false;
				const found = find();
				if (found) finish(found);
			});
		});
		observer.observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true
		});
		const timer = setTimeout(() => finish(find() || null), timeoutMs);
	});
	var clickLikeUser = (el) => {
		const rect = el.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const init = {
			bubbles: true,
			cancelable: true,
			composed: true,
			view: window,
			clientX: x,
			clientY: y,
			button: 0,
			buttons: 1,
			pointerId: 1,
			pointerType: "mouse",
			isPrimary: true
		};
		el.dispatchEvent(new PointerEvent("pointerdown", init));
		el.dispatchEvent(new MouseEvent("mousedown", init));
		el.dispatchEvent(new PointerEvent("pointerup", {
			...init,
			buttons: 0
		}));
		el.dispatchEvent(new MouseEvent("mouseup", {
			...init,
			buttons: 0
		}));
		el.click();
	};
	// src/shared/time.ts
	var SECOND = 1e3;
	var randomBetween = ({ min, max }, rand = Math.random) => Math.round(min + rand() * Math.max(0, max - min));
	// src/content/overridesState.ts
	var current = {};
	var overrides = () => current;
	// src/content/selectors.ts
	var BUTTONS = "button, [role=\"button\"]";
	var DIALOGS = "dialog[open], [role=\"dialog\"], [role=\"alertdialog\"], [aria-modal=\"true\"]";
	var labelOf = (el) => normalize([
		textOf(el),
		el.getAttribute("aria-label"),
		el.getAttribute("title"),
		...Array.from(el.querySelectorAll("[aria-label]"), (n) => n.getAttribute("aria-label")),
		...Array.from(el.querySelectorAll("svg title"), (n) => n.textContent)
	].join(" "));
	var liveIdFromHref = (href) => href?.match(/\/live\/([^/?#]+)/)?.[1] ?? null;
	var SHARE_TARGETS = {
		copy: {
			selectors: ["[data-testid=\"share-copy-link-button\"]"],
			hrefs: [],
			labels: [/^copy\s*link$/i, /copy\s*(link|url)/i]
		},
		x: {
			selectors: [],
			hrefs: ["x.com/intent", "twitter.com/intent"],
			labels: [/^(x|twitter)$/i]
		},
		facebook: {
			selectors: ["[data-testid=\"share-facebook-link\"]"],
			hrefs: ["facebook.com/sharer"],
			labels: [/^facebook$/i]
		}
	};
	var NOT_A_SHARE_TARGET = /continue with|log ?in|sign ?(in|up)|oauth/i;
	var findShareButton = () => {
		const custom = overrides().shareButton;
		for (const sel of [
			custom,
			"[data-testid=\"show-share-button\"]",
			"button[aria-label=\"Share\" i]"
		].filter(Boolean)) {
			const el = Array.from(document.querySelectorAll(sel)).find(isVisible);
			if (el) return el;
		}
		return Array.from(document.querySelectorAll(BUTTONS)).find((el) => isVisible(el) && /^share$/i.test(labelOf(el))) ?? null;
	};
	var findShareTarget = (target) => {
		const spec = SHARE_TARGETS[target];
		const custom = overrides().shareTargets?.[target];
		const ok = (el) => isVisible(el) && !NOT_A_SHARE_TARGET.test(`${labelOf(el)} ${el.getAttribute("href") ?? ""}`);
		for (const sel of [custom, ...spec.selectors].filter(Boolean)) {
			const el = Array.from(document.querySelectorAll(sel)).find(ok);
			if (el) return el;
		}
		for (const href of spec.hrefs) {
			const el = Array.from(document.querySelectorAll(`a[href*="${href}"]`)).find(ok);
			if (el) return el;
		}
		const candidates = Array.from(document.querySelectorAll(`${BUTTONS}, a, [role="menuitem"]`)).filter(ok);
		for (const re of spec.labels) {
			const el = candidates.find((c) => {
				const label = labelOf(c);
				return label.length <= 32 && re.test(label);
			});
			if (el) return el;
		}
		return null;
	};
	var findAppBlock = () => Array.from(document.querySelectorAll("[data-testid*=\"mobile-block\" i]")).some(isVisible);
	var isLivePath = (path = location.pathname) => /^\/live\/[^/]+/i.test(path);
	var liveIdFromPath = (path = location.pathname) => liveIdFromHref(path);
	// src/content/warnings.ts
	var WARNING_RE = /too many (requests|actions|attempts)|slow down|try again later|rate.?limit|temporarily (blocked|restricted|limited|unavailable)|unusual activity|suspicious activity|verify (that )?you.?re (a )?human|are you a robot|captcha|account (has been |is )?(suspended|restricted|limited|banned)|action blocked/i;
	var SURFACES = [
		DIALOGS,
		"[role=\"alert\"]",
		"[role=\"status\"]",
		"[aria-live=\"assertive\"]",
		"[aria-live=\"polite\"]",
		"[class*=\"toast\" i]",
		"[class*=\"snackbar\" i]"
	].join(", ");
	var CHALLENGE_FRAMES = "iframe[src*=\"captcha\" i], iframe[src*=\"challenge\" i], iframe[title*=\"captcha\" i], iframe[title*=\"challenge\" i]";
	var LOGIN_RE = /\b(log ?in|sign ?in|sign ?up|create an account|continue with (google|apple|email|phone))\b/i;
	var findWarning = () => {
		for (const frame of document.querySelectorAll(CHALLENGE_FRAMES)) {
			if (!isVisible(frame)) continue;
			const { width, height } = frame.getBoundingClientRect();
			if (width >= 200 && height >= 200) return "Human verification challenge";
		}
		const custom = overrides().warningPattern;
		const patterns = custom ? [WARNING_RE, new RegExp(custom, "i")] : [WARNING_RE];
		for (const el of document.querySelectorAll(SURFACES)) {
			if (!isVisible(el)) continue;
			const text = textOf(el);
			const match = patterns.map((re) => text.match(re)).find(Boolean);
			if (match) {
				const start = Math.max(0, (match.index ?? 0) - 40);
				return text.slice(start, start + 140).trim();
			}
		}
		return null;
	};
	var findLoginPrompt = () => {
		for (const el of document.querySelectorAll(DIALOGS)) if (isVisible(el) && LOGIN_RE.test(textOf(el))) return true;
		return false;
	};
	// src/page/quiet.ts
	var installQuietPatches = (quiet) => {
		const clipboard = navigator.clipboard;
		if (clipboard && typeof clipboard.writeText === "function") {
			const writeText = clipboard.writeText.bind(clipboard);
			clipboard.writeText = (text) => quiet() ? Promise.resolve() : writeText(text);
		}
		if (typeof document.execCommand === "function") {
			const execCommand = document.execCommand.bind(document);
			document.execCommand = (command, showUI, value) => quiet() && command.toLowerCase() === "copy" ? true : execCommand(command, showUI, value);
		}
		const open = window.open.bind(window);
		window.open = (...args) => quiet() ? null : open(...args);
		document.addEventListener("click", (e) => {
			if (!quiet()) return;
			if (e.target?.closest?.("a[target=\"_blank\"]")) e.preventDefault();
		}, true);
	};
	// src/userscript/logShare.ts
	var operationFromBody = (init) => {
		if (typeof init?.body !== "string") return null;
		try {
			const name = JSON.parse(init.body).operationName;
			return typeof name === "string" ? name : null;
		} catch {
			return null;
		}
	};
	var isLogShareUrl = (url, base = location.href, init) => {
		if (!url.includes("/services/graphql")) return false;
		try {
			return (new URL(url, base).searchParams.get("operationName") || operationFromBody(init)) === "LogShare";
		} catch {
			return operationFromBody(init) === "LogShare";
		}
	};
	var logShareSucceeded = (body) => {
		const b = body;
		return Boolean(b && typeof b === "object" && !(Array.isArray(b.errors) && b.errors.length > 0));
	};
	var watchLogShare = (onShare) => {
		const nativeFetch = window.fetch;
		window.fetch = async (input, init) => {
			const res = await nativeFetch.call(window, input, init);
			try {
				const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
				if (res.ok && isLogShareUrl(url, location.href, init)) res.clone().json().then((body) => logShareSucceeded(body) && onShare()).catch(() => void 0);
			} catch {}
			return res;
		};
	};
	// src/userscript/loop.ts
	var TARGET_LABEL = {
		copy: "Copy link",
		x: "X",
		facebook: "Facebook"
	};
	var PAGE_READY_MS = 30 * SECOND;
	var MENU_OPEN_MS = 5 * SECOND;
	var QUIET_MS = 5 * SECOND;
	var APP_BLOCK_MESSAGE = "Whatnot is showing its app screen instead of the show. Tap aA › Request Desktop Website, then log in.";
	var describeRun = (target, sent, confirmed) => `Sharing via ${TARGET_LABEL[target]}: ${sent} sent, ${confirmed} confirmed by Whatnot`;
	var createShareLoop = (deps, onStatus) => {
		let generation = 0;
		let wake = null;
		let status = {
			running: false,
			sent: 0,
			confirmed: 0,
			message: "Ready"
		};
		const emit = (patch) => {
			status = {
				...status,
				...patch
			};
			onStatus(status);
		};
		const pause = (ms) => new Promise((resolve) => {
			const done = () => {
				clearTimeout(timer);
				if (wake === done) wake = null;
				resolve();
			};
			const timer = setTimeout(done, Math.max(0, ms));
			wake = done;
		});
		const end = (gen, message) => {
			if (gen !== generation) return;
			generation += 1;
			emit({
				running: false,
				message
			});
		};
		const openMenu = async (target) => {
			const existing = deps.findShareTarget(target);
			if (existing) return existing;
			const button = deps.findShareButton();
			if (!button) return null;
			deps.click(button);
			return deps.waitFor(() => deps.findShareTarget(target), MENU_OPEN_MS);
		};
		const run = async (gen) => {
			const first = deps.settings().target;
			await deps.waitFor(() => deps.findShareButton() || deps.findShareTarget(first) || deps.findLoginPrompt() || deps.findAppBlock(), PAGE_READY_MS);
			while (gen === generation) {
				if (!deps.onLivePage()) return end(gen, `Stopped: you left the show. ${status.sent} sent.`);
				if (deps.findAppBlock()) return end(gen, APP_BLOCK_MESSAGE);
				const warning = deps.findWarning();
				if (warning) return end(gen, `Stopped: Whatnot showed a warning (“${warning}”). ${status.sent} sent.`);
				if (deps.findLoginPrompt()) return end(gen, "Stopped: log in to Whatnot in Safari first.");
				const { target, quiet, delaySec } = deps.settings();
				if (quiet) deps.setQuiet(QUIET_MS);
				const option = await openMenu(target);
				if (gen !== generation) return;
				if (!option) return end(gen, deps.findShareButton() ? `Stopped: ${TARGET_LABEL[target]} wasn't in the Share menu.` : "Stopped: couldn't find the Share button on this page.");
				await pause(randomBetween({
					min: 100,
					max: 300
				}));
				if (gen !== generation) return;
				deps.click(option);
				emit({
					sent: status.sent + 1,
					message: describeRun(target, status.sent + 1, status.confirmed)
				});
				await pause(delaySec * SECOND);
			}
		};
		return {
			status: () => status,
			start: () => {
				if (status.running) return;
				const gen = ++generation;
				emit({
					running: true,
					sent: 0,
					confirmed: 0,
					message: "Looking for the Share button…"
				});
				return run(gen).catch((err) => end(gen, `Stopped: ${String(err?.message ?? err)}`));
			},
			stop: (message = "Stopped") => {
				if (!status.running) return;
				generation += 1;
				wake?.();
				emit({
					running: false,
					message: `${message}. ${status.sent} sent, ${status.confirmed} confirmed.`
				});
			},
			confirm: () => {
				if (!status.running) return;
				const confirmed = status.confirmed + 1;
				emit({
					confirmed,
					message: describeRun(deps.settings().target, status.sent, confirmed)
				});
			}
		};
	};
	// src/userscript/settings.ts
	var DELAY_FLOOR_SEC = .5;
	var DEFAULT_PHONE_SETTINGS = {
		target: "copy",
		delaySec: 3,
		quiet: true,
		pos: {
			x: .96,
			y: .7
		}
	};
	var KEY = "wn2-phone-share";
	var TARGETS = [
		"copy",
		"x",
		"facebook"
	];
	var fraction = (v, fallback) => typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
	var sanitizePhoneSettings = (input) => {
		const s = input && typeof input === "object" ? input : {};
		const d = DEFAULT_PHONE_SETTINGS;
		const delay = typeof s.delaySec === "number" && Number.isFinite(s.delaySec) ? s.delaySec : d.delaySec;
		return {
			target: TARGETS.includes(s.target) ? s.target : d.target,
			delaySec: Math.round(Math.min(120, Math.max(DELAY_FLOOR_SEC, delay)) * 10) / 10,
			quiet: typeof s.quiet === "boolean" ? s.quiet : d.quiet,
			pos: {
				x: fraction(s.pos?.x, d.pos.x),
				y: fraction(s.pos?.y, d.pos.y)
			}
		};
	};
	var loadPhoneSettings = (storage = localStorage) => {
		try {
			return sanitizePhoneSettings(JSON.parse(storage.getItem(KEY) ?? "null"));
		} catch {
			return sanitizePhoneSettings(null);
		}
	};
	var savePhoneSettings = (settings, storage = localStorage) => {
		const clean = sanitizePhoneSettings(settings);
		try {
			storage.setItem(KEY, JSON.stringify(clean));
		} catch {}
		return clean;
	};
	// src/userscript/panel.ts
	var HOST_ID = "wn2-phone-share";
	var DRAG_SLOP_PX = 6;
	var panelScale = (layoutWidth, screenWidth) => screenWidth > 0 ? Math.min(3, Math.max(1, layoutWidth / screenWidth)) : 1;
	var isModal = (d) => {
		try {
			return d.matches(":modal");
		} catch {
			return false;
		}
	};
	var topModalDialog = () => Array.from(document.querySelectorAll("dialog[open]")).filter(isModal).pop() ?? null;
	var STYLE = `
  :host { all: initial; }
  .wrap {
    position: fixed; z-index: 2147483647; left: 0; top: 0; transform-origin: top left;
    font: 500 14px/1.35 -apple-system, system-ui, sans-serif; color: #f9fafb;
    -webkit-user-select: none; user-select: none; touch-action: none;
  }
  .card {
    width: 240px; padding: 10px 12px 12px; border-radius: 14px;
    background: rgba(17, 24, 39, 0.94); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: grab; }
  .title { flex: 1; font-weight: 700; }
  .ver { color: #9ca3af; font-size: 11px; font-weight: 500; }
  .icon { border: 0; background: #374151; color: #f9fafb; border-radius: 8px; width: 32px; height: 28px; font-size: 16px; }
  button, input, select { font-family: inherit; }
  .go { width: 100%; height: 48px; border: 0; border-radius: 10px; font-size: 17px; font-weight: 700; background: #fde047; color: #111827; }
  .go.on { background: #ef4444; color: #fff; }
  .status { margin: 8px 0 10px; min-height: 2.7em; color: #d1d5db; font-size: 13px; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; }
  input[type=number], select {
    font-size: 16px; color: #111827; background: #f9fafb; border: 0; border-radius: 8px;
    padding: 6px 8px; width: 120px; box-sizing: border-box;
  }
  input[type=checkbox] { width: 22px; height: 22px; }
  .hint { color: #9ca3af; font-size: 11px; margin-top: 8px; }
  .pill {
    display: none; min-width: 56px; height: 44px; padding: 0 14px; border: 0; border-radius: 22px;
    font-size: 15px; font-weight: 700; background: #fde047; color: #111827; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  }
  .pill.on { background: #ef4444; color: #fff; }
  .wrap.min .card { display: none; }
  .wrap.min .pill { display: block; }
`;
	var createPanel = (opts) => {
		const host = document.createElement("div");
		host.id = HOST_ID;
		const root = host.attachShadow({ mode: "closed" });
		const targets = Object.keys(TARGET_LABEL).map((t) => `<option value="${t}">${TARGET_LABEL[t]}</option>`).join("");
		root.innerHTML = `
    <style>${STYLE}</style>
    <div class="wrap">
      <div class="card">
        <div class="head" data-drag>
          <span class="title">Auto Share <span class="ver">v${opts.version}</span></span>
          <button class="icon" data-min aria-label="Minimize">–</button>
        </div>
        <button class="go" data-go>Start sharing</button>
        <div class="status" data-status>Ready</div>
        <label>Delay (seconds)
          <input type="number" data-delay inputmode="decimal" min="${DELAY_FLOOR_SEC}" max="120" step="0.5">
        </label>
        <label>Share via <select data-target>${targets}</select></label>
        <label>Keep my clipboard <input type="checkbox" data-quiet></label>
        <div class="hint">Keep Safari open on this show with the screen on. Drag the title to move.</div>
      </div>
      <button class="pill" data-pill data-drag>Share</button>
    </div>`;
		const $ = (sel) => root.querySelector(sel);
		const wrap = $(".wrap");
		const go = $("[data-go]");
		const pill = $("[data-pill]");
		const statusEl = $("[data-status]");
		const delay = $("[data-delay]");
		const target = $("[data-target]");
		const quiet = $("[data-quiet]");
		const syncInputs = () => {
			const s = opts.settings();
			delay.value = String(s.delaySec);
			target.value = s.target;
			quiet.checked = s.quiet;
		};
		let scale = 1;
		const place = () => {
			scale = panelScale(window.innerWidth, window.screen?.width ?? window.innerWidth);
			wrap.style.transform = `scale(${scale})`;
			const rect = wrap.getBoundingClientRect();
			const { pos } = opts.settings();
			const left = Math.max(0, (window.innerWidth - rect.width) * pos.x);
			const top = Math.max(0, (window.innerHeight - rect.height) * pos.y);
			wrap.style.left = `${left}px`;
			wrap.style.top = `${top}px`;
		};
		let drag = null;
		wrap.addEventListener("pointerdown", (e) => {
			if (!e.target.closest("[data-drag]") || e.target.closest("[data-min]")) return;
			const rect = wrap.getBoundingClientRect();
			drag = {
				id: e.pointerId,
				dx: e.clientX - rect.left,
				dy: e.clientY - rect.top,
				x0: e.clientX,
				y0: e.clientY,
				moved: false
			};
			wrap.setPointerCapture?.(e.pointerId);
		});
		wrap.addEventListener("pointermove", (e) => {
			if (!drag || e.pointerId !== drag.id) return;
			if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_SLOP_PX) return;
			drag.moved = true;
			e.preventDefault();
			const rect = wrap.getBoundingClientRect();
			const left = Math.min(Math.max(0, e.clientX - drag.dx), window.innerWidth - rect.width);
			const top = Math.min(Math.max(0, e.clientY - drag.dy), window.innerHeight - rect.height);
			wrap.style.left = `${left}px`;
			wrap.style.top = `${top}px`;
		});
		const endDrag = (e) => {
			if (!drag || e.pointerId !== drag.id) return;
			const moved = drag.moved;
			drag = null;
			if (!moved) return;
			const rect = wrap.getBoundingClientRect();
			const spanX = Math.max(1, window.innerWidth - rect.width);
			const spanY = Math.max(1, window.innerHeight - rect.height);
			opts.onSettings({ pos: {
				x: rect.left / spanX,
				y: rect.top / spanY
			} });
			suppressClick = true;
		};
		let suppressClick = false;
		wrap.addEventListener("pointerup", endDrag);
		wrap.addEventListener("pointercancel", endDrag);
		const minimize = (min) => {
			wrap.classList.toggle("min", min);
			place();
		};
		$("[data-min]").addEventListener("click", () => minimize(true));
		pill.addEventListener("click", () => {
			if (suppressClick) {
				suppressClick = false;
				return;
			}
			minimize(false);
		});
		root.querySelector(".head").addEventListener("click", () => {
			suppressClick = false;
		});
		go.addEventListener("click", () => opts.onToggle());
		delay.addEventListener("change", () => {
			opts.onSettings({ delaySec: Number(delay.value) });
			syncInputs();
		});
		target.addEventListener("change", () => opts.onSettings({ target: target.value }));
		quiet.addEventListener("change", () => opts.onSettings({ quiet: quiet.checked }));
		window.addEventListener("resize", place);
		window.visualViewport?.addEventListener("resize", place);
		for (const type of [
			"pointerdown",
			"pointerup",
			"mousedown",
			"mouseup",
			"touchstart",
			"touchend",
			"click"
		]) host.addEventListener(type, (e) => e.stopPropagation());
		syncInputs();
		let wanted = false;
		const dock = () => {
			if (!wanted) return;
			const parent = topModalDialog() ?? document.documentElement;
			if (host.parentNode === parent) return;
			const fresh = !host.isConnected;
			parent.appendChild(host);
			if (fresh) place();
		};
		return {
			element: host,
			show: () => {
				wanted = true;
				dock();
			},
			hide: () => {
				wanted = false;
				host.remove();
			},
			dock,
			setStatus: (s) => {
				go.textContent = s.running ? "Stop" : "Start sharing";
				go.classList.toggle("on", s.running);
				pill.classList.toggle("on", s.running);
				pill.textContent = s.running ? `■ ${s.sent}` : "Share";
				statusEl.textContent = s.message;
			},
			controls: {
				go,
				pill,
				delay,
				target,
				quiet,
				status: statusEl
			}
		};
	};
	// src/userscript/main.ts
	var install = () => {
		if (window.__wn2PhoneShare || window.top !== window) return;
		window.__wn2PhoneShare = true;
		let settings = loadPhoneSettings();
		let quietUntil = 0;
		let liveAtStart = null;
		installQuietPatches(() => Date.now() < quietUntil);
		let wakeLock = null;
		const keepAwake = async (on) => {
			if (!on) {
				await wakeLock?.release().catch(() => void 0);
				wakeLock = null;
				return;
			}
			if (wakeLock && !wakeLock.released) return;
			wakeLock = await navigator.wakeLock?.request("screen").catch(() => null) ?? null;
		};
		const panel = createPanel({
			version: "0.16.0",
			settings: () => settings,
			onToggle: () => toggle(),
			onSettings: (patch) => {
				settings = savePhoneSettings({
					...settings,
					...patch
				});
			}
		});
		const loop = createShareLoop({
			findShareButton,
			findShareTarget,
			findWarning,
			findLoginPrompt,
			findAppBlock,
			onLivePage: () => isLivePath() && liveIdFromPath() === liveAtStart,
			click: clickLikeUser,
			waitFor,
			setQuiet: (ms) => {
				quietUntil = Date.now() + ms;
			},
			settings: () => settings
		}, (status) => {
			panel.setStatus(status);
			if (!status.running) keepAwake(false);
		});
		watchLogShare(() => loop.confirm());
		const toggle = () => {
			if (loop.status().running) {
				loop.stop();
				return;
			}
			liveAtStart = liveIdFromPath();
			keepAwake(true);
			loop.start();
		};
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible" && loop.status().running) keepAwake(true);
		});
		const syncRoute = () => {
			if (!document.body) return;
			if (isLivePath()) {
				panel.show();
				if (!loop.status().running && findAppBlock()) panel.setStatus({
					...loop.status(),
					message: APP_BLOCK_MESSAGE
				});
			} else {
				loop.stop("Stopped: you left the show");
				panel.hide();
			}
		};
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncRoute, { once: true });
		else syncRoute();
		setInterval(syncRoute, SECOND);
		let dockQueued = false;
		new MutationObserver(() => {
			if (dockQueued) return;
			dockQueued = true;
			setTimeout(() => {
				dockQueued = false;
				panel.dock();
			}, 50);
		}).observe(document.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["open"]
		});
	};
	install();
})();
