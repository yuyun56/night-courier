// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. Night palette: a dark floor with readable
// tiles, shadow zones darker than the floor, crates and walls in warm tones
// a guard's cone can be read against at a glance, and the courier in bright
// teal against it all. The vision cones are translucent wedges; the exit is
// a glowing green door.
import { COLS, FIELD, FONT, GUARD, LIVES, PALETTE, ROWS, TILE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
export const SCREEN_LEVEL = 'level';

const PANEL = { width: 640, top: 150, line: 32, bottom: 76 };
const METER = { x: 440, y: 52, w: 400, h: 18 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const levelLabel = cachedLabel('Level ');
  const coinsLabel = cachedLabel('Coins ');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const ghostLabel = cachedLabel('Ghost levels ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawFloor(state) {
    for (let ty = 0; ty < state.grid.length; ty += 1) {
      for (let tx = 0; tx < state.grid[ty].length; tx += 1) {
        const ch = state.grid[ty][tx];
        const x = tx * TILE;
        const y = ty * TILE;
        if (ch === '#') {
          context.fillStyle = PALETTE.wall;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = PALETTE.wallTop;
          context.fillRect(x, y, TILE, 6);
          continue;
        }
        context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        context.fillRect(x, y, TILE, TILE);
        context.fillStyle = PALETTE.floorLine;
        context.fillRect(x, y + TILE - 1, TILE, 1);
        if (ch === 'C') {
          context.fillStyle = PALETTE.crate;
          context.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
          context.strokeStyle = PALETTE.crateEdge;
          context.lineWidth = 2;
          context.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
          context.beginPath();
          context.moveTo(x + 4, y + 4);
          context.lineTo(x + TILE - 4, y + TILE - 4);
          context.moveTo(x + TILE - 4, y + 4);
          context.lineTo(x + 4, y + TILE - 4);
          context.stroke();
        }
      }
    }
    // Shadow zones: darker floor with a blue rim — standing here is safer.
    for (const s of state.shadows) {
      context.fillStyle = PALETTE.shadow;
      context.globalAlpha = 0.72;
      context.fillRect(s.x, s.y, s.w, s.h);
      context.globalAlpha = 1;
      context.strokeStyle = PALETTE.shadowEdge;
      context.lineWidth = 2;
      context.setLineDash([8, 6]);
      context.strokeRect(s.x, s.y, s.w, s.h);
      context.setLineDash([]);
    }
  }

  function drawExit(state, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    const x = state.exit.x;
    const y = state.exit.y;
    context.fillStyle = PALETTE.exitGlow;
    context.globalAlpha = 0.25 + 0.2 * pulse;
    context.beginPath();
    context.arc(x, y, 34, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = PALETTE.exit;
    context.fillRect(x - 18, y - 22, 36, 44);
    context.fillStyle = '#0a2e1c';
    context.fillRect(x - 10, y - 12, 20, 24);
    text('EXIT', x, y - 30, 13, PALETTE.exit, 'center');
  }

  function drawParcels(state) {
    for (const parcel of state.parcels) {
      if (parcel.taken) continue;
      context.fillStyle = PALETTE.parcel;
      context.fillRect(parcel.x - 10, parcel.y - 10, 20, 20);
      context.strokeStyle = '#7a4d12';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(parcel.x, parcel.y - 10);
      context.lineTo(parcel.x, parcel.y + 10);
      context.moveTo(parcel.x - 10, parcel.y);
      context.lineTo(parcel.x + 10, parcel.y);
      context.stroke();
    }
  }

  function drawCones(state) {
    for (const guard of state.guards) {
      const fill = guard.state === 'alarm' ? PALETTE.coneAlarm : guard.state === 'suspect' ? PALETTE.coneSuspicious : PALETTE.coneCalm;
      context.fillStyle = fill;
      // The cone is raycast against walls and crates, so it stops where the
      // guard's sight stops instead of shining through a wall. A short
      // min-filter over neighbouring rays keeps one ray that slips between
      // two crates from drawing a thin spike.
      const steps = 26;
      const reaches = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = guard.dir - GUARD.visionHalfAngle + (2 * GUARD.visionHalfAngle * i) / steps;
        let reach = guard.visionRange;
        for (let d = 8; d <= guard.visionRange; d += 8) {
          const x = guard.x + Math.cos(angle) * d;
          const y = guard.y + Math.sin(angle) * d;
          const tx = Math.floor(x / TILE);
          const ty = Math.floor(y / TILE);
          const tile = ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS ? '#' : state.grid[ty][tx];
          if (tile === '#' || tile === 'C') {
            reach = d;
            break;
          }
        }
        reaches.push(reach);
      }
      const smooth = reaches.map((reach, i) => Math.min(reaches[Math.max(0, i - 1)], reach, reaches[Math.min(steps, i + 1)]));
      // A second pass widens the filter enough to flatten a lobe that slips
      // past one crate corner while its neighbours are blocked by it.
      const smooth2 = smooth.map((reach, i) => Math.min(smooth[Math.max(0, i - 1)], reach, smooth[Math.min(steps, i + 1)]));
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      for (let i = 0; i <= steps; i += 1) {
        const angle = guard.dir - GUARD.visionHalfAngle + (2 * GUARD.visionHalfAngle * i) / steps;
        context.lineTo(guard.x + Math.cos(angle) * smooth2[i], guard.y + Math.sin(angle) * smooth2[i]);
      }
      context.closePath();
      context.fill();
    }
  }

  function drawPulses(state) {
    for (const pulse of state.pulses) {
      const k = 1 - pulse.ttl;
      context.strokeStyle = PALETTE.noise;
      context.globalAlpha = 0.8 * (1 - k);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(pulse.x, pulse.y, pulse.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawCoins(state) {
    for (const coin of state.thrown) {
      context.fillStyle = PALETTE.coin;
      context.beginPath();
      context.arc(coin.x, coin.y, coin.landed ? 6 : 7, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#8a6d1a';
      context.lineWidth = 1.5;
      context.stroke();
      if (coin.landed) {
        context.strokeStyle = PALETTE.coin;
        context.globalAlpha = Math.max(0, coin.ringTtl);
        context.beginPath();
        context.arc(coin.x, coin.y, 10 + (1 - coin.ringTtl) * 26, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
      }
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(guard.x, guard.y, guard.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.guardDark;
      context.beginPath();
      context.arc(guard.x + Math.cos(guard.dir) * 6, guard.y + Math.sin(guard.dir) * 6, 6, 0, Math.PI * 2);
      context.fill();
      // A small alert badge over a guard that has noticed something.
      if (guard.alert >= 35) {
        const mark = guard.state === 'alarm' ? '!' : '?';
        const color = guard.state === 'alarm' ? PALETTE.danger : PALETTE.coin;
        text(mark, guard.x, guard.y - guard.radius - 8, 22, color, 'center');
      }
    }
  }

  function drawPlayer(state, time) {
    const player = state.player;
    const blink = player.grace > 0 && Math.floor(time * 8) % 2 === 0;
    if (blink) return;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerDark;
    context.beginPath();
    context.arc(player.x + Math.cos(player.facing) * 6, player.y + Math.sin(player.facing) * 6, 5, 0, Math.PI * 2);
    context.fill();
    // Sneaking crouches the courier down; running leans it forward.
    if (player.sneaking) {
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, player.radius + 4, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 26, PALETTE.text, 'left');
    text(levelLabel(`${state.levelIndex + 1} · ${state.levelName}`), FIELD.width / 2, 18, 22, PALETTE.text, 'center');
    text(coinsLabel(state.coinsLeft), FIELD.width - 24, 18, 26, PALETTE.text, 'right');
    // Lives as small teal dots at the bottom left, clear of the spawn corner.
    for (let life = 0; life < LIVES; life += 1) {
      context.fillStyle = life < state.lives ? PALETTE.player : PALETTE.floorLine;
      context.beginPath();
      context.arc(34 + life * 26, FIELD.height - 22, 8, 0, Math.PI * 2);
      context.fill();
    }
    // Detection meter: the loudest guard's alert, with a word for its state.
    const d = Math.round(state.detection);
    const label = d >= 100 ? 'ALARM' : d >= 35 ? 'SUSPICIOUS' : 'UNSEEN';
    const color = d >= 100 ? PALETTE.danger : d >= 35 ? PALETTE.coin : PALETTE.calm;
    context.fillStyle = '#10151f';
    context.fillRect(METER.x - 2, METER.y - 2, METER.w + 4, METER.h + 4);
    context.fillStyle = color;
    context.fillRect(METER.x, METER.y, (METER.w * d) / 100, METER.h);
    context.strokeStyle = PALETTE.floorLine;
    context.strokeRect(METER.x - 2, METER.y - 2, METER.w + 4, METER.h + 4);
    text(`${label} ${d}`, METER.x + METER.w + 12, METER.y + 1, 15, PALETTE.text, 'left');
    text('Shift sneak · hold Space run · click throws a coin', FIELD.width - 24, FIELD.height - 30, 16, PALETTE.muted, 'right');
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.floorLine;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 23, PALETTE.coin, 'center');
  }

  const TITLE_LINES = [
    'You are the night courier. Slip past the guards,',
    'grab the parcels, and reach the green EXIT unseen.',
    'WASD / arrows to move · Shift to sneak · hold Space to run',
    'Click to throw a coin and lure a guard away.',
    'Dark floor is shadow: guards see you from half as far there.',
    '',
  ];
  const PAUSED_LINES = ['The guards will wait for you.'];
  const LEVEL_LINES = ['', ''];
  const OVER_LINES = ['', ''];
  const WIN_LINES = ['', '', ''];

  /** Paint one frame: the field, the cones, the actors, then the HUD or a panel. */
  function draw(state, screen, best, time) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawFloor(state);
    drawExit(state, time);
    drawParcels(state);
    drawCones(state);
    drawPulses(state);
    drawCoins(state);
    drawGuards(state);
    drawPlayer(state, time);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = bestLabel(best);
      drawPanel('NIGHT COURIER', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_LEVEL) {
      LEVEL_LINES[0] = `Level ${state.levelIndex + 1} clear — ${state.levelName}`;
      LEVEL_LINES[1] = finalLabel(state.score);
      drawPanel('Delivered!', LEVEL_LINES, 'Press Space for the next level');
    } else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = bestLabel(best);
      drawPanel('Caught!', OVER_LINES, 'Press Space or click to try again');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = finalLabel(state.score);
      WIN_LINES[1] = ghostLabel(state.ghostLevels);
      WIN_LINES[2] = bestLabel(best);
      drawPanel('All deliveries made!', WIN_LINES, 'Press Space or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Convert canvas pixels (a mouse click) to playfield coordinates. */
    toField(px, py) {
      return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
    },
  };
}
