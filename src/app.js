import { createGameController } from "./game-controller.js";
import { SLOT_COUNT, bounceHeightForProgress, cameraOffsetForProgress } from "./game-state.js";
import { createBestRecordStore } from "./record-store.js";
import { createTutorialStore } from "./tutorial-store.js";

const LOGICAL_WIDTH = 1600;
const LOGICAL_HEIGHT = 900;
const BOARD = Object.freeze({ x: 286, y: 650, width: 1190, height: 128 });
const SLOT_GAP = 10;
const SLOT_WIDTH = (BOARD.width - SLOT_GAP * (SLOT_COUNT - 1)) / SLOT_COUNT;

export function bootstrapGame(
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  performanceRef = globalThis.performance,
) {
const startScreen = documentRef.querySelector("#start-screen");
const gameScreen = documentRef.querySelector("#game-screen");
const startButton = documentRef.querySelector("#start-button");
const canvas = documentRef.querySelector("#game-canvas");
const healthValue = documentRef.querySelector("#health-value");
const heightValue = documentRef.querySelector("#height-value");
const gameStatus = documentRef.querySelector("#game-status");
const exitButton = documentRef.querySelector("#exit-button");
const restartButton = documentRef.querySelector("#restart-button");
const resetRecordButton = documentRef.querySelector("#reset-record-button");
const resultOverlay = documentRef.querySelector("#result-overlay");
const resultHeight = documentRef.querySelector("#result-height");
const resultWalked = documentRef.querySelector("#result-walked");
const resultBestHeight = documentRef.querySelector("#result-best-height");
const resultBestWalked = documentRef.querySelector("#result-best-walked");
const startBestHeight = documentRef.querySelector("#start-best-height");
const startBestWalked = documentRef.querySelector("#start-best-walked");
const startStorageWarning = documentRef.querySelector("#start-storage-warning");
const resultStorageWarning = documentRef.querySelector("#result-storage-warning");
const startHelpButton = documentRef.querySelector("#start-help-button");
const gameHelpButton = documentRef.querySelector("#game-help-button");
const tutorialOverlay = documentRef.querySelector("#tutorial-overlay");
const tutorialStepNumber = documentRef.querySelector("#tutorial-step-number");
const tutorialText = documentRef.querySelector("#tutorial-text");
const tutorialNextButton = documentRef.querySelector("#tutorial-next-button");
const orientationOverlay = documentRef.querySelector("#orientation-overlay");
const context = canvas.getContext("2d");
const reduceDecorativeMotion = Boolean(
  windowRef.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
);
let browserStorage = null;
try {
  browserStorage = windowRef.localStorage;
} catch {
  browserStorage = null;
}

function prepareContext() {
  const scaleX = canvas.width / LOGICAL_WIDTH;
  const scaleY = canvas.height / LOGICAL_HEIGHT;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  context.imageSmoothingEnabled = true;
}

function drawBackground() {
  const sky = context.createLinearGradient(0, 0, 0, 650);
  sky.addColorStop(0, "#cdebf4");
  sky.addColorStop(0.54, "#f3dff0");
  sky.addColorStop(1, "#f9efc7");
  context.fillStyle = sky;
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  context.fillStyle = "#fff8cf";
  context.beginPath();
  context.arc(1330, 145, 72, 0, Math.PI * 2);
  context.fill();

  const foliage = [
    [80, 510, 170, "#a8d5ba"], [255, 540, 210, "#bddfb6"],
    [510, 500, 185, "#9fcdb1"], [1100, 525, 230, "#b6dcae"],
    [1380, 500, 210, "#9fcfb5"],
  ];
  for (const [x, y, radius, color] of foliage) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.strokeStyle = "#a97968";
  context.lineWidth = 72;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(100, 900);
  context.bezierCurveTo(170, 700, 80, 490, 230, 320);
  context.moveTo(1500, 900);
  context.bezierCurveTo(1410, 700, 1510, 500, 1370, 340);
  context.stroke();

  context.fillStyle = "#cce5b2";
  context.beginPath();
  context.moveTo(0, 650);
  context.quadraticCurveTo(330, 585, 690, 660);
  context.quadraticCurveTo(1120, 590, 1600, 650);
  context.lineTo(1600, 900);
  context.lineTo(0, 900);
  context.closePath();
  context.fill();

  context.fillStyle = "#89b68e";
  context.fillRect(0, 778, LOGICAL_WIDTH, 122);
  context.fillStyle = "#6e9c7a";
  context.fillRect(0, 778, LOGICAL_WIDTH, 9);
}

function characterFootPosition(state) {
  const start = { x: 132, y: 777 };
  if (state.characterSlot < 0 && state.phase !== "walking") {
    return start;
  }

  const fromSlot = state.characterSlot;
  const toSlot = Math.min(SLOT_COUNT - 1, fromSlot + 1);
  const from = fromSlot < 0
    ? start
    : {
        x: slotX(fromSlot) + SLOT_WIDTH / 2,
        y: BOARD.y + BOARD.height - rockVisualHeight(state.slots[fromSlot]),
      };
  if (state.phase !== "walking" || toSlot === fromSlot) {
    return from;
  }

  const to = {
    x: slotX(toSlot) + SLOT_WIDTH / 2,
    y: BOARD.y + BOARD.height - rockVisualHeight(state.slots[toSlot]),
  };
  const progress = state.walkProgress * state.walkProgress * (3 - 2 * state.walkProgress);
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function cameraOffsetToAlignCharacter(state) {
  const start = { x: 132, y: 777 };
  const character = characterFootPosition(state);
  return cameraOffsetForProgress(
    state.cameraTransitionProgress,
    start.x - character.x,
    start.y - character.y,
  );
}

function drawSquirrel(state) {
  const position = characterFootPosition(state);
  const x = position.x;
  const ground = position.y;
  const bounce = state.phase === "walking" ? bounceHeightForProgress(state.walkProgress) : 0;
  const centerY = ground - 28 - bounce;

  context.save();
  context.fillStyle = "rgba(42, 23, 32, 0.28)";
  context.beginPath();
  context.ellipse(x, ground + 3, 28 - bounce * 0.16, 7, 0, 0, Math.PI * 2);
  context.fill();

  const fur = state.phase === "game-over" ? "#a98a7b" : "#c98768";
  const darkFur = state.phase === "game-over" ? "#66544e" : "#84584d";
  context.shadowColor = "#fff2cf";
  context.shadowBlur = 16;

  context.fillStyle = "#dca084";
  context.strokeStyle = darkFur;
  context.lineWidth = 7;
  context.beginPath();
  context.arc(x - 25, centerY - 12, 31, Math.PI * 0.45, Math.PI * 1.85);
  context.arc(x - 38, centerY - 22, 18, Math.PI * 1.85, Math.PI * 0.45);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = fur;
  context.beginPath();
  context.ellipse(x, centerY, 25, 29, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.beginPath();
  context.arc(x + 17, centerY - 25, 18, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = fur;
  context.beginPath();
  context.moveTo(x + 8, centerY - 39);
  context.lineTo(x + 15, centerY - 57);
  context.lineTo(x + 23, centerY - 39);
  context.closePath();
  context.fill();

  context.fillStyle = "#3c3b45";
  context.beginPath();
  context.arc(x + 23, centerY - 29, 4, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = darkFur;
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(x - 10, centerY + 21);
  context.lineTo(x - 15, ground);
  context.moveTo(x + 11, centerY + 22);
  context.lineTo(x + 18, ground);
  context.stroke();
  context.restore();
}

function slotX(index) {
  return BOARD.x + index * (SLOT_WIDTH + SLOT_GAP);
}

function drawSlots(state) {
  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const x = slotX(index);
    const isHighlighted = state.highlightedSlot === index;
    const height = state.slots[index];

    context.save();
    context.fillStyle = isHighlighted ? "#fff0a34d" : "#3c222a42";
    context.strokeStyle = isHighlighted ? "#fff7bd" : "#6b3c32";
    context.lineWidth = isHighlighted ? 7 : 4;
    context.setLineDash(isHighlighted ? [] : [13, 9]);
    context.fillRect(x, BOARD.y, SLOT_WIDTH, BOARD.height);
    context.strokeRect(x, BOARD.y, SLOT_WIDTH, BOARD.height);
    context.restore();

    context.fillStyle = isHighlighted ? "#fff6c7" : "#e7ba71";
    context.font = "800 27px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(String(index + 1), x + SLOT_WIDTH / 2, BOARD.y + 43);

    if (height !== null && state.placementAnimation?.slotIndex !== index) {
      drawRock(x + SLOT_WIDTH / 2, BOARD.y + BOARD.height, height, true);
    }
  }
}

function drawPlacementAnimation(state) {
  const animation = state.placementAnimation;
  if (!animation) {
    return;
  }

  const rawProgress = 1 - animation.remaining / 0.38;
  const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
  const targetX = slotX(animation.slotIndex) + SLOT_WIDTH / 2;
  const targetBottom = BOARD.y + BOARD.height;
  const x = LOGICAL_WIDTH / 2 + (targetX - LOGICAL_WIDTH / 2) * progress;
  const bottom = 400 + (targetBottom - 400) * progress;
  const wobble = Math.sin(progress * Math.PI * 3) * (1 - progress) * 0.08;
  context.save();
  context.translate(x, bottom);
  context.rotate(wobble);
  context.translate(-x, -bottom);
  drawRock(x, bottom, animation.height, progress > 0.75);
  context.restore();
}

function drawStartingLog(state) {
  if (state.characterSlot >= 0 || state.phase === "camera-transition") {
    return;
  }

  const height = state.startingLogHeight ?? 20;
  drawRock(132, 777 + rockVisualHeight(height), height, true);
}

function rockVisualHeight(height) {
  return 80 + (height / 50) * 145;
}

function drawDangerMarkers(state) {
  for (const danger of state.dangerousDrops) {
    const fromX = slotX(danger.fromIndex) + SLOT_WIDTH * 0.72;
    const toX = slotX(danger.toIndex) + SLOT_WIDTH * 0.28;
    const fromY = BOARD.y + BOARD.height - rockVisualHeight(state.slots[danger.fromIndex]) - 25;
    const toY = BOARD.y + BOARD.height - rockVisualHeight(state.slots[danger.toIndex]) - 25;

    context.save();
    context.strokeStyle = "#d73832";
    context.fillStyle = "#d73832";
    context.lineWidth = 8;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();

    const angle = Math.atan2(toY - fromY, toX - fromX);
    context.beginPath();
    context.moveTo(toX, toY);
    context.lineTo(toX - 20 * Math.cos(angle - Math.PI / 6), toY - 20 * Math.sin(angle - Math.PI / 6));
    context.lineTo(toX - 20 * Math.cos(angle + Math.PI / 6), toY - 20 * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();

    context.font = "900 29px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.strokeStyle = "#fff3cf";
    context.lineWidth = 7;
    const labelX = (fromX + toX) / 2;
    const labelY = Math.min(fromY, toY) - 7;
    context.strokeText(`-${danger.damage}`, labelX, labelY);
    context.fillText(`-${danger.damage}`, labelX, labelY);
    context.restore();
  }
}

function drawCameraTransition(state) {
  if (state.phase !== "camera-transition") {
    return;
  }

  const progress = state.cameraTransitionProgress;
  const veil = Math.sin(progress * Math.PI) * 0.38;
  context.fillStyle = `rgba(255, 226, 145, ${veil})`;
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  context.fillStyle = "#fff3bd";
  context.strokeStyle = "#4b2730";
  context.lineWidth = 10;
  context.font = "900 54px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.strokeText(`높이 ${state.baseHeight}m · 다음 층으로 상승 중`, LOGICAL_WIDTH / 2, 170);
  context.fillText(`높이 ${state.baseHeight}m · 다음 층으로 상승 중`, LOGICAL_WIDTH / 2, 170);
}

function drawAcornBurst(state) {
  if (state.damageEffectRemaining <= 0 || state.lastDamage <= 0) {
    return;
  }

  const origin = characterFootPosition(state);
  const elapsed = Math.max(0.16, 0.7 - state.damageEffectRemaining);
  const particleCount = Math.min(14, Math.max(5, Math.ceil(state.lastDamage / 4)));
  context.save();
  for (let index = 0; index < particleCount; index += 1) {
    const direction = index % 2 === 0 ? -1 : 1;
    const speed = 115 + (index % 5) * 24;
    const x = origin.x + direction * speed * elapsed + Math.sin(index * 2.1) * 18;
    const y = origin.y - 38 - (190 + (index % 4) * 34) * elapsed + 310 * elapsed * elapsed;
    context.save();
    context.translate(x, y);
    context.rotate(direction * elapsed * (3.2 + index * 0.24));
    context.fillStyle = "#a96c3f";
    context.strokeStyle = "#6f4932";
    context.lineWidth = 3;
    context.beginPath();
    context.ellipse(0, 4, 9, 12, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#6f4932";
    context.fillRect(-7, -9, 14, 5);
    context.restore();
  }
  context.fillStyle = "#fff8dc";
  context.strokeStyle = "#6f4932";
  context.lineWidth = 8;
  context.font = "900 48px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.strokeText(`도토리 -${state.lastDamage}`, origin.x, origin.y - 135);
  context.fillText(`도토리 -${state.lastDamage}`, origin.x, origin.y - 135);
  context.restore();
}

function drawAcornGain(state) {
  if (state.recoveryEffectRemaining <= 0 || state.lastHealing <= 0) {
    return;
  }

  const origin = characterFootPosition(state);
  const elapsed = 0.7 - state.recoveryEffectRemaining;
  const rise = 45 + elapsed * 85;
  context.save();
  for (let index = 0; index < 3; index += 1) {
    const angle = elapsed * 3 + index * (Math.PI * 2 / 3);
    const radius = 38 - elapsed * 24;
    const x = origin.x + Math.cos(angle) * radius;
    const y = origin.y - 58 - Math.sin(angle) * 13 - elapsed * 35;
    context.save();
    context.translate(x, y);
    context.rotate(angle * 0.35);
    context.fillStyle = "#d99552";
    context.strokeStyle = "#6f4932";
    context.lineWidth = 3;
    context.beginPath();
    context.ellipse(0, 4, 8, 11, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#6f4932";
    context.fillRect(-6, -8, 12, 5);
    context.restore();
  }
  context.fillStyle = "#fff7bc";
  context.strokeStyle = "#557567";
  context.lineWidth = 8;
  context.font = "900 48px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.strokeText(`도토리 +${state.lastHealing}`, origin.x, origin.y - rise);
  context.fillText(`도토리 +${state.lastHealing}`, origin.x, origin.y - rise);
  context.restore();
}

function drawRock(centerX, bottomY, height, isFixed) {
  const visualHeight = rockVisualHeight(height);
  const logWidth = Math.min(SLOT_WIDTH - 16, 88 + height * 0.18);

  context.save();
  context.shadowColor = "#6f75684d";
  context.shadowBlur = isFixed ? 8 : 18;
  context.shadowOffsetY = isFixed ? 6 : 10;
  context.fillStyle = "#c98f72";
  context.strokeStyle = isFixed ? "#7d6258" : "#fff3d7";
  context.lineWidth = isFixed ? 5 : 7;
  context.beginPath();
  context.roundRect(centerX - logWidth / 2, bottomY - visualHeight, logWidth, visualHeight, 18);
  context.fill();
  context.stroke();

  context.strokeStyle = "#a56f5c";
  context.lineWidth = 5;
  for (const offset of [-0.22, 0.18]) {
    context.beginPath();
    context.moveTo(centerX + logWidth * offset, bottomY - visualHeight + 18);
    context.lineTo(centerX + logWidth * offset, bottomY - 18);
    context.stroke();
  }

  context.fillStyle = "#e5b594";
  context.strokeStyle = "#89685d";
  context.lineWidth = 4;
  context.beginPath();
  context.ellipse(centerX, bottomY - visualHeight, logWidth / 2, 14, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.ellipse(centerX, bottomY - visualHeight, logWidth * 0.24, 7, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  context.fillStyle = "#fff8d4";
  context.strokeStyle = "#2b1820";
  context.lineWidth = 8;
  context.font = "900 46px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const textY = bottomY - visualHeight * 0.5;
  context.strokeText(String(height), centerX, textY);
  context.fillText(String(height), centerX, textY);
}

function drawCurrentRock(state) {
  if (!state.currentRock) {
    return;
  }

  const centerX = LOGICAL_WIDTH / 2;
  const bob = reduceDecorativeMotion ? 0 : Math.sin(performanceRef.now() / 210) * 8;
  const spawnProgress = state.currentRock.spawnProgress ?? 1;
  const eased = 1 - (1 - spawnProgress) ** 3;
  if ((state.currentRock.spawnDelay ?? 0) <= 0) {
    const bottom = 245 + eased * 155 + bob * eased;
    const scale = 0.28 + eased * 0.72;
    const spin = (1 - eased) * Math.PI * 2.6;
    context.save();
    context.globalAlpha = 0.3 + eased * 0.7;
    context.translate(centerX, bottom);
    context.rotate(spin);
    context.scale(scale, scale);
    context.translate(-centerX, -bottom);
    drawRock(centerX, bottom, state.currentRock.height, false);
    context.restore();
  }

  context.fillStyle = "#3b2027d9";
  context.strokeStyle = "#f7cf71";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(centerX - 155, 76, 310, 62, 22);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffe9a0";
  context.font = "800 25px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`현재 나무토막 · ${state.currentRock.height}`, centerX, 107);
}

function render(state) {
  prepareContext();
  context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  drawBackground();
  context.save();
  if (state.phase === "camera-transition") {
    const cameraOffset = cameraOffsetToAlignCharacter(state);
    context.translate(cameraOffset.x, cameraOffset.y);
  }
  drawStartingLog(state);
  drawSlots(state);
  drawPlacementAnimation(state);
  drawDangerMarkers(state);
  drawSquirrel(state);
  drawAcornBurst(state);
  drawAcornGain(state);
  drawCurrentRock(state);
  context.restore();
  drawCameraTransition(state);
}

const controller = createGameController({
  elements: {
    startScreen,
    gameScreen,
    startButton,
    canvas,
    healthValue,
    heightValue,
    gameStatus,
    exitButton,
    restartButton,
    resetRecordButton,
    resultOverlay,
    resultHeight,
    resultWalked,
    resultBestHeight,
    resultBestWalked,
    startBestHeight,
    startBestWalked,
    startStorageWarning,
    resultStorageWarning,
    startHelpButton,
    gameHelpButton,
    tutorialOverlay,
    tutorialStepNumber,
    tutorialText,
    tutorialNextButton,
    orientationOverlay,
  },
  renderFrame: render,
  requestFrame: windowRef.requestAnimationFrame.bind(windowRef),
  cancelFrame: windowRef.cancelAnimationFrame.bind(windowRef),
  recordStore: createBestRecordStore(browserStorage),
  tutorialStore: createTutorialStore(browserStorage),
  confirmAction: typeof windowRef.confirm === "function" ? windowRef.confirm.bind(windowRef) : () => false,
});

function handleViewportChange() {
  controller.updateViewport(windowRef.innerWidth, windowRef.innerHeight);
  if (controller.state.screen === "game") {
    controller.render();
  }
}

windowRef.addEventListener("resize", handleViewportChange);
windowRef.addEventListener("orientationchange", handleViewportChange);
documentRef.addEventListener?.("visibilitychange", () => {
  controller.setDocumentHidden(documentRef.hidden);
});
handleViewportChange();

windowRef.addEventListener("pagehide", () => {
  controller.destroy();
});

return controller;
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  bootstrapGame(document, window, performance);
}
