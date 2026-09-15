export const SLOT_COUNT = 10;
export const STARTING_HEALTH = 100;
export const STARTING_HEIGHT = 0;
export const ROCK_MIN_HEIGHT = 1;
export const ROCK_MAX_HEIGHT = 50;

const ROCK_START_POSITION = 1.035;
const ROCK_END_POSITION = 0.05;
const ROCK_SPEED_PER_SECOND = 0.13;
export const PATH_REVIEW_SECONDS = 0.8;
export const WALK_STEP_SECONDS = 0.55;
export const CAMERA_TRANSITION_SECONDS = 0.9;
export const CAMERA_HORIZONTAL_SHIFT = 320;
export const CAMERA_VERTICAL_SHIFT = 190;

export function speedMultiplierForSections(completedSections) {
  const safeSections = Number.isFinite(completedSections)
    ? Math.max(0, Math.floor(completedSections))
    : 0;
  return Math.min(200, 100 + safeSections * 5) / 100;
}

function createMovingRock(random) {
  return {
    height: randomRockHeight(random),
    position: ROCK_START_POSITION,
    fixedSlot: null,
  };
}

export function randomRockHeight(random = Math.random) {
  const sample = Number(random());
  const safeSample = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 0.999999999999)
    : 0;

  return Math.floor(safeSample * ROCK_MAX_HEIGHT) + ROCK_MIN_HEIGHT;
}

export function calculateDropDamage(previousHeight, nextHeight) {
  const from = Number.isFinite(previousHeight) ? previousHeight : 0;
  const to = Number.isFinite(nextHeight) ? nextHeight : 0;
  return Math.max(0, from - to);
}

export function calculateAscendingRecovery(previousHeight, nextHeight, currentStreak = 0) {
  if (!Number.isFinite(previousHeight) || !Number.isFinite(nextHeight) || nextHeight <= previousHeight) {
    return { streak: 0, recovery: 0 };
  }

  const streak = Math.max(0, Math.floor(currentStreak)) + 1;
  return { streak, recovery: 2 ** streak - 1 };
}

export function cameraOffsetForProgress(progress) {
  const safeProgress = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return {
    x: safeProgress === 0 ? 0 : -CAMERA_HORIZONTAL_SHIFT * safeProgress,
    y: CAMERA_VERTICAL_SHIFT * safeProgress,
  };
}

export function findDangerousDrops(slots) {
  const drops = [];
  for (let fromIndex = 0; fromIndex < slots.length - 1; fromIndex += 1) {
    const damage = calculateDropDamage(slots[fromIndex], slots[fromIndex + 1]);
    if (damage > 0) {
      drops.push({ fromIndex, toIndex: fromIndex + 1, damage });
    }
  }
  return drops;
}

export function createInitialState() {
  return {
    screen: "start",
    phase: "idle",
    health: STARTING_HEALTH,
    baseHeight: STARTING_HEIGHT,
    currentHeight: STARTING_HEIGHT,
    slots: Array(SLOT_COUNT).fill(null),
    currentRock: null,
    highlightedSlot: null,
    placementCount: 0,
    lastPlacement: null,
    dangerousDrops: [],
    pathReviewRemaining: 0,
    characterSlot: -1,
    walkProgress: 0,
    walkedSlots: 0,
    lastDamage: 0,
    ascendingStreak: 0,
    lastHealing: 0,
    completedSections: 0,
    rockSpeedMultiplier: 1,
    cameraTransitionRemaining: 0,
    cameraTransitionProgress: 0,
  };
}

export function startGame(state, random = Math.random) {
  if (state.screen !== "start") {
    return false;
  }

  state.screen = "game";
  state.phase = "placing";
  state.health = STARTING_HEALTH;
  state.baseHeight = STARTING_HEIGHT;
  state.currentHeight = STARTING_HEIGHT;
  state.slots = Array(SLOT_COUNT).fill(null);
  state.currentRock = createMovingRock(random);
  state.highlightedSlot = null;
  state.placementCount = 0;
  state.lastPlacement = null;
  state.dangerousDrops = [];
  state.pathReviewRemaining = 0;
  state.characterSlot = -1;
  state.walkProgress = 0;
  state.walkedSlots = 0;
  state.lastDamage = 0;
  state.ascendingStreak = 0;
  state.lastHealing = 0;
  state.completedSections = 0;
  state.rockSpeedMultiplier = 1;
  state.cameraTransitionRemaining = 0;
  state.cameraTransitionProgress = 0;
  return true;
}

export function nearestSlotIndex(position) {
  if (!Number.isFinite(position) || position < 0 || position > 1) {
    return null;
  }

  return Math.min(SLOT_COUNT - 1, Math.max(0, Math.floor(position * SLOT_COUNT)));
}

function finishPlacement(state, slotIndex, method, random) {
  const placedHeight = state.currentRock.height;
  state.slots[slotIndex] = placedHeight;
  state.placementCount += 1;
  state.lastPlacement = { slotIndex, height: placedHeight, method };
  state.highlightedSlot = null;

  if (state.placementCount === SLOT_COUNT) {
    state.phase = "path-review";
    state.currentRock = null;
    state.dangerousDrops = findDangerousDrops(state.slots);
    state.pathReviewRemaining = PATH_REVIEW_SECONDS;
    state.characterSlot = -1;
    state.walkProgress = 0;
    return true;
  }

  state.currentRock = createMovingRock(random);
  state.phase = "placing";
  return true;
}

export function autoPlaceCurrentRock(state, random = Math.random) {
  if (state.phase !== "placing" || !state.currentRock) {
    return false;
  }

  const leftmostEmptySlot = state.slots.findIndex((height) => height === null);
  if (leftmostEmptySlot < 0) {
    return false;
  }

  return finishPlacement(state, leftmostEmptySlot, "automatic", random);
}

export function advanceRock(state, elapsedSeconds, random = Math.random) {
  if (state.phase !== "placing" || !state.currentRock) {
    return false;
  }

  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const nextPosition =
    state.currentRock.position - ROCK_SPEED_PER_SECOND * state.rockSpeedMultiplier * safeElapsed;
  if (nextPosition <= ROCK_END_POSITION) {
    state.currentRock.position = ROCK_END_POSITION;
    return autoPlaceCurrentRock(state, random);
  }

  state.currentRock.position = nextPosition;
  const nearestSlot = nearestSlotIndex(state.currentRock.position);
  state.highlightedSlot = nearestSlot !== null && state.slots[nearestSlot] === null ? nearestSlot : null;
  return true;
}

export function placeCurrentRock(state, random = Math.random) {
  if (
    state.phase !== "placing" ||
    !state.currentRock ||
    state.highlightedSlot === null ||
    state.slots[state.highlightedSlot] !== null
  ) {
    return false;
  }

  return finishPlacement(state, state.highlightedSlot, "manual", random);
}

function landOnNextRock(state) {
  const nextSlot = state.characterSlot + 1;
  if (nextSlot >= SLOT_COUNT) {
    return false;
  }

  const previousHeight = state.characterSlot < 0 ? 0 : state.slots[state.characterSlot];
  const nextHeight = state.slots[nextSlot];
  const damage = calculateDropDamage(previousHeight, nextHeight);
  const ascent = state.characterSlot < 0
    ? { streak: 0, recovery: 0 }
    : calculateAscendingRecovery(previousHeight, nextHeight, state.ascendingStreak);
  state.health = Math.max(0, state.health - damage);
  state.ascendingStreak = ascent.streak;
  state.lastHealing = Math.min(ascent.recovery, STARTING_HEALTH - state.health);
  state.health += state.lastHealing;
  state.lastDamage = damage;
  state.characterSlot = nextSlot;
  state.currentHeight = state.baseHeight + nextHeight;
  state.walkedSlots += 1;

  if (state.health === 0) {
    state.phase = "game-over";
  } else if (nextSlot === SLOT_COUNT - 1) {
    state.baseHeight = state.currentHeight;
    state.completedSections += 1;
    state.rockSpeedMultiplier = speedMultiplierForSections(state.completedSections);
    state.phase = "camera-transition";
    state.cameraTransitionRemaining = CAMERA_TRANSITION_SECONDS;
    state.cameraTransitionProgress = 0;
  }
  return true;
}

export function advanceWalk(state, elapsedSeconds) {
  if (state.phase !== "path-review" && state.phase !== "walking") {
    return false;
  }

  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  if (state.phase === "path-review") {
    state.pathReviewRemaining = Math.max(0, state.pathReviewRemaining - safeElapsed);
    if (state.pathReviewRemaining === 0) {
      state.phase = "walking";
      state.walkProgress = 0;
    }
    return true;
  }

  state.walkProgress += safeElapsed / WALK_STEP_SECONDS;
  while (state.walkProgress >= 1 && state.phase === "walking") {
    state.walkProgress -= 1;
    landOnNextRock(state);
  }

  if (state.phase !== "walking") {
    state.walkProgress = 0;
  }
  return true;
}

export function advanceCameraTransition(state, elapsedSeconds, random = Math.random) {
  if (state.phase !== "camera-transition") {
    return false;
  }

  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  state.cameraTransitionRemaining = Math.max(0, state.cameraTransitionRemaining - safeElapsed);
  state.cameraTransitionProgress = Math.min(
    1,
    1 - state.cameraTransitionRemaining / CAMERA_TRANSITION_SECONDS,
  );

  if (state.cameraTransitionRemaining > 0) {
    return true;
  }

  state.phase = "placing";
  state.slots = Array(SLOT_COUNT).fill(null);
  state.currentRock = createMovingRock(random);
  state.highlightedSlot = null;
  state.placementCount = 0;
  state.lastPlacement = null;
  state.dangerousDrops = [];
  state.pathReviewRemaining = 0;
  state.characterSlot = -1;
  state.walkProgress = 0;
  state.lastDamage = 0;
  state.ascendingStreak = 0;
  state.lastHealing = 0;
  state.cameraTransitionRemaining = 0;
  state.cameraTransitionProgress = 0;
  return true;
}
