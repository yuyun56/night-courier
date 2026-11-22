// The screenshot scenes behind ?shot=cover|hide|level2|exit. Each one plays
// the real rules forward from a fresh world, steered by an autopilot that
// walks the courier along a safe route, waits when a guard's cone covers the
// next step, and sneaks when a guard is near — so the frame is what a short
// game really looks like, and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';

/** Hard cap per scene, in seconds of simulated play. */
const LIMIT_SECONDS = 90;

/** Steer toward `target`; wait (crouched) when the next step is watched. */
function autopilot(world, target, memory) {
  const state = world.state;
  const player = state.player;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 14) return { dir: { x: 0, y: 0 }, sneak: true, running: false, arrived: true };

  // Nearly caught: fall back to the nearest shadow and let the meter drain.
  if (state.detection > 85 && !world.inShadow(player.x, player.y)) {
    let best = null;
    let bestDist = Infinity;
    for (const s of state.shadows) {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const d = Math.hypot(cx - player.x, cy - player.y);
      if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
    }
    if (best) {
      const bx = best.x - player.x;
      const by = best.y - player.y;
      const bl = Math.hypot(bx, by) || 1;
      return { dir: { x: bx / bl, y: by / bl }, sneak: true, running: false, arrived: false };
    }
  }

  const dir = { x: dx / dist, y: dy / dist };
  const probe = { x: player.x + dir.x * 90, y: player.y + dir.y * 90 };
  const seen = world.guardSeesPlayer();
  if (!seen && world.pointSeenByGuards(probe.x, probe.y)) {
    memory.wait += 1;
    // A watched step is worth waiting for — but not forever.
    if (memory.wait < 5 / STEP) {
      return { dir: { x: 0, y: 0 }, sneak: true, running: false, arrived: false };
    }
  } else {
    memory.wait = 0;
  }
  const sneak = world.nearestGuardDistance() < 340;
  return { dir, sneak, running: false, arrived: false };
}

function runRoute(world, waypoints, opts = {}) {
  const memory = { wait: 0 };
  let index = 0;
  const limit = LIMIT_SECONDS / STEP;
  for (let i = 0; i < limit && index < waypoints.length; i += 1) {
    const target = waypoints[index];
    if (opts.direct) {
      const player = world.state.player;
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 14) {
        index += 1;
        continue;
      }
      world.step(STEP, { dir: { x: dx / dist, y: dy / dist }, sneak: false, running: true, clicks: [] });
      continue;
    }
    const move = autopilot(world, target, memory);
    if (move.arrived) {
      index += 1;
      continue;
    }
    world.step(STEP, { dir: move.dir, sneak: move.sneak, running: move.running, clicks: [] });
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Any other name is the cover scene.
 */
export function stageShot(name, world) {
  if (name === 'level2') {
    world.loadLevel(1);
    runRoute(world, [
      { x: 60, y: 380 },
      { x: 640, y: 380 },
      { x: 640, y: 360 },
    ]);
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'hide') {
    // Peek from the lane just north of the guard's route, close to the
    // wall's east end, until the meter climbs, then break east around the
    // wall and south behind it: a near miss, with the meter showing
    // SUSPICIOUS and the guard close behind.
    world.reset();
    runRoute(world, [{ x: 820, y: 60 }]);
    // Stop the peek early, while the guard is still only curious (below
    // the 35 suspicion line): a suspicious guard would walk straight at the
    // courier's exact spot and catch a player that stands still. Break out
    // early, too, if the guard closes in before the meter gets there.
    const limit = 20 / STEP;
    for (let i = 0; i < limit && world.state.detection < 25; i += 1) {
      const guard = world.state.guards[0];
      const near = Math.hypot(guard.x - world.state.player.x, guard.y - world.state.player.y) < 160;
      if (near) break;
      world.step(STEP, { dir: { x: 0, y: 0 }, sneak: true, running: false, clicks: [] });
    }
    // Break east around the wall's end, then south behind it, at a run:
    // the guard loses sight and the meter is still high when the frame is
    // taken. (Straight south would run into the wall's north face.)
    runRoute(world, [{ x: 860, y: 60 }, { x: 860, y: 200 }], { direct: true });
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'exit') {
    // Walk the patient route along the south edge and up the east wall to
    // the green door, waiting out each watched step.
    world.reset();
    runRoute(world, [
      { x: 60, y: 340 },
      { x: 220, y: 340 },
      { x: 220, y: 620 },
      { x: 1220, y: 620 },
      { x: 1220, y: 90 },
    ]);
    return { screen: SCREEN_PLAY, best: 0 };
  }

  // Cover: the courier mid-level among the crates, guards patrolling with
  // their cones out, the exit glowing in the far corner.
  world.reset();
  runRoute(world, [
    { x: 60, y: 340 },
    { x: 500, y: 340 },
    { x: 500, y: 300 },
  ]);
  return { screen: SCREEN_PLAY, best: 0 };
}
