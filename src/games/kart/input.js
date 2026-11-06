import { hasCommandModifier, isEditableTarget } from '../shared/keyboard.js';

/** Pekkas Gokart controls: keyboard, the on-screen buttons, an optional
 * Autogas that holds the throttle (brake and steering stay with the player)
 * and optional analog steering by dragging on the left half of a touch screen.
 * Every guard from the night audit stays: command modifiers and secondary
 * mouse buttons are ignored, buttons capture their pointer and release it on
 * pointerup, pointercancel and lostpointercapture, each key and finger owns
 * its control, and everything clears on window blur, pause and hidden tab.
 */
const DRIVE_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
const DRIVING = new Set(['grid', 'lights', 'countdown', 'racing']);
const AUTOGAS_KEY = 'pp-kart-autogas';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function remembered(key, fallback) {
  try { const value = localStorage.getItem(key); return value === null ? fallback : value; } catch { return fallback; }
}
function remember(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* private mode */ }
}

export function createKartInput(game, interfaceEl, { onView = null } = {}) {
  const { keys } = game;
  const find = (selector) => interfaceEl.querySelector(selector);
  const held = new Map();
  const pointerControls = new Map();
  let state = 'menu';
  let enabled = null;
  let autogas = remembered(AUTOGAS_KEY, 'false') === 'true';
  const analog = { pointerId: null, originX: 0, originY: 0, value: 0 };
  const zone = find('.kart-steer-zone');
  const knob = find('.kart-steer-knob');
  const autogasButton = find('[data-toggle="autogas"]');
  const viewButton = find('[data-toggle="view"]');
  const driving = () => !game.paused && (enabled === null ? DRIVING.has(state) : enabled);

  const pressed = (control) => {
    for (const value of held.values()) if (value === control) return true;
    for (const value of pointerControls.values()) if (value === control) return true;
    return false;
  };
  const refreshButton = (control) => find(`[data-control="${control}"]`)?.classList.toggle('is-held', pressed(control));
  function releasePointer(event) {
    const control = pointerControls.get(event.pointerId);
    if (!control) return;
    pointerControls.delete(event.pointerId);
    refreshButton(control);
  }
  interfaceEl.querySelectorAll('[data-control]').forEach((button) => {
    game.listen(button, 'pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!driving()) return;
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      const { control } = button.dataset;
      pointerControls.set(event.pointerId, control);
      refreshButton(control);
    });
    game.listen(button, 'pointerup', releasePointer);
    game.listen(button, 'pointercancel', releasePointer);
    game.listen(button, 'lostpointercapture', releasePointer);
    game.listen(button, 'keydown', (event) => {
      if (hasCommandModifier(event)) return;
      // Native UI is ignored by the shared keyboard listener; these are actual driving controls.
      if (DRIVE_KEYS.includes(event.code)) {
        if (driving()) { event.preventDefault(); keys.add(event.code); }
        return;
      }
      if (!['Enter', 'Space'].includes(event.code) || event.repeat || !driving()) return;
      event.preventDefault();
      held.set(event.code, button.dataset.control);
      refreshButton(button.dataset.control);
    });
    game.listen(button, 'keyup', (event) => {
      if (!['Enter', 'Space'].includes(event.code)) return;
      event.preventDefault(); held.delete(event.code); refreshButton(button.dataset.control);
    });
    game.listen(button, 'blur', () => {
      for (const [code, control] of held) if (control === button.dataset.control) held.delete(code);
      refreshButton(button.dataset.control);
    });
  });

  // Analog steering: one finger dragging sideways on the left half of the screen.
  function releaseAnalog(event) {
    if (event && event.pointerId !== analog.pointerId) return;
    analog.pointerId = null;
    analog.value = 0;
    knob?.classList.remove('is-on');
  }
  if (zone) {
    game.listen(zone, 'pointerdown', (event) => {
      if (event.pointerType === 'mouse' || analog.pointerId !== null || !driving()) return;
      event.preventDefault();
      zone.setPointerCapture?.(event.pointerId);
      analog.pointerId = event.pointerId;
      analog.originX = event.clientX; analog.originY = event.clientY;
      analog.value = 0;
      if (knob) {
        knob.style.left = `${event.clientX - interfaceEl.getBoundingClientRect().left}px`;
        knob.style.top = `${event.clientY - interfaceEl.getBoundingClientRect().top}px`;
        knob.style.setProperty('--kart-knob', '0px');
        knob.classList.add('is-on');
      }
    });
    game.listen(zone, 'pointermove', (event) => {
      if (event.pointerId !== analog.pointerId) return;
      const dx = clamp(event.clientX - analog.originX, -70, 70);
      // Dragging right steers right (negative lane); a small dead zone keeps straights calm.
      const raw = -dx / 62;
      analog.value = clamp(Math.sign(raw) * Math.max(0, Math.abs(raw) - 0.06) / 0.94, -1, 1);
      knob?.style.setProperty('--kart-knob', `${dx.toFixed(0)}px`);
    });
    game.listen(zone, 'pointerup', releaseAnalog);
    game.listen(zone, 'pointercancel', releaseAnalog);
    game.listen(zone, 'lostpointercapture', releaseAnalog);
  }

  function syncAutogas() {
    if (!autogasButton) return;
    autogasButton.setAttribute('aria-pressed', String(autogas));
    autogasButton.querySelector('b').textContent = autogas ? 'PÅ' : 'AV';
  }
  if (autogasButton) {
    game.listen(autogasButton, 'click', (event) => {
      autogas = !autogas;
      remember(AUTOGAS_KEY, autogas);
      syncAutogas();
      if (event.detail > 0 && !game.paused) game.root.focus({ preventScroll: true });
    });
    syncAutogas();
  }
  if (viewButton) {
    game.listen(viewButton, 'click', (event) => {
      onView?.();
      if (event.detail > 0 && !game.paused) game.root.focus({ preventScroll: true });
    });
  }
  game.listen(window, 'keydown', (event) => {
    if (event.code !== 'KeyC' || event.repeat || event.defaultPrevented || hasCommandModifier(event) || game.paused) return;
    if (isEditableTarget(event.target)) return;
    onView?.();
  });

  function clear() {
    held.clear();
    pointerControls.clear();
    releaseAnalog();
    interfaceEl.querySelectorAll('.is-held').forEach((button) => button.classList.remove('is-held'));
  }
  game.listen(window, 'blur', clear);
  game.listen(game.root, 'arcadepause', clear);
  game.listen(document, 'visibilitychange', () => { if (document.hidden) clear(); });

  return {
    /** `{ steer: -1..1 (+ = left, towards +lane), throttle: 0..1, brake: 0..1 }` */
    read() {
      if (!driving()) return { steer: 0, throttle: 0, brake: 0 };
      const left = pressed('left') || keys.has('ArrowLeft') || keys.has('KeyA');
      const right = pressed('right') || keys.has('ArrowRight') || keys.has('KeyD');
      const steer = clamp(Number(left) - Number(right) + (analog.pointerId !== null ? analog.value : 0), -1, 1);
      const brake = pressed('brake') || keys.has('ArrowDown') || keys.has('KeyS') || keys.has('Space') ? 1 : 0;
      // Autogas waits for lights out, so it can never cause a jump start.
      const gas = pressed('throttle') || keys.has('ArrowUp') || keys.has('KeyW') || (autogas && state === 'racing');
      return { steer, throttle: gas ? 1 : 0, brake };
    },
    pressed,
    clear,
    get active() { return driving(); },
    /** Optional override from the race loop; otherwise the race state decides. */
    set active(value) { enabled = value === null ? null : !!value; if (!driving()) clear(); },
    get state() { return state; },
    set state(next) { if (next !== state) { state = next; if (!DRIVING.has(next)) clear(); } },
    get autogas() { return autogas; },
    get analog() { return analog.pointerId !== null; }
  };
}
