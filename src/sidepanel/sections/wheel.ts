import { isNumberedPrize, MAX_HITS, pendingSpins, prizeKey, scopedKey, spotsLeft, wheelTitleKey, type BreakSnapshot } from '../../shared/breaks';
import { manifestFrom } from '../../shared/prizeValue';
import { envelopeSummary, numberedShare, unmatchedEnvelopes, wheelRows, type EnvelopeBoard } from '../../shared/envelopes';
import { UNUSUAL, bigHitCheck, chanceWorthWithin, nextSpinTurnsWorth, spinPrices, type StatPrize } from '../../shared/wheelStats';
import type { LiveSession } from '../../shared/live';
import { formatMoney } from '../../shared/money';
import { SOURCE_LABEL, type PrizeValue } from '../../shared/prizeValue';
import {
  getItem,
  getSession,
  getTabLive,
  liveKey,
  onItemChanged,
  onSessionKeyChanged,
  setItem,
  setSession,
  type PrizeStatus,
} from '../../shared/storage';
import { SECOND } from '../../shared/time';
import {
  emptyWheel,
  formatWheelSlots,
  hitSlot,
  parseWheelSlots,
  resetSpins,
  hitOutcome,
  prizeSlotLabel,
  undoSpin,
  wheelOdds,
  type WheelEnd,
  type WheelOdds,
  type WheelState,
} from '../../shared/wheel';
import { $, li, liveIdOfTab, numberOf, onActiveTab, setNumber } from '../ui';

const el = {
  card: $('#wheel-card'),
  summary: $('#wheel-summary'),
  slots: $('#wheel-slots'),
  setup: $<HTMLDetailsElement>('#wheel-setup'),
  price: $<HTMLInputElement>('#wheel-price'),
  input: $<HTMLTextAreaElement>('#wheel-input'),
  save: $<HTMLButtonElement>('#wheel-save'),
  note: $('#wheel-note'),
  undo: $<HTMLButtonElement>('#wheel-undo'),
  reset: $<HTMLButtonElement>('#wheel-reset'),
  help: $('#wheel-help'),
  history: $<HTMLDetailsElement>('#wheel-history'),
  historyTitle: $('#wheel-history-title'),
  hits: $('#wheel-hits'),
};

const HISTORY_SHOWN = 30;
const SIM_SPINS = [10, 25] as const;

// The simulation is cheap but the panel redraws every second; same wheel, same answer.
let forecastMemo: { key: string; value: { next: number; within: number[] } } | null = null;
const forecast = (prizes: StatPrize[], price: number) => {
  const key = `${price}|${prizes.map((p) => `${p.left}:${p.value}`).join(',')}`;
  if (forecastMemo?.key !== key) {
    forecastMemo = { key, value: { next: nextSpinTurnsWorth(prizes, price), within: SIM_SPINS.map((n) => chanceWorthWithin(prizes, price, n)) } };
  }
  return forecastMemo.value;
};

let liveId: string | null = null;
let wheel: WheelState | null = null;
let session: LiveSession | null = null;
let values: Record<string, number> = {};
let autoValues: Record<string, PrizeValue> = {};
let prizeStatus: PrizeStatus | null = null;
let envelopeStatus: PrizeStatus | null = null;
let boards: Record<string, EnvelopeBoard> = {};
let unsubscribe: (() => void) | null = null;

// Yours beats automatic; an automatic range is always valued at its low end. Values you typed
// before conditions were tracked are keyed by title alone.
const valueFor = (key: string, titleKey: string): { value: number | null; auto: PrizeValue | null } => {
  const yours = values[key] ?? values[titleKey];
  if (yours !== undefined) return { value: yours, auto: null };
  const auto = autoValues[key] ?? null;
  return { value: auto?.low ?? null, auto };
};

// A spin only names the title; when that title was listed in more than one condition, the
// cheaper one counts.
const hitValue = (b: BreakSnapshot, title: string) => {
  const t = prizeKey(title);
  const found = (b.titleKeys[t] ?? [t])
    .map((k) => valueFor(scopedKey(b.id, title, k), wheelTitleKey(b.id, title)).value)
    .filter((v): v is number => v !== null);
  return found.length ? Math.min(...found) : null;
};

const autoLabel = (v: PrizeValue) =>
  `${SOURCE_LABEL[v.source]} ${v.high !== null && v.high > v.low ? `${formatMoney(v.low)}–${formatMoney(v.high)}` : formatMoney(v.low)}`;

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / SECOND));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
};

const pct = (p: number | null) => (p === null ? '—' : `${(p * 100).toFixed(p > 0 && p < 0.1 ? 1 : 0)}%`);

const div = (className: string, textContent: string) => Object.assign(document.createElement('div'), { className, textContent });

const verdictLine = (o: WheelOdds, price: number | null, priceLabel = 'the price per spin') => {
  if (o.verdict === 'empty') return 'No spots left.';
  if (price === null) return `Set ${priceLabel} to see if it’s worth it.`;
  if (o.verdict === 'worth') return `Worth it: a spin is worth ${o.expectedIsFloor ? 'at least ' : ''}${formatMoney(o.edge)} more than it costs.`;
  if (o.verdict === 'not_worth') {
    if (o.spinsUntilWorth === null) return 'Not worth it, and it can’t become worth it: every prize left is below the price.';
    return `Not worth it yet: at least ${o.spinsUntilWorth} more cheap ${o.spinsUntilWorth === 1 ? 'hit' : 'hits'} needed.`;
  }
  return 'Unclear: put a value on the ? prizes to get a verdict.';
};

const verdictClass = (o: WheelOdds) => (o.verdict === 'worth' ? 'good small' : o.verdict === 'not_worth' ? 'bad-text small' : 'muted small');

const endText = (e: WheelEnd) =>
  [e.label, e.value !== null ? formatMoney(e.value) : 'no value yet', `${e.left} left`, `${pct(e.chance)} chance`, hitOutcome(e.loss)].filter(Boolean).join(' · ');

const endLines = (o: WheelOdds) => {
  const lines: HTMLElement[] = [];
  if (o.top) lines.push(div('small', `Top: ${endText(o.top)}`));
  if (o.floor) lines.push(div('small', `Floor: ${endText(o.floor)}`));
  else if (o.top) lines.push(div('muted small', 'Floor: same value as the top.'));
  return lines;
};

const endKind = (o: WheelOdds, index: number) => {
  if (o.top?.indexes.includes(index)) return 'top';
  if (o.floor?.indexes.includes(index)) return 'floor';
  return '';
};

// Whatnot's wheel for this show, once its prize list has loaded.
const liveWheel = (): BreakSnapshot | null => (session?.wheel && session.wheel.id === session.breakId ? session.wheel : null);

// A spin's price is its auction: the current bid, or the opening bid before anyone bids.
const spinPrice = (b: BreakSnapshot) => {
  const lot = session?.lot;
  if (!lot || lot.breakId !== b.id) return { price: null, label: 'a bid on the next spin' };
  if (lot.currentBid !== null) return { price: lot.currentBid, label: 'Current bid' };
  return { price: lot.nextBid, label: 'Opening bid' };
};

const historyComplete = (b: BreakSnapshot) =>
  Boolean(b.hits && !b.soldHasMore && b.sold !== null && b.hits.length >= Math.min(b.sold, MAX_HITS));

// How much to bid, when the wheel is likely to turn, and whether its big prizes hit as they should.
const bidAdvice = (b: BreakSnapshot, o: WheelOdds, prizes: StatPrize[], price: number | null) => {
  const lines: HTMLElement[] = [];
  const hits = b.hits ?? [];
  const sold = spinPrices(hits);
  const target = price ?? sold?.median ?? null;
  if (o.expectedValue !== null && o.expectedValue > 0) {
    lines.push(
      div(
        'small',
        `Max bid ${formatMoney(Math.floor(o.expectedValue))}: what a spin is worth${o.expectedIsFloor ? ' at least' : ''} at the low end of every value. Above that you lose on average.`,
      ),
    );
  }
  if (sold) {
    lines.push(
      div(
        'muted small',
        `Spins sold for ${sold.low === sold.high ? formatMoney(sold.low) : `${formatMoney(sold.low)}–${formatMoney(sold.high)}`} (median ${formatMoney(sold.median)}, last ${formatMoney(sold.last)}) over ${sold.count} spins.`,
      ),
    );
  }
  if (target !== null && o.verdict !== 'worth' && o.verdict !== 'empty' && o.spotsLeft > 1) {
    const f = forecast(prizes, target);
    lines.push(
      div(
        'muted small',
        `At ${formatMoney(target)} a spin: ${pct(f.next)} chance the next spin makes it worth it, ${SIM_SPINS.map((n, i) => `${pct(f.within[i]!)} within ${n}`).join(', ')}.`,
      ),
    );
    if (o.floor && o.floor.value !== null && o.spinsUntilWorth !== null && o.spinsUntilWorth > 0 && o.spinsUntilWorth <= o.floor.left) {
      lines.push(
        div(
          'muted small',
          `Getting there means hitting the floor: ${o.floor.label} (${formatMoney(o.floor.value)}, ${pct(o.floor.chance)} of the spots).`,
        ),
      );
    }
  }
  if (target !== null && historyComplete(b)) {
    const valueOf = (title: string) => hitValue(b, title) ?? 0;
    // A spin that hasn't been randomized yet hasn't taken anything off the wheel.
    const assigned = hits.filter((h) => !h.pending);
    const check = bigHitCheck(prizes, assigned, (t) => valueOf(t) > target);
    if (check && check.expected >= 1) {
      const base = `Prizes worth more than ${formatMoney(target)} hit ${check.observed} of ${check.spins} spins; a fair draw averages ${check.expected.toFixed(1)}.`;
      if (check.lowTail < UNUSUAL) {
        // Whatnot's draw itself is a uniform secrets.choice, so the likelier explanations are a
        // prize list edited mid-set or counts that don't match what's on hand.
        lines.push(
          div(
            'bad-text small',
            `${base} That few happens by luck only ${pct(check.lowTail)} of the time. Whatnot's randomizer is uniform, so check whether the prize list changed during the set.`,
          ),
        );
      } else if (check.highTail < UNUSUAL) {
        lines.push(div('muted small', `${base} A hot streak, but it doesn't change the next spin's odds.`));
      } else {
        lines.push(div('muted small', `${base} Normal for a fair draw.`));
      }
    }
    const won = assigned.reduce((s, h) => s + valueOf(h.title), 0);
    const paid = assigned.reduce((s, h) => s + (h.price ?? 0), 0);
    if (paid > 0) lines.push(div('muted small', `Spinners paid ${formatMoney(paid)} for prizes worth at least ${formatMoney(won)} at these values.`));
  }
  return lines;
};

const renderHistory = (b: BreakSnapshot | null) => {
  const hits = b?.hits ?? [];
  el.history.hidden = !b || !hits.length;
  if (!b || !hits.length) return;
  const loading = !historyComplete(b);
  el.historyTitle.textContent = `Spin history (${hits.length}${b.sold !== null && b.sold > hits.length ? ` of ${b.sold}` : ''}${loading ? ', loading…' : ''})`;
  const first = Math.max(0, hits.length - HISTORY_SHOWN);
  el.hits.replaceChildren(
    ...hits
      .slice(first)
      .map((h, i) => {
        const v = h.pending ? null : hitValue(b, h.title);
        const prize = h.pending ? 'waiting for the wheel…' : `${h.title}${v !== null ? ` (${formatMoney(v)})` : ''}`;
        return li(`#${b.soldOffset + first + i + 1} ${prize} → @${h.buyer ?? '?'}${h.price !== null ? ` for ${formatMoney(h.price)}` : ''}`);
      })
      .reverse(),
  );
};

const renderAuto = (b: BreakSnapshot) => {
  const { price, label } = spinPrice(b);
  const notes = session?.show.note?.text ?? null;
  const board = boards[b.id] ?? null;
  const rows = wheelRows(b, values, autoValues, board, notes);
  const state: WheelState = {
    ...emptyWheel(b.id, b.fetchedAt),
    price,
    slots: rows.map((r) => ({ label: prizeSlotLabel(r), total: r.left, left: r.left, value: r.value, floor: r.floor })),
  };
  const o = wheelOdds(state);
  const left = spotsLeft(b);
  const unpriced = rows.filter((r) => r.value === null).length;
  const pending = pendingSpins(b);
  // Share of the wheel's spots valued by an AI guess rather than real prices or you.
  const aiSpots = rows.filter((r) => r.auto?.source === 'ai').reduce((n, r) => n + r.left, 0);
  const sources = (['melt', 'sold', 'ai'] as const)
    .map((src) => [src, rows.filter((r) => r.auto?.source === src).length] as const)
    .filter(([, n]) => n);
  const yours = rows.filter((r) => r.value !== null && !r.auto).length;
  const valuesLine = [
    ...sources.map(([src, n]) => `${n} ${SOURCE_LABEL[src]}`),
    yours ? `${yours} yours` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const statusLine =
    prizeStatus?.state === 'running' && Date.now() - prizeStatus.at < 60 * SECOND
      ? `AI is valuing ${prizeStatus.count} prizes…`
      : prizeStatus?.state === 'failed' && unpriced
        ? `AI couldn't value prizes: ${prizeStatus.detail ?? 'unknown error'}`
        : null;
  const unreadRows = board?.items.length ? [] : unmatchedEnvelopes(b, values, autoValues);
  const envelopeUnread = unreadRows.filter((r) => !isNumberedPrize(r.title)).length;
  const numberedUnread = numberedShare(b, autoValues, notes) ? 0 : unreadRows.length - envelopeUnread;
  const cutOff = manifestFrom(b.description, notes).truncated && rows.some((r) => isNumberedPrize(r.title));
  const pool = envelopeSummary(b, values, autoValues, board);
  const envelopeLine =
    envelopeStatus?.state === 'running' && Date.now() - envelopeStatus.at < 60 * SECOND
      ? `Reading ${envelopeStatus.count} envelopes off the video…`
      : envelopeStatus?.state === 'failed' && envelopeUnread
        ? `Couldn't read the envelopes: ${envelopeStatus.detail ?? 'unknown error'}`
        : envelopeUnread
          ? `${envelopeUnread} ${envelopeUnread === 1 ? 'envelope' : 'envelopes'} not read off the video yet; it retries while the show tab is open, or type a value.`
          : numberedUnread
            ? `${numberedUnread} numbered ${numberedUnread === 1 ? 'hit is' : 'hits are'} not matched to the board yet.`
            : null;
  const boardLine =
    pool.sealed > 0
      ? [
          pool.topValue !== null ? `envelope chase ${pool.topName} ${formatMoney(pool.topValue)}` : null,
          pool.share !== null && !pool.shareIncomplete ? `sealed share ${formatMoney(pool.share)}` : 'sealed share incomplete',
          pool.average !== null && !pool.averageIncomplete
            ? `envelope average ${pool.averageIsFloor ? '≥ ' : ''}${formatMoney(pool.average)}`
            : 'envelope average incomplete',
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
  const envelopesRead = rows.some((r) => r.inside && r.auto);

  el.summary.className = `lot ${o.verdict === 'worth' ? 'worth' : o.verdict === 'not_worth' ? 'over' : ''}`;
  el.summary.replaceChildren(
    div('wheel-break', b.title ?? 'Wheel'),
    div('muted small', left !== null && b.total !== null ? `${left} of ${b.total} spots left` : `${o.spotsLeft} spots left`),
    div('big', `Worth ${o.expectedIsFloor ? '≥ ' : ''}${formatMoney(o.expectedValue)} a spin`),
    div(verdictClass(o), price !== null ? `${label} ${formatMoney(price)}. ${verdictLine(o, price)}` : verdictLine(o, price, label)),
    ...endLines(o),
    ...bidAdvice(
      b,
      o,
      rows.map((r) => ({ title: r.title, left: r.left, value: r.value ?? 0 })),
      price,
    ),
    div(
      'muted small',
      [
        o.chanceBeatPrice !== null ? `${pct(o.chanceBeatPrice)} chance to beat the price` : null,
        unpriced ? `${unpriced} unpriced (counted as $0)` : null,
        `updated ${ago(Date.now() - b.fetchedAt)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
    ...(valuesLine ? [div('muted small', `Values (low end of each range): ${valuesLine}`)] : []),
    ...(aiSpots && o.spotsLeft && aiSpots / o.spotsLeft >= 0.25
      ? [div('muted small', `${pct(aiSpots / o.spotsLeft)} of spots use AI guesses; check the big ones before a big bid.`)]
      : []),
    ...(statusLine ? [div(prizeStatus?.state === 'failed' ? 'bad-text small' : 'muted small', statusLine)] : []),
    ...(cutOff ? [div('muted small', 'The break description was cut off, so the numbered hits are only a floor.')] : []),
    ...(envelopeLine ? [div(envelopeStatus?.state === 'failed' && envelopeUnread ? 'bad-text small' : 'muted small', envelopeLine)] : []),
    ...(boardLine ? [div('muted small', boardLine)] : []),
    ...(envelopesRead ? [div('muted small', 'Envelope contents are read off the video by AI; check them against the board before a big bid.')] : []),
    ...(!b.complete ? [div('bad-text small', 'Whatnot returned only part of the prize list, so these odds are incomplete.')] : []),
    ...(left !== null && left !== o.spotsLeft
      ? [
          div(
            'muted small',
            pending && o.spotsLeft - left === pending
              ? `${pending} sold ${pending === 1 ? 'spot is' : 'spots are'} still waiting for the wheel. Each spot has the same odds either way, so these numbers still hold.`
              : `Prize counts add up to ${o.spotsLeft}, but Whatnot shows ${left} spots left. Odds use the prize counts.`,
          ),
        ]
      : []),
    // Whatnot only sells as many spots as there are prizes, so the last spot gets what's left.
    ...(o.spotsLeft === 1 && o.slots.find((s) => s.left > 0)
      ? [div('small', `Last spot: it gets the ${o.slots.find((s) => s.left > 0)!.label} for sure.`)]
      : []),
  );

  // Rebuilding the rows would drop the value you're typing.
  if (el.slots.contains(document.activeElement)) return;
  el.slots.replaceChildren(
    ...o.slots.map((s) => {
      const row = rows[s.index]!;
      const { auto } = row;
      const item = document.createElement('li');
      item.className = 'wheel-prize';
      // Your value goes in the box; an automatic one shows as the placeholder until you type over it.
      const input = Object.assign(document.createElement('input'), {
        type: 'number',
        min: '0',
        step: '0.01',
        placeholder: auto ? String(auto.low) : '$?',
        title: auto ? `Using ${autoLabel(auto)} (low end). Type your own value to override.` : 'What this prize is worth to you',
      });
      input.dataset.prize = row.key;
      if (row.titleKey) input.dataset.title = row.titleKey;
      setNumber(input, auto ? null : s.value);
      const name = Object.assign(document.createElement('span'), { className: 'name', textContent: row.detail ? `${row.title} · ${row.detail}` : row.title });
      const kind = endKind(o, s.index);
      if (kind) name.append(Object.assign(document.createElement('span'), { className: `end-tag ${kind}`, textContent: kind }));
      if (row.inside) name.append(div('small', row.fromBoard ? `On the board: ${row.inside}` : `On camera: ${row.inside}`));
      if (auto) name.append(div('muted small', `${autoLabel(auto)}${auto.note && auto.source !== 'ai' ? ` (${auto.note})` : ''}`));
      item.append(name, Object.assign(document.createElement('span'), { className: 'muted', textContent: `${s.left} · ${pct(s.chance)}` }), input);
      return item;
    }),
  );
};

const renderManual = (w: WheelState | null) => {
  if (!w || !w.slots.length) {
    el.summary.className = 'lot';
    el.summary.replaceChildren(div('muted small', 'No wheel on this show yet. It fills in by itself when the host starts one, or set one up below.'));
    el.slots.replaceChildren();
    return;
  }
  const o = wheelOdds(w);
  el.summary.className = `lot ${o.verdict === 'worth' ? 'worth' : o.verdict === 'not_worth' ? 'over' : ''}`;
  el.summary.replaceChildren(
    div('big', `${o.expectedIsFloor ? '≥ ' : ''}${formatMoney(o.expectedValue)} per spin${w.price ? ` / costs ${formatMoney(w.price)}` : ''}`),
    div(verdictClass(o), verdictLine(o, w.price)),
    div(
      'muted small',
      [`${o.spotsLeft} spots left`, o.chanceBeatPrice !== null ? `${pct(o.chanceBeatPrice)} chance to beat the price` : null].filter(Boolean).join(' · '),
    ),
    ...endLines(o),
  );
  el.slots.replaceChildren(
    ...o.slots.map((s) => {
      const item = document.createElement('li');
      const button = Object.assign(document.createElement('button'), { type: 'button', disabled: s.left <= 0 });
      button.dataset.slot = String(s.index);
      button.append(
        Object.assign(document.createElement('span'), { textContent: `${s.label} · ${s.value !== null ? formatMoney(s.value) : '?'}` }),
        Object.assign(document.createElement('span'), { className: 'muted', textContent: `${s.left}/${s.total} · ${pct(s.chance)}` }),
      );
      if (s.left <= 0) item.className = 'gone';
      item.append(button);
      return item;
    }),
  );
};

export const renderWheel = () => {
  el.card.hidden = !liveId;
  const auto = liveWheel();
  el.setup.hidden = Boolean(auto);
  el.undo.hidden = el.reset.hidden = Boolean(auto);
  el.undo.disabled = el.reset.disabled = !wheel?.spins.length;
  el.help.textContent = auto
    ? 'How Whatnot’s wheel works: after each spot’s auction ends, Whatnot picks one of the copies still on the list, every copy equally likely (Python’s secrets.choice), and that copy comes off. The spin animation is just for show. So nothing about the spot you’re bidding on is decided yet, and past hits never make a prize “due”; they only change what’s left. Prizes, counts and hits come from Whatnot and update after every spin. Values are the low end of each estimate; type your own to override, and it’s remembered by name and condition. Bid when the spin is already worth more than the bid, and never above the max bid.'
    : 'Tap a prize when the wheel lands on it. Hit prizes come off, so the odds update every spin. Waiting doesn’t improve them on average: buy when it already shows worth it.';
  renderHistory(auto);
  if (auto) renderAuto(auto);
  else renderManual(wheel);
};

const save = async (next: WheelState) => {
  wheel = next;
  renderWheel();
  const wheels = (await getSession('wheels')) ?? {};
  await setSession('wheels', { ...wheels, [next.liveId]: next });
};

const fillSetup = () => {
  setNumber(el.price, wheel?.price);
  el.input.value = wheel ? formatWheelSlots(wheel.slots) : '';
  el.setup.open = false;
  el.note.textContent = '';
};

const watchTab = async (tab: chrome.tabs.Tab | null) => {
  unsubscribe?.();
  unsubscribe = null;
  liveId = liveIdOfTab(tab);
  const tabId = liveId ? tab?.id : undefined;
  [wheel, session] = await Promise.all([
    liveId ? getSession('wheels').then((w) => w?.[liveId!] ?? null) : null,
    tabId !== undefined ? getTabLive(tabId).then((s) => s ?? null) : null,
  ]);
  if (tabId !== undefined) {
    unsubscribe = onSessionKeyChanged(liveKey(tabId), (v) => {
      session = (v as LiveSession | undefined) ?? null;
      renderWheel();
    });
  }
  fillSetup();
  renderWheel();
};

const setValue = (key: string, titleKey: string | undefined, value: number | null) => {
  const next = { ...values };
  if (value !== null && value >= 0) next[key] = value;
  else delete next[key];
  if (titleKey && titleKey !== key) delete next[titleKey];
  values = next;
  void setItem('wheelValues', next);
};

export const initWheel = async () => {
  [values, autoValues, prizeStatus, envelopeStatus, boards] = await Promise.all([
    getItem('wheelValues').then((v) => v ?? {}),
    getItem('prizeValues').then((v) => v ?? {}),
    getSession('prizeStatus').then((v) => v ?? null),
    getSession('envelopeStatus').then((v) => v ?? null),
    getItem('envelopeBoards').then((v) => v ?? {}),
  ]);
  onItemChanged('envelopeBoards', (v) => {
    boards = v ?? {};
    renderWheel();
  });
  onItemChanged('wheelValues', (v) => {
    values = v ?? {};
    renderWheel();
  });
  onItemChanged('prizeValues', (v) => {
    autoValues = v ?? {};
    renderWheel();
  });
  onSessionKeyChanged('prizeStatus', (v) => {
    prizeStatus = (v as PrizeStatus | undefined) ?? null;
    renderWheel();
  });
  onSessionKeyChanged('envelopeStatus', (v) => {
    envelopeStatus = (v as PrizeStatus | undefined) ?? null;
    renderWheel();
  });
  onActiveTab((tab) => void watchTab(tab));

  el.save.addEventListener('click', () => {
    if (!liveId) return;
    const slots = parseWheelSlots(el.input.value);
    if (!slots.length) {
      el.note.textContent = 'Add at least one prize.';
      return;
    }
    const base = wheel ?? emptyWheel(liveId);
    const samePrizes = formatWheelSlots(slots) === formatWheelSlots(base.slots);
    const next = samePrizes ? { ...base, updatedAt: Date.now() } : { ...base, slots, spins: [], updatedAt: Date.now() };
    void save({ ...next, price: numberOf(el.price) }).then(() => {
      el.note.textContent = `Saved ${slots.reduce((n, s) => n + s.total, 0)} spots.`;
      el.setup.open = false;
    });
  });
  el.slots.addEventListener('click', (e) => {
    const index = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]')?.dataset.slot;
    if (wheel && index !== undefined) void save(hitSlot(wheel, Number(index)));
  });
  el.slots.addEventListener('change', (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-prize]');
    if (input?.dataset.prize) setValue(input.dataset.prize, input.dataset.title, numberOf(input));
  });
  el.slots.addEventListener('focusout', () => setTimeout(renderWheel));
  el.undo.addEventListener('click', () => wheel && void save(undoSpin(wheel)));
  el.reset.addEventListener('click', () => wheel && void save(resetSpins(wheel)));
};
