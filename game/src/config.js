// Every tuning number and colour for Night Courier in one place. The
// playfield is a fixed 1280x720 logical area, drawn on a 32x18 grid of 40px
// tiles; the renderer scales it to the window, so no rule below depends on
// the screen size.

export const FIELD = { width: 1280, height: 720 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 150,
  sneakSpeed: 85,
  runSpeed: 215,
  /** Noise radius while running; walking is quiet, sneaking is silent. */
  runNoise: 95,
  /** Seconds of grace after being caught before the player can be caught again. */
  caughtGrace: 1.5,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 72,
  suspectSpeed: 112,
  chaseSpeed: 205,
  /** How far a guard can see, in pixels, in the open. */
  visionRange: 235,
  /** Half-angle of the vision cone, in radians. */
  visionHalfAngle: 0.62,
  /** A player standing in a shadow zone shrinks the guard's range by this factor. */
  shadowRangeFactor: 0.55,
  /** Catch distance: closer than this while the guard is chasing means caught. */
  catchDistance: 27,
  /** Seconds a guard stares at the last seen spot before giving up. */
  lookAroundSeconds: 2.2,
  /** Seconds of no sight before an alarming guard drops back to suspicious. */
  alarmMemorySeconds: 3,
};

export const DETECT = {
  /** Alert (0-100) gained per second when fully seen at point blank. */
  risePerSecond: 58,
  /** Alert lost per second while unseen. */
  decayPerSecond: 16,
  /** Extra decay per second while the player is hidden in shadow. */
  shadowDecayBonus: 16,
  /** Sneaking halves how fast the meter fills; running fills it half again as fast. */
  sneakFactor: 0.5,
  runFactor: 1.5,
  /** Alert at which a guard turns suspicious and comes to look. */
  suspiciousAt: 35,
  /** Alert at which the guard raises the alarm and chases. */
  alarmAt: 100,
};

export const COIN = {
  /** Coins carried per level. Click to throw one at the mouse position. */
  perLevel: 5,
  /** Furthest a thrown coin can land from the player. */
  throwRange: 330,
  /** How far the clink of a landing coin carries: guards inside it investigate. */
  clinkRadius: 150,
};

export const LIVES = 3;
export const LEVELS = 3;

/** Points for finishing a level, plus a time bonus and a ghost bonus. */
export const SCORE = {
  levelComplete: 100,
  parcel: 50,
  ghostBonus: 250,
  /** Time bonus starts here and falls by 2 points a second. */
  timeBonusStart: 300,
  timeBonusPerSecond: 2,
};

export const PALETTE = {
  backdrop: '#0a0d14',
  floorA: '#232a38',
  floorB: '#202634',
  floorLine: '#2c3446',
  wall: '#3a4358',
  wallTop: '#565f78',
  crate: '#7a5a34',
  crateEdge: '#a07d4a',
  shadow: '#0e1424',
  shadowEdge: '#1d2a4a',
  exit: '#39d98a',
  exitGlow: '#1d7a4c',
  player: '#37e0c8',
  playerDark: '#1a8a7c',
  guard: '#ff5d4d',
  guardDark: '#a02c20',
  coneCalm: 'rgba(255, 214, 90, 0.20)',
  coneSuspicious: 'rgba(255, 166, 40, 0.34)',
  coneAlarm: 'rgba(255, 70, 50, 0.42)',
  parcel: '#e8b64c',
  coin: '#ffd94a',
  noise: 'rgba(120, 200, 255, 0.35)',
  panel: '#141a26',
  text: '#eef1f5',
  muted: '#93a0b8',
  danger: '#ff6b5e',
  calm: '#7ee2a8',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'night-courier.best';
