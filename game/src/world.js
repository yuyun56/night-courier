// The game's rules and state, with no drawing and no browser in it: the
// tile levels, line of sight, the player's courier, the guards, thrown
// coins, parcels, the exit, score and lives. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react without
// the world knowing about screens or sound. Nothing here allocates after
// createWorld returns, except the small noise-pulse list, which is capped.
import { COIN, COLS, DETECT, FIELD, GUARD, LIVES, LEVELS, PLAYER, ROWS, SCORE, TILE } from './config.js';
import { createGuard, updateGuards } from './guards.js';
import { movePlayer } from './player.js';

export const EVENT_COIN = 1;
export const EVENT_PICKUP = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_LEVEL = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_ALARM = 64;
export const EVENT_SUSPICIOUS = 128;
export const EVENT_CLINK = 256;

// Tile legend: '#' wall, 'C' crate (low cover: blocks sight and movement),
// '.' floor, 'P' player start, 'E' exit, 'G' guard spawn (floor under it).
// Every row is exactly 32 tiles; the border is always wall.
const LEVEL_DEFS = [
  {
    name: 'The Old Market',
    rows: [
      '################################',
      '#P............................E#',
      '#..............................#',
      '#....C.........#####...........#',
      '#..............................#',
      '#......######.........C........#',
      '#..............................#',
      '#..C...........C..........C....#',
      '#..............................#',
      '#........#####.................#',
      '#..............................#',
      '#...C.........C.......######...#',
      '#..............................#',
      '#......#####.........C.........#',
      '#..............................#',
      '#..C...........................#',
      '#..............................#',
      '################################',
    ],
    guards: [
      { patrol: [{ x: 240, y: 100 }, { x: 1040, y: 100 }] },
      { patrol: [{ x: 820, y: 200 }, { x: 820, y: 560 }] },
    ],
    parcels: [{ x: 360, y: 300 }, { x: 920, y: 480 }, { x: 640, y: 620 }],
    shadows: [
      { x: 40, y: 480, w: 280, h: 160 },
      { x: 880, y: 40, w: 320, h: 120 },
      { x: 480, y: 240, w: 200, h: 80 },
    ],
  },
  {
    name: 'The Lantern Quarter',
    rows: [
      '################################',
      '#P......C.....................E#',
      '#.........#####................#',
      '#..............................#',
      '#..#####.........C........###..#',
      '#..............................#',
      '#......C......#####............#',
      '#..............................#',
      '#..##########.........C........#',
      '#..............................#',
      '#........C......#####......C...#',
      '#..............................#',
      '#..###...........C.............#',
      '#..............................#',
      '#......#####..........#####....#',
      '#..............................#',
      '#..C...........C...............#',
      '################################',
    ],
    guards: [
      { patrol: [{ x: 200, y: 140 }, { x: 1080, y: 140 }] },
      { patrol: [{ x: 900, y: 300 }, { x: 900, y: 520 }] },
      { patrol: [{ x: 200, y: 620 }, { x: 1000, y: 620 }] },
    ],
    parcels: [{ x: 200, y: 300 }, { x: 1040, y: 420 }, { x: 560, y: 180 }],
    shadows: [
      { x: 40, y: 560, w: 240, h: 120 },
      { x: 960, y: 40, w: 280, h: 120 },
      { x: 400, y: 320, w: 240, h: 80 },
    ],
  },
  {
    name: 'The Vault District',
    rows: [
      '################################',
      '#P....C.......................E#',
      '#.......#####.......C..........#',
      '#..............................#',
      '#..####......C........#####....#',
      '#..............................#',
      '#.....C.....######.....C.......#',
      '#..............................#',
      '#..#########......C..........#.#',
      '#..............................#',
      '#......C......#####......C.....#',
      '#..............................#',
      '#..#####.........C......####...#',
      '#..............................#',
      '#.....C......#####........C....#',
      '#..............................#',
      '#..C..........C.........C......#',
      '################################',
    ],
    guards: [
      { patrol: [{ x: 160, y: 140 }, { x: 1120, y: 140 }] },
      { patrol: [{ x: 860, y: 200 }, { x: 860, y: 520 }] },
      { patrol: [{ x: 160, y: 460 }, { x: 1120, y: 460 }] },
      { patrol: [{ x: 340, y: 420 }, { x: 340, y: 600 }] },
    ],
    parcels: [{ x: 120, y: 300 }, { x: 1160, y: 300 }, { x: 640, y: 620 }],
    shadows: [
      { x: 40, y: 520, w: 200, h: 160 },
      { x: 1000, y: 40, w: 240, h: 120 },
      { x: 480, y: 280, w: 200, h: 80 },
      { x: 760, y: 480, w: 200, h: 120 },
    ],
  },
];

function tileAt(grid, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
  return grid[ty][tx];
}

function isSolidTile(ch) {
  return ch === '#' || ch === 'C';
}

/** Slide a circle through the tile grid, axis by axis, so it never enters a solid tile. */
export function moveCircle(grid, entity, dx, dy) {
  const r = entity.radius;
  let nx = entity.x + dx;
  if (dx !== 0) {
    const edge = dx > 0 ? nx + r : nx - r;
    const ty0 = Math.floor((entity.y - r + 1) / TILE);
    const ty1 = Math.floor((entity.y + r - 1) / TILE);
    const tx = Math.floor(edge / TILE);
    let blocked = false;
    for (let ty = ty0; ty <= ty1; ty += 1) {
      if (isSolidTile(tileAt(grid, tx, ty))) { blocked = true; break; }
    }
    if (blocked) nx = dx > 0 ? tx * TILE - r - 0.01 : (tx + 1) * TILE + r + 0.01;
    entity.x = nx;
  }
  let ny = entity.y + dy;
  if (dy !== 0) {
    const edge = dy > 0 ? ny + r : ny - r;
    const tx0 = Math.floor((entity.x - r + 1) / TILE);
    const tx1 = Math.floor((entity.x + r - 1) / TILE);
    const ty = Math.floor(edge / TILE);
    let blocked = false;
    for (let tx = tx0; tx <= tx1; tx += 1) {
      if (isSolidTile(tileAt(grid, tx, ty))) { blocked = true; break; }
    }
    if (blocked) ny = dy > 0 ? ty * TILE - r - 0.01 : (ty + 1) * TILE + r + 0.01;
    entity.y = ny;
  }
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    levelName: '',
    grid: [],
    start: { x: 60, y: 60 },
    exit: { x: 1220, y: 60 },
    guards: [],
    parcels: [],
    shadows: [],
    player: {
      x: 60, y: 60, radius: PLAYER.radius, facing: 0,
      moving: false, running: false, sneaking: false, grace: 0,
    },
    coinsLeft: COIN.perLevel,
    thrown: [],
    pulses: [],
    score: 0,
    lives: LIVES,
    elapsed: 0,
    levelElapsed: 0,
    detection: 0,
    alarmedThisLevel: false,
    ghostLevels: 0,
    noiseTimer: 0,
  };

  function loadLevel(index) {
    const def = LEVEL_DEFS[index];
    state.levelIndex = index;
    state.levelName = def.name;
    state.grid = def.rows.map((row) => row.split(''));
    state.shadows = def.shadows;
    state.parcels = def.parcels.map((p) => ({ x: p.x, y: p.y, taken: false }));
    for (let ty = 0; ty < ROWS; ty += 1) {
      for (let tx = 0; tx < COLS; tx += 1) {
        const ch = state.grid[ty][tx];
        if (ch === 'P') state.start = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
        if (ch === 'E') state.exit = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      }
    }
    state.player.x = state.start.x;
    state.player.y = state.start.y;
    state.player.facing = 0;
    state.player.grace = 0;
    state.guards = def.guards.map((g) => createGuard(g, index, random));
    state.coinsLeft = COIN.perLevel;
    state.thrown = [];
    state.pulses = [];
    state.levelElapsed = 0;
    state.detection = 0;
    state.alarmedThisLevel = false;
    state.noiseTimer = 0;
  }

  function reset() {
    state.score = 0;
    state.lives = LIVES;
    state.elapsed = 0;
    state.ghostLevels = 0;
    loadLevel(0);
  }

  function solidAtPx(x, y) {
    return isSolidTile(tileAt(state.grid, Math.floor(x / TILE), Math.floor(y / TILE)));
  }

  /** True when the straight line between two points crosses a wall or a crate. */
  function lineBlocked(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 6));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (solidAtPx(x0 + dx * t, y0 + dy * t)) return true;
    }
    return false;
  }

  function inShadow(x, y) {
    for (const s of state.shadows) {
      if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return true;
    }
    return false;
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  /** Can this guard see the point (x, y)? A shadow point shrinks the guard's range. */
  function guardCanSee(guard, x, y) {
    const dx = x - guard.x;
    const dy = y - guard.y;
    const dist = Math.hypot(dx, dy);
    const range = guard.visionRange * (inShadow(x, y) ? GUARD.shadowRangeFactor : 1);
    if (dist > range) return false;
    if (dist > 1 && angleDiff(Math.atan2(dy, dx), guard.dir) > GUARD.visionHalfAngle) return false;
    return !lineBlocked(guard.x, guard.y, x, y);
  }

  function guardSeesPlayer() {
    for (const guard of state.guards) {
      if (guardCanSee(guard, state.player.x, state.player.y)) return true;
    }
    return false;
  }

  function pointSeenByGuards(x, y) {
    for (const guard of state.guards) {
      if (guardCanSee(guard, x, y)) return true;
    }
    return false;
  }

  function nearestGuardDistance() {
    let best = Infinity;
    for (const guard of state.guards) {
      best = Math.min(best, Math.hypot(guard.x - state.player.x, guard.y - state.player.y));
    }
    return best;
  }

  function throwCoin(target) {
    if (state.coinsLeft <= 0) return false;
    const dx = target.x - state.player.x;
    const dy = target.y - state.player.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, COIN.throwRange);
    const nx = dist === 0 ? state.player.x : state.player.x + (dx / dist) * clamped;
    const ny = dist === 0 ? state.player.y : state.player.y + (dy / dist) * clamped;
    state.coinsLeft -= 1;
    state.thrown.push({ sx: state.player.x, sy: state.player.y, x: state.player.x, y: state.player.y, tx: nx, ty: ny, t: 0, dur: 0.35, landed: false, ringTtl: 0 });
    return true;
  }

  function investigate(x, y, radius, minAlert) {
    for (const guard of state.guards) {
      const dist = Math.hypot(guard.x - x, guard.y - y);
      if (dist <= radius) {
        guard.state = 'suspect';
        guard.lastSeen = { x, y };
        guard.alert = Math.max(guard.alert, minAlert);
        guard.waitTimer = 0;
      }
    }
  }

  /**
   * One fixed step. `input` is { dir: {x, y}, sneak, running, clicks: [{x, y}] }
   * with clicks already in field coordinates. With `harmless` set (the title
   * screen's backdrop) guards patrol but nothing can catch the courier or
   * finish a level. Returns EVENT_* flags.
   */
  function step(dt, input, harmless = false) {
    let events = 0;
    state.elapsed += dt;
    state.levelElapsed += dt;
    const player = state.player;
    if (player.grace > 0) player.grace = Math.max(0, player.grace - dt);

    movePlayer(state, dt, input, moveCircle);

    for (const click of input.clicks) throwCoin(click);

    // Thrown coins fly, land with a clink, and draw guards to the spot.
    for (const coin of state.thrown) {
      if (coin.landed) {
        coin.ringTtl -= dt;
        continue;
      }
      coin.t += dt;
      const k = Math.min(1, coin.t / coin.dur);
      coin.x = coin.sx + (coin.tx - coin.sx) * k;
      coin.y = coin.sy + (coin.ty - coin.sy) * k;
      if (coin.t >= coin.dur) {
        coin.landed = true;
        coin.ringTtl = 1;
        state.pulses.push({ x: coin.tx, y: coin.ty, r: COIN.clinkRadius, ttl: 1 });
        investigate(coin.tx, coin.ty, COIN.clinkRadius, DETECT.suspiciousAt);
        events |= EVENT_CLINK;
      }
    }
    state.thrown = state.thrown.filter((c) => !c.landed || c.ringTtl > 0);
    // Keep at most the last few landed coins on the floor.
    if (state.thrown.length > 8) state.thrown.splice(0, state.thrown.length - 8);

    // Running is loud: a noise pulse every half second draws nearby guards.
    if (player.moving && player.running) {
      state.noiseTimer -= dt;
      if (state.noiseTimer <= 0) {
        state.noiseTimer = 0.45;
        state.pulses.push({ x: player.x, y: player.y, r: PLAYER.runNoise, ttl: 0.6 });
        investigate(player.x, player.y, PLAYER.runNoise, DETECT.suspiciousAt);
      }
    }
    for (const pulse of state.pulses) pulse.ttl -= dt;
    state.pulses = state.pulses.filter((p) => p.ttl > 0);

    const guardEvents = updateGuards(state, dt, {
      guardCanSee,
      inShadow,
      lineBlocked,
      investigate,
      moveCircle,
      grid: state.grid,
    });
    events |= guardEvents.events;
    if (guardEvents.alarm) {
      state.alarmedThisLevel = true;
      events |= EVENT_ALARM;
    }
    if (guardEvents.suspicious) events |= EVENT_SUSPICIOUS;

    state.detection = 0;
    for (const guard of state.guards) state.detection = Math.max(state.detection, guard.alert);

    // Parcels: optional pickups worth points.
    for (const parcel of state.parcels) {
      if (parcel.taken) continue;
      if (Math.hypot(parcel.x - player.x, parcel.y - player.y) < 28) {
        parcel.taken = true;
        state.score += SCORE.parcel;
        events |= EVENT_PICKUP;
      }
    }

    // Caught: an alarming guard that reaches the player.
    if (!harmless && guardEvents.caught && player.grace === 0) {
      state.lives -= 1;
      events |= EVENT_CAUGHT;
      if (state.lives <= 0) {
        events |= EVENT_OVER;
      } else {
        player.x = state.start.x;
        player.y = state.start.y;
        player.grace = PLAYER.caughtGrace;
        for (const guard of state.guards) {
          guard.state = 'patrol';
          guard.alert = 0;
          guard.x = guard.patrol[0].x;
          guard.y = guard.patrol[0].y;
          guard.wpIndex = 1 % guard.patrol.length;
          guard.waitTimer = 0;
        }
        state.detection = 0;
      }
    }

    // Exit: reach the green door to finish the level.
    if (!harmless && Math.abs(player.x - state.exit.x) < 26 && Math.abs(player.y - state.exit.y) < 26) {
      const timeBonus = Math.max(0, SCORE.timeBonusStart - Math.floor(state.levelElapsed) * SCORE.timeBonusPerSecond);
      const ghost = state.alarmedThisLevel ? 0 : SCORE.ghostBonus;
      state.score += SCORE.levelComplete + timeBonus + ghost;
      if (!state.alarmedThisLevel) state.ghostLevels += 1;
      if (state.levelIndex + 1 >= LEVELS) events |= EVENT_WIN;
      else events |= EVENT_LEVEL;
    }
    return events;
  }

  reset();
  return {
    state,
    reset,
    loadLevel,
    step,
    solidAtPx,
    lineBlocked,
    inShadow,
    guardCanSee,
    guardSeesPlayer,
    pointSeenByGuards,
    nearestGuardDistance,
  };
}
