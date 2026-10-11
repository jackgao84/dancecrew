// PIN pad + parent session. Every parent action goes through requirePin().
import * as State from '../state.js';
import * as Sound from '../sound.js';
import { modal, icon, esc } from '../ui.js';
import { t } from '../i18n.js';

const IDLE_LOCK_MS = 3 * 60 * 1000;
let unlockedAt = 0;
let lastActivity = 0;

export function parentUnlocked() {
  if (!unlockedAt) return false;
  if (Date.now() - lastActivity > IDLE_LOCK_MS) { lockParent(); return false; }
  return true;
}
export function touchParent() { if (unlockedAt) lastActivity = Date.now(); }
export function lockParent() { unlockedAt = 0; }

/**
 * Show a 4-digit keypad. `check(pin)` returns true to accept, false to shake and retry.
 * Resolves with the pin, or null if cancelled.
 */
export function pinPad({ title, sub = '', check = () => true, showForgot = false }) {
  return new Promise(resolve => {
    let pin = '';
    const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'x', 0, 'del'];
    const m = modal(`
      <div class="pin">
        <div class="pin-head">${icon('lock')}<div><h2>${esc(title)}</h2>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div></div>
        <div class="pin-dots" aria-live="polite"><i></i><i></i><i></i><i></i></div>
        <p class="pin-msg" aria-live="polite">&nbsp;</p>
        <div class="pin-keys">${keys.map(k => k === 'x'
          ? `<button class="pin-key ghost" data-k="x">${esc(t('cancel'))}</button>`
          : k === 'del' ? `<button class="pin-key ghost" data-k="del" aria-label="Delete">⌫</button>`
          : `<button class="pin-key" data-k="${k}">${k}</button>`).join('')}</div>
        ${showForgot ? `<button class="linkish" data-k="forgot">${esc(t('forgotPin'))}</button>` : ''}
      </div>`, { onClose: () => resolve(null), cls: 'pin-overlay', dismissable: false });
    const dots = [...m.el.querySelectorAll('.pin-dots i')];
    const msg = m.el.querySelector('.pin-msg');
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const press = k => {
      if (k === 'x') { m.close(); return; }
      if (k === 'forgot') { resolve('forgot'); m.close(); return; }
      if (k === 'del') { pin = pin.slice(0, -1); paint(); Sound.key(); return; }
      if (pin.length >= 4) return;
      Sound.key();
      pin += k;
      paint();
      if (pin.length === 4) {
        setTimeout(() => {
          if (check(pin)) {
            const p = pin;
            resolve(p);
            m.close();
          } else {
            Sound.soft();
            msg.textContent = t('wrongPin');
            const box = m.el.querySelector('.pin-dots');
            box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
            pin = ''; paint();
          }
        }, 120);
      }
    };
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    const onKey = e => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Escape') press('x');
    };
    document.addEventListener('keydown', onKey);
    const close0 = m.close;
    m.close = () => { document.removeEventListener('keydown', onKey); close0(); };
  });
}

/**
 * Ask for the parent PIN unless parent mode is already unlocked.
 * `once: true` approves a single action (e.g. a reward cash-in) without opening parent mode.
 */
export async function requirePin({ fresh = false, once = false } = {}) {
  if (!fresh && parentUnlocked()) { touchParent(); return true; }
  const p = await pinPad({ title: t('enterPin'), sub: t('pinHint'), check: State.checkPin, showForgot: !once });
  if (!p) return false;
  if (p === 'forgot') return forgotFlow();
  if (!once) unlockedAt = lastActivity = Date.now();
  return true;
}

/** Choose a new PIN (typed twice). Returns the PIN or null. */
export async function choosePin(title = t('newPin')) {
  for (;;) {
    const a = await pinPad({ title });
    if (!a) return null;
    const b = await pinPad({ title: t('againPin') });
    if (!b) return null;
    if (a === b) return a;
    await new Promise(r => { const m = modal(`<h2>${esc(t('pinMismatch'))}</h2><div class="row"><button class="btn">OK</button></div>`, { onClose: r }); m.el.querySelector('button').onclick = m.close; });
  }
}

// A grown-up puzzle instead of a recovery e-mail (there is no server).
async function forgotFlow() {
  const a = 13 + Math.floor(Math.random() * 27);
  const b = 12 + Math.floor(Math.random() * 18);
  const ok = await new Promise(resolve => {
    const m = modal(`<h2>${esc(t('forgotPin'))}</h2><p>${esc(t('forgotText'))}</p>
      <p class="display" style="font-size:40px;text-align:center">${a} × ${b} = ?</p>
      <input class="field" inputmode="numeric" pattern="[0-9]*" aria-label="answer">
      <div class="row"><button class="btn white" data-a="no">${esc(t('cancel'))}</button><button class="btn mint" data-a="yes">OK</button></div>`, { onClose: () => resolve(false) });
    const input = m.el.querySelector('input');
    setTimeout(() => input.focus(), 50);
    m.el.addEventListener('click', e => {
      const act = e.target.closest('[data-a]')?.dataset.a;
      if (act === 'no') m.close();
      if (act === 'yes') {
        if (Number(input.value) === a * b) { resolve(true); m.close(); } else { input.value = ''; Sound.soft(); input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 500); }
      }
    });
  });
  if (!ok) return false;
  const pin = await choosePin();
  if (pin) { State.setPin(pin); unlockedAt = lastActivity = Date.now(); }
  return !!pin;
}
