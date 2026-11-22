// Keyboard and pointer input. Held keys give a movement direction; one-shot
// presses (start, pause, restart) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted
// twice. Mouse clicks are queued as canvas pixel positions and converted to
// field coordinates by the caller.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter', 'KeyE']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const RUN = new Set(['Space']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sneak = false;
  let run = false;
  let actions = 0;
  const clicks = [];

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (CONFIRM.has(event.code)) {
      if (RUN.has(event.code)) run = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (SNEAK.has(event.code)) sneak = false;
    else if (RUN.has(event.code)) run = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    sneak = false;
    run = false;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    clicks.push({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  });

  return {
    /** Normalised movement direction, {x, y} each in -1..1. */
    direction() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    /** True while either Shift key is held: sneak mode. */
    sneaking() {
      return sneak;
    },
    /** True while Space is held: run (fast, loud) while moving. */
    running() {
      return run;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The mouse clicks since the last call, in canvas pixels. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
  };
}
