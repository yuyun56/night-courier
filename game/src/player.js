// The courier's movement: walk, sneak (Shift: slow and silent) or run
// (hold Space while moving: fast and loud). Sneaking and running are just
// speeds and a noise flag; the world turns the noise into guard attention.
import { FIELD, PLAYER } from './config.js';

/**
 * Move the player one fixed step. `moveCircle` is the world's tile
 * collision helper. `input` is { dir: {x, y}, sneak, running }.
 */
export function movePlayer(state, dt, input, moveCircle) {
  const player = state.player;
  const dir = input.dir;
  player.sneaking = input.sneak;
  player.running = input.running && !input.sneak && (dir.x !== 0 || dir.y !== 0);
  player.moving = dir.x !== 0 || dir.y !== 0;
  const speed = input.sneak ? PLAYER.sneakSpeed : player.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
  if (player.moving) {
    player.facing = Math.atan2(dir.y, dir.x);
    moveCircle(state.grid, player, dir.x * speed * dt, dir.y * speed * dt);
    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y));
  }
}
