// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens: title,
// play, paused, level clear, game over and victory.
//
// ?seed=N fixes the random pattern. ?shot=cover|hide|level2|exit (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_ALARM,
  EVENT_CAUGHT,
  EVENT_CLINK,
  EVENT_LEVEL,
  EVENT_OVER,
  EVENT_PICKUP,
  EVENT_SUSPICIOUS,
  EVENT_WIN,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_LEVEL, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let ownStepTimer = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each catch.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing level 1, ${world.state.levelName}. ${LIVES} lives.`);
  }

  function nextLevel() {
    audio.unlock();
    world.loadLevel(world.state.levelIndex + 1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Level ${world.state.levelIndex + 1}, ${world.state.levelName}.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `All deliveries made. Score ${world.state.score}. Best ${best}.` : `Caught. Score ${world.state.score}. Best ${best}.`);
  }

  function playSounds(events) {
    if (events & EVENT_CLINK) audio.clink();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SUSPICIOUS) audio.suspicious();
    if (events & EVENT_ALARM) audio.alarm();
    if (events & EVENT_CAUGHT) audio.caught();
    if (events & EVENT_LEVEL) audio.levelClear();
    if (events & EVENT_WIN) audio.win();
    for (const guard of world.state.guards) {
      if (guard.footstep) {
        audio.footstep(Math.hypot(guard.x - world.state.player.x, guard.y - world.state.player.y));
      }
    }
    if (world.state.player.moving && world.state.player.running) {
      ownStepTimer -= STEP;
      if (ownStepTimer <= 0) {
        ownStepTimer = 0.3;
        audio.ownStep();
      }
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    audio.unlock();
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_LEVEL) nextLevel();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title screen's backdrop: guards patrol, but nothing can catch
      // the courier or finish a level while the game has not started.
      world.step(STEP, { dir: { x: 0, y: 0 }, sneak: false, running: false, clicks: [] }, true);
      return;
    }
    const clicks = input.takeClicks().map((click) => renderer.toField(click.x, click.y));
    const events = world.step(STEP, {
      dir: input.direction(),
      sneak: input.sneaking(),
      running: input.running(),
      clicks,
    });
    playSounds(events);
    if (events & EVENT_OVER) endGame(false);
    else if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_LEVEL) {
      screen = SCREEN_LEVEL;
      announce(`Level clear. Score ${world.state.score}.`);
    } else if (events & EVENT_CAUGHT) {
      announce(world.state.lives === 1 ? 'Caught. 1 life left.' : `Caught. ${world.state.lives} lives left.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Night Courier. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
