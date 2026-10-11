// Parent mode: log real-life points, edit rewards, set the weekly challenge,
// manage the crew and back up data. Everything here sits behind the PIN.
import * as State from '../state.js';
import * as Sound from '../sound.js';
import * as R from '../rules.js';
import * as FX from '../fx.js';
import { avatarSVG } from '../avatar.js';
import { content } from '../data.js';
import { REWARD_ICONS } from '../content.js';
import { el, esc, icon, actions, go, toast, hideToast, modal, confirmBox, TYPE_ICON, TYPE_COLOR } from '../ui.js';
import { t, lang } from '../i18n.js';
import { requirePin, parentUnlocked, touchParent, choosePin, lockParent } from './pin.js';

const TABS = ['log', 'rewards', 'challenge', 'crew', 'history', 'settings'];
const TAB_ICON = { log: 'star', rewards: 'gift', challenge: 'flag', crew: 'crew', history: 'clock', settings: 'gear' };
let selectedPid = null; // remembered while the app is open
let undoTicker = null;

export default function parent(root, tab = 'log') {
  if (!TABS.includes(tab)) tab = 'log';
  if (!parentUnlocked()) {
    requirePin().then(ok => (ok ? go('#/parent/' + tab) : go('#/home')));
    return;
  }
  const screen = el(`<main class="screen parent" lang="${lang()}">
    <header class="topbar">
      <div class="title"><h1>${icon('lock', '#9B6BFF', 'inline-ic')} ${esc(t('parentMode'))}</h1><div class="sub">${esc(State.get().gameName)}</div></div>
      <button class="btn small white" data-act="exit">${esc(t('lock'))}</button>
    </header>
    <nav class="ptabs" role="tablist">${TABS.map(x => `<button class="ptab ${x === tab ? 'on' : ''}" role="tab" aria-selected="${x === tab}" data-act="tab" data-tab="${x}">${icon(TAB_ICON[x])}<span>${esc(t('tab_' + x))}</span></button>`).join('')}</nav>
    <section class="pbody"></section>
  </main>`);
  root.appendChild(screen);
  const body = screen.querySelector('.pbody');
  const offBody = TAB_RENDER[tab](body);

  const offTop = actions(screen.querySelector('.topbar'), {
    exit: () => { lockParent(); go('#/home'); },
  });
  const offTabs = actions(screen.querySelector('.ptabs'), { tab: b => go('#/parent/' + b.dataset.tab) });
  // Any tap in parent mode keeps the session alive; an idle session re-locks.
  const guard = e => {
    if (!parentUnlocked()) {
      e.stopPropagation(); e.preventDefault();
      requirePin().then(ok => (ok ? go('#/parent/' + tab) : go('#/home')));
    } else touchParent();
  };
  screen.addEventListener('click', guard, true);
  return () => { offBody?.(); offTop(); offTabs(); screen.removeEventListener('click', guard, true); };
}

// ------------------------------------------------------------------ LOG
function renderLog(body) {
  const s = State.get();
  if (!State.player(selectedPid)) selectedPid = s.players[0].id;
  const today = R.dayKey();
  const types = ['firstAsk', 'words', 'kind', 'rewind'];
  body.innerHTML = `
    <h2>${esc(t('whoDidIt'))}</h2>
    <div class="who-row">${s.players.map(p => `
      <button class="who ${p.id === selectedPid ? 'on' : ''}" data-act="who" data-id="${p.id}" aria-pressed="${p.id === selectedPid}">
        <span class="who-av">${avatarSVG(p.avatar, { crop: 'head' })}</span>
        <b>${esc(p.name)}</b><small>${esc(t('ptsToday', { n: R.pointsOn(s, p.id, today) }))}</small>
      </button>`).join('')}</div>
    <label class="note-row"><span>${esc(t('noteLabel'))}</span><input class="field" maxlength="140" placeholder="${esc(t('notePh'))}" autocomplete="off"></label>
    <h2>${esc(t('whatHappened'))}</h2>
    <div class="type-grid">${types.map(ty => `
      <button class="type-btn ${TYPE_COLOR[ty]}" data-act="log" data-type="${ty}">
        ${icon(TYPE_ICON[ty])}
        <span><b>${esc(t('type_' + ty))}</b><small>${esc(t('hint_' + ty))}</small></span>
        ${ty === 'rewind' ? '<i class="x2-badge">x2</i>' : ''}
      </button>`).join('')}</div>
    <p class="muted small center">${esc(t('undoHint'))}</p>`;
  const note = body.querySelector('.note-row input');

  return actions(body, {
    who: b => {
      selectedPid = b.dataset.id;
      body.querySelectorAll('.who').forEach(w => { const on = w.dataset.id === selectedPid; w.classList.toggle('on', on); w.setAttribute('aria-pressed', on); });
    },
    log: b => {
      const type = b.dataset.type;
      const res = State.addEntry(selectedPid, type, note.value);
      const p = res.player;
      // Instant feedback (sound + overlay) happens synchronously inside this tap.
      FX.celebratePoint(p, res.entry, State.unlockedMoves(p), res);
      if (res.lvAfter > res.lvBefore) FX.celebrateLevelUp(p, res.lvAfter, res.unlocks);
      if (res.newChapter) FX.celebrateChapter(res.newChapter, content.story[res.newChapter - 1]?.title || '');
      if (res.challengeDone) FX.showcase(State.get().players, { sub: `+${State.get().challenge.bonus} XP to the Crew Pot` });
      note.value = '';
      showUndo(res.entry, p.name, () => go('#/parent/log'));
      // refresh the "pts today" counters
      const who = body.querySelector(`.who[data-id="${p.id}"] small`);
      if (who) who.textContent = t('ptsToday', { n: R.pointsOn(State.get(), p.id, R.dayKey()) });
    },
  });
}

function showUndo(entry, name, after) {
  clearInterval(undoTicker);
  const left = () => Math.max(0, Math.ceil((entry.ts + R.UNDO_WINDOW_MS - Date.now()) / 1000));
  const node = toast(`${esc(t('logged', { name }))} · <span class="cd">${left()}s</span>`, {
    ms: R.UNDO_WINDOW_MS,
    action: {
      label: t('undo'),
      fn: () => {
        clearInterval(undoTicker);
        if (State.undoEntry(entry.id)) { Sound.soft(); toast(esc(t('undone'))); after?.(); }
      },
    },
  });
  undoTicker = setInterval(() => {
    const cd = node.querySelector('.cd');
    if (!cd || !document.body.contains(node)) return clearInterval(undoTicker);
    cd.textContent = left() + 's';
    if (left() <= 0) { clearInterval(undoTicker); hideToast(); }
  }, 1000);
}

// ------------------------------------------------------------------ REWARDS
function renderRewards(body) {
  const s = State.get();
  const reds = [...s.redemptions].reverse().slice(0, 8);
  body.innerHTML = `
    <div class="panel white">
      <h2>${esc(t('rewardsTitle'))}</h2>
      <p class="muted">${esc(t('rewardsHint'))}</p>
      <div class="reward-list">${s.rewards.map(r => `
        <div class="reward-row"><span class="r-ic">${esc(r.icon)}</span><span class="r-name">${esc(r.name)}</span>
        <span class="tag">${icon('star')} ${r.cost}</span>
        <button class="btn small white" data-act="edit" data-id="${r.id}">${icon('pencil')} ${esc(t('edit'))}</button></div>`).join('')}
      </div>
      <button class="btn mint" data-act="add">${icon('plus')} ${esc(t('addReward'))}</button>
    </div>
    <div class="panel mint-l">
      <h3>${esc(t('recentCashIns'))}</h3>
      ${reds.length ? `<ul class="plain">${reds.map(r => `<li>${esc(r.icon)} <b>${esc(State.player(r.pid)?.name || '')}</b> — ${esc(r.name)} <span class="muted small">(${new Date(r.ts).toLocaleDateString(lang())})</span></li>`).join('')}</ul>` : `<p class="muted">${esc(t('none'))}</p>`}
    </div>`;
  return actions(body, {
    add: () => editReward(null, () => go('#/parent/rewards')),
    edit: b => editReward(s.rewards.find(r => r.id === b.dataset.id), () => go('#/parent/rewards')),
  });
}

function editReward(r, after) {
  const draft = r ? { ...r } : { id: null, icon: '⭐', name: '', cost: 5 };
  const m = modal(`
    <h2>${esc(r ? t('edit') : t('addReward'))}</h2>
    <label class="lbl">${esc(t('rewardName'))}<input class="field" maxlength="60" value="${esc(draft.name)}"></label>
    <div class="lbl">${esc(t('stars'))}
      <div class="stepper"><button class="icon-btn" data-a="minus" aria-label="-">${icon('minus')}</button><b class="st-val">${draft.cost}</b><button class="icon-btn" data-a="plus" aria-label="+">${icon('plus')}</button></div></div>
    <div class="lbl">${esc(t('icon'))}<div class="emoji-grid">${REWARD_ICONS.map(i => `<button class="emoji ${i === draft.icon ? 'on' : ''}" data-a="icon" data-v="${i}">${i}</button>`).join('')}</div></div>
    <div class="row between">
      ${r ? `<button class="btn small white" data-a="remove">${icon('trash')} ${esc(t('remove'))}</button>` : '<span></span>'}
      <div class="row"><button class="btn white" data-a="cancel">${esc(t('cancel'))}</button><button class="btn mint" data-a="save">${esc(t('save'))}</button></div>
    </div>`);
  const name = m.el.querySelector('input');
  const val = m.el.querySelector('.st-val');
  m.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    Sound.tap();
    const a = b.dataset.a;
    if (a === 'minus') { draft.cost = Math.max(1, draft.cost - 1); val.textContent = draft.cost; }
    if (a === 'plus') { draft.cost = Math.min(99, draft.cost + 1); val.textContent = draft.cost; }
    if (a === 'icon') { draft.icon = b.dataset.v; m.el.querySelectorAll('.emoji').forEach(x => x.classList.toggle('on', x === b)); }
    if (a === 'cancel') m.close();
    if (a === 'save') {
      if (!name.value.trim()) { name.classList.add('shake'); setTimeout(() => name.classList.remove('shake'), 500); return; }
      State.saveReward({ ...draft, name: name.value });
      m.close(); after();
    }
    if (a === 'remove') {
      m.close();
      if (await confirmBox({ title: esc(t('remove')) + '?', text: esc(draft.name), yes: t('remove'), no: t('cancel'), yesCls: 'pink' })) { State.removeReward(draft.id); after(); }
    }
  });
}

// ------------------------------------------------------------------ CHALLENGE
function renderChallenge(body) {
  const s = State.get();
  const c = { ...s.challenge };
  const prog = R.challengeProgress(s);
  const done = s.challenge.doneWeek === R.weekKey();
  const typeLabel = ty => (ty === 'any' ? t('any') : t('type_' + ty));
  body.innerHTML = `
    <div class="panel pink-l">
      <h2>${esc(t('thisWeek'))}</h2>
      <div class="meter" style="--p:${Math.min(1, prog.count / Math.max(1, prog.target))};--fill:var(--sky)"><i></i></div>
      <p><b>${esc(t('weekProgress', { n: prog.count, t: prog.target }))}</b> — ${esc(typeLabel(s.challenge.type))}${done ? ` · <b>${esc(t('completed'))}</b>` : ''}</p>
    </div>
    <div class="panel white">
      <h2>${esc(t('challengeTitle'))}</h2>
      <p class="muted">${esc(t('challengeHint'))}</p>
      <div class="lbl">${esc(t('count'))}<div class="chips">${R.CHALLENGE_TYPES.map(ty => `<button class="chip ${c.type === ty ? 'on' : ''}" data-act="type" data-v="${ty}">${esc(typeLabel(ty))}</button>`).join('')}</div></div>
      <div class="lbl">${esc(t('target'))}<div class="stepper"><button class="icon-btn" data-act="tminus" aria-label="-">${icon('minus')}</button><b class="st-val tv">${c.target}</b><button class="icon-btn" data-act="tplus" aria-label="+">${icon('plus')}</button></div></div>
      <div class="lbl">${esc(t('bonus'))}<div class="chips">${[50, 100, 150, 200].map(b => `<button class="chip ${c.bonus === b ? 'on' : ''}" data-act="bonus" data-v="${b}">+${b} XP</button>`).join('')}</div></div>
      <button class="btn grape" data-act="save">${icon('check')} ${esc(t('saveChallenge'))}</button>
    </div>`;
  const tv = body.querySelector('.tv');
  const pick = (sel, v) => body.querySelectorAll(sel).forEach(x => x.classList.toggle('on', x.dataset.v === String(v)));
  return actions(body, {
    type: b => { c.type = b.dataset.v; pick('[data-act=type]', c.type); },
    bonus: b => { c.bonus = Number(b.dataset.v); pick('[data-act=bonus]', c.bonus); },
    tminus: () => { c.target = Math.max(1, c.target - 1); tv.textContent = c.target; },
    tplus: () => { c.target = Math.min(99, c.target + 1); tv.textContent = c.target; },
    save: () => {
      const won = State.setChallenge(c);
      toast(esc(t('challengeSaved')));
      if (won) FX.showcase(State.get().players, { sub: `+${c.bonus} XP to the Crew Pot` });
      go('#/parent/challenge');
    },
  });
}

// ------------------------------------------------------------------ CREW
function renderCrew(body) {
  const s = State.get();
  body.innerHTML = `<div class="panel white"><h2>${esc(t('crewTitle'))}</h2>
    <div class="crew-list">${s.players.map(p => `
      <div class="crew-line">
        <span class="who-av">${avatarSVG(p.avatar, { crop: 'head' })}</span>
        <div class="cl-main">
          <input class="field" data-id="${p.id}" maxlength="20" value="${esc(p.name)}" aria-label="${esc(t('name'))}">
          <small>${esc(t('role_' + p.role))} · ${esc(t('level', { n: State.level(p) }))} · ${p.xp} XP · ${p.stars} ★ · ${p.tickets || 0} ${esc(t('tickets'))}</small>
        </div>
        <button class="btn small pink" data-act="design" data-id="${p.id}">${icon('shirt')} ${esc(t('designLook'))}</button>
      </div>`).join('')}</div></div>`;
  body.querySelectorAll('input[data-id]').forEach(inp => {
    inp.addEventListener('change', () => { State.renamePlayer(inp.dataset.id, inp.value); Sound.chime(); });
  });
  return actions(body, { design: b => go('#/closet/' + b.dataset.id) });
}

// ------------------------------------------------------------------ HISTORY
function renderHistory(body) {
  const s = State.get();
  const items = R.activeLog(s).slice().sort((a, b) => b.ts - a.ts).slice(0, 50);
  const paint = () => {
    const now = Date.now();
    body.innerHTML = `<div class="panel white"><h2>${esc(t('historyTitle'))}</h2><p class="muted">${esc(t('historyHint'))}</p>
      ${items.length ? `<ul class="hist">${items.map(e => {
        const p = State.player(e.pid);
        const canUndo = State.canUndo(e, now);
        return `<li>
          <span class="h-ic ${TYPE_COLOR[e.type]}">${icon(TYPE_ICON[e.type])}</span>
          <span class="h-main"><b>${esc(p?.name || '')}</b> · ${esc(t('type_' + e.type))}${e.note ? ` — “${esc(e.note)}”` : ''}
          <small>${new Date(e.ts).toLocaleString(lang(), { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · +${e.xp} XP</small></span>
          ${canUndo ? `<button class="btn small white" data-act="undo" data-id="${e.id}">${esc(t('undo'))}</button>` : ''}
        </li>`;
      }).join('')}</ul>` : `<p class="muted">${esc(t('none'))}</p>`}</div>`;
  };
  paint();
  const off = actions(body, {
    undo: b => { if (State.undoEntry(b.dataset.id)) { Sound.soft(); toast(esc(t('undone'))); } go('#/parent/history'); },
  });
  const timer = setInterval(() => { if (items.some(e => State.canUndo(e))) paint(); }, 5000);
  return () => { off(); clearInterval(timer); };
}

// ------------------------------------------------------------------ SETTINGS
function renderSettings(body) {
  const s = State.get();
  const last = s.lastBackup ? new Date(s.lastBackup).toLocaleDateString(lang()) : t('never');
  body.innerHTML = `
    <div class="settings-grid">
      <div class="panel white">
        <h3>${esc(t('sound'))}</h3>
        <div class="seg"><button class="chip ${s.sound ? 'on' : ''}" data-act="sound" data-v="1">${esc(t('on'))}</button><button class="chip ${!s.sound ? 'on' : ''}" data-act="sound" data-v="0">${esc(t('off'))}</button></div>
        <label class="lbl">${esc(t('gameName'))}<input class="field" data-key="gameName" maxlength="28" value="${esc(s.gameName)}"></label>
        <label class="lbl">${esc(t('crewName'))}<input class="field" data-key="crewName" maxlength="28" value="${esc(s.crewName)}"></label>
        <button class="btn grape" data-act="pin">${icon('lock')} ${esc(t('changePin'))}</button>
      </div>
      <div class="panel sky-l">
        <h3>${esc(t('backup'))}</h3>
        <p>${esc(t('backupHint'))}</p>
        <p class="small"><b>${esc(t('lastBackup', { when: last }))}</b></p>
        <div class="row"><button class="btn mint" data-act="export">${icon('download')} ${esc(t('exportBtn'))}</button>
        <button class="btn white" data-act="import">${icon('upload')} ${esc(t('importBtn'))}</button></div>
        <input type="file" accept="application/json,.json" hidden>
        <p class="small muted">${esc(t('installTip'))}</p>
      </div>
      <div class="panel grape-l arcade-settings">
        <h3>${esc(t('capLabel'))}</h3>
        <div class="chips">${R.CAP_OPTIONS.map(m => `<button class="chip ${s.arcade.capMin === m ? 'on' : ''}" data-act="cap" data-v="${m}">${esc(t('minutes', { n: m }))}</button>`).join('')}</div>
        <p class="small muted">${esc(t('capHint'))}</p>
        <h3>${esc(t('windDownLabel'))}</h3>
        <div class="chips">${R.WIND_DOWN_OPTIONS.map(w => `<button class="chip ${s.arcade.windDown === w ? 'on' : ''}" data-act="wind" data-v="${w}">${w === 'off' ? esc(t('off')) : w}</button>`).join('')}</div>
        <p class="small muted">${esc(t('windDownHint'))}</p>
        <button class="linkish" data-act="tune">${esc(t('tune'))}</button>
      </div>
      <div class="panel orange-l">
        <h3>${esc(t('startOver'))}</h3>
        <p class="small">${esc(t('startOverHint'))}</p>
        <button class="btn small white" data-act="erase">${icon('trash')} ${esc(t('erase'))}</button>
      </div>
    </div>`;
  body.querySelectorAll('input[data-key]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.value.trim()) { State.setSetting(inp.dataset.key, inp.value.trim().slice(0, 28)); Sound.chime(); }
  }));
  const file = body.querySelector('input[type=file]');
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    const text = await f.text();
    if (!(await confirmBox({ title: esc(t('importBtn')), text: esc(t('importWarn')), yes: t('yes'), no: t('cancel'), yesCls: 'pink' }))) return;
    try {
      State.importJSON(text);
      Sound.setEnabled(State.get().sound);
      toast(esc(t('importOk')));
      go('#/parent/settings');
    } catch {
      toast(esc(t('importBad')));
    }
  });
  return actions(body, {
    sound: b => { State.setSetting('sound', b.dataset.v === '1'); Sound.setEnabled(State.get().sound); go('#/parent/settings'); },
    pin: async () => {
      if (!(await requirePin({ fresh: true }))) return;
      const pin = await choosePin();
      if (pin) { State.setPin(pin); toast(esc(t('pinSaved'))); }
    },
    export: () => exportBackup(() => go('#/parent/settings')),
    import: () => file.click(),
    cap: b => { State.setArcade({ capMin: Number(b.dataset.v) }); toast(esc(t('arcadeSaved'))); go('#/parent/settings'); },
    wind: b => { State.setArcade({ windDown: b.dataset.v }); toast(esc(t('arcadeSaved'))); go('#/parent/settings'); },
    tune: () => go('#/calibrate/' + encodeURIComponent('/parent/settings')),
    erase: () => eraseFlow(),
  });
}

async function exportBackup(after) {
  const json = State.exportJSON();
  const name = `crew-backup-${R.dayKey()}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  let shared = false;
  try {
    const f = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [f] }) && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) {
      await navigator.share({ files: [f], title: name });
      shared = true;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  if (!shared) {
    const url = URL.createObjectURL(blob);
    const a = el(`<a href="${url}" download="${name}"></a>`);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  State.mutate(s => { s.lastBackup = Date.now(); });
  after?.();
}

function eraseFlow() {
  const m = modal(`<h2>${esc(t('startOver'))}</h2><p>${esc(t('startOverHint'))}</p>
    <label class="lbl">${esc(t('eraseConfirm'))}<input class="field" autocapitalize="characters" autocomplete="off"></label>
    <div class="row"><button class="btn white" data-a="no">${esc(t('cancel'))}</button><button class="btn pink" data-a="yes" disabled>${esc(t('erase'))}</button></div>`);
  const inp = m.el.querySelector('input');
  const yes = m.el.querySelector('[data-a=yes]');
  inp.addEventListener('input', () => { yes.disabled = inp.value.trim().toUpperCase() !== 'ERASE'; });
  m.el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'no') m.close();
    if (a === 'yes' && !yes.disabled) { State.eraseAll(); lockParent(); location.hash = ''; location.reload(); }
  });
}

const TAB_RENDER = { log: renderLog, rewards: renderRewards, challenge: renderChallenge, crew: renderCrew, history: renderHistory, settings: renderSettings };
