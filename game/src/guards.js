// Guard behaviour: patrols you can learn, suspicion that gives you a chance
// to recover, and an alarm that chases. A guard's alert meter (0-100) fills
// while it can see the courier and drains while it cannot; at 35 it turns
// suspicious and comes to look at the last seen spot, at 100 it raises the
// alarm and chases. Guards never see through walls or crates, and a courier
// standing in shadow is harder to spot from far away.
import { DETECT, GUARD, PLAYER } from './config.js';

/** A guard starts on its first waypoint, walking toward the second. */
export function createGuard(def, levelIndex, random) {
  const patrol = def.patrol.map((p) => ({ x: p.x, y: p.y }));
  const first = patrol[0];
  const second = patrol[1] ?? patrol[0];
  return {
    x: first.x,
    y: first.y,
    radius: GUARD.radius,
    dir: Math.atan2(second.y - first.y, second.x - first.x),
    patrol,
    wpIndex: 1 % patrol.length,
    state: 'patrol', // patrol | suspect | alarm
    alert: 0,
    lastSeen: { x: first.x, y: first.y },
    waitTimer: 0,
    lookTimer: 0,
    unseenTimer: 0,
    stepTimer: 0,
    footstep: false,
    patrolSpeed: GUARD.patrolSpeed + levelIndex * 8,
    visionRange: GUARD.visionRange + levelIndex * 10,
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(guard, targetAngle, dt, rate) {
  const diff = angleDiff(targetAngle, guard.dir);
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  guard.dir += step;
}

function moveToward(guard, ctx, tx, ty, speed, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return true;
  const step = Math.min(dist, speed * dt);
  const nx = guard.x + (dx / dist) * step;
  const ny = guard.y + (dy / dist) * step;
  // Guards slide along walls and crates like the courier: a chase that
  // meets a wall stops at it instead of walking through it.
  ctx.moveCircle(ctx.grid, guard, nx - guard.x, ny - guard.y);
  guard.dir = Math.atan2(dy, dx);
  return dist - step < 2;
}

/**
 * Advance every guard one fixed step. `ctx` carries the world's helpers:
 * guardCanSee(guard, x, y), inShadow(x, y), lineBlocked and investigate.
 * Returns { events, alarm, suspicious, caught } for the world to fold in.
 */
export function updateGuards(state, dt, ctx) {
  const player = state.player;
  const result = { events: 0, alarm: false, suspicious: false, caught: false };
  const playerInShadow = ctx.inShadow(player.x, player.y);

  for (const guard of state.guards) {
    const seen = ctx.guardCanSee(guard, player.x, player.y);
    const dist = Math.hypot(player.x - guard.x, player.y - guard.y);

    if (seen) {
      // Closer and louder is easier to spot: the meter fills faster up close,
      // slower while sneaking or in shadow, faster while running.
      const closeness = 1 - (dist / guard.visionRange) * 0.7;
      let rate = DETECT.risePerSecond * Math.max(0.25, closeness);
      if (player.sneaking) rate *= DETECT.sneakFactor;
      if (player.running) rate *= DETECT.runFactor;
      if (playerInShadow) rate *= 0.55;
      guard.alert = Math.min(100, guard.alert + rate * dt);
      guard.lastSeen = { x: player.x, y: player.y };
      guard.unseenTimer = 0;
      if (guard.alert >= DETECT.alarmAt && guard.state !== 'alarm') {
        guard.state = 'alarm';
        result.alarm = true;
      } else if (guard.alert >= DETECT.suspiciousAt && guard.state === 'patrol') {
        guard.state = 'suspect';
        result.suspicious = true;
      }
    } else {
      // Unseen, the meter drains — faster while the courier hides in shadow.
      let decay = DETECT.decayPerSecond;
      if (playerInShadow) decay += DETECT.shadowDecayBonus;
      guard.alert = Math.max(0, guard.alert - decay * dt);
      guard.unseenTimer += dt;
      if (guard.state === 'alarm' && guard.unseenTimer > GUARD.alarmMemorySeconds) {
        guard.state = 'suspect';
        guard.alert = Math.min(guard.alert, DETECT.suspiciousAt + 15);
      } else if (guard.state === 'suspect' && guard.alert < 20) {
        guard.state = 'patrol';
      }
    }

    // Footsteps: a guard's step ticks on a cadence set by its speed, so the
    // player can hear how close a guard is even off-screen.
    const speed = guard.state === 'alarm' ? GUARD.chaseSpeed : guard.state === 'suspect' ? GUARD.suspectSpeed : guard.patrolSpeed;
    guard.stepTimer -= dt;
    guard.footstep = false;
    if (guard.stepTimer <= 0) {
      guard.stepTimer = 0.55;
      guard.footstep = true;
    }

    if (guard.state === 'patrol') {
      const target = guard.patrol[guard.wpIndex];
      if (guard.waitTimer > 0) {
        guard.waitTimer -= dt;
        // Look around at the end of a patrol leg before turning back.
        turnToward(guard, guard.dir + Math.PI * 0.6 * dt, dt, 1.2);
      } else if (moveToward(guard, ctx, target.x, target.y, guard.patrolSpeed, dt)) {
        guard.wpIndex = (guard.wpIndex + 1) % guard.patrol.length;
        guard.waitTimer = 0.6;
      }
    } else if (guard.state === 'suspect') {
      const arrived = moveToward(guard, ctx, guard.lastSeen.x, guard.lastSeen.y, GUARD.suspectSpeed, dt);
      if (arrived) {
        guard.lookTimer += dt;
        // Sweep the cone around the last seen spot, then give up.
        turnToward(guard, guard.dir + Math.PI * dt, dt, 1.6);
        if (guard.lookTimer > GUARD.lookAroundSeconds) {
          guard.lookTimer = 0;
          guard.state = 'patrol';
          guard.alert = Math.min(guard.alert, 20);
        }
      } else {
        guard.lookTimer = 0;
      }
    } else {
      // Alarm: chase the courier. Catching means touching distance.
      moveToward(guard, ctx, player.x, player.y, GUARD.chaseSpeed, dt);
      if (dist < GUARD.catchDistance && player.grace === 0) result.caught = true;
    }
  }
  return result;
}
