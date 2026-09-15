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
  sky.addColorStop(0, "#9f4f4a");
  sky.addColorStop(0.56, "#f2a65d");
  sky.addColorStop(1, "#f7cd78");
  context.fillStyle = sky;
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  context.fillStyle = "#ffe8a2";
  context.beginPath();
  context.arc(1320, 150, 76, 0, Math.PI * 2);
  context.fill();

  drawDistantPyramid(70, 570, 310, "#9c543e", "#70382f");
  drawDistantPyramid(980, 605, 240, "#b96743", "#81422f");

  context.fillStyle = "#c47743";
  context.beginPath();
  context.moveTo(0, 590);
  context.quadraticCurveTo(330, 535, 690, 618);
  context.quadraticCurveTo(1120, 530, 1600, 610);
  context.lineTo(1600, 900);
  context.lineTo(0, 900);
  context.closePath();
  context.fill();

  context.fillStyle = "#9a5239";
  context.fillRect(0, 778, LOGICAL_WIDTH, 122);
  context.fillStyle = "#69352f";
  context.fillRect(0, 778, LOGICAL_WIDTH, 9);
}

function drawDistantPyramid(x, baseline, size, litColor, shadeColor) {
  context.fillStyle = litColor;
  context.beginPath();
  context.moveTo(x, baseline);
  context.lineTo(x + size * 0.52, baseline - size);
  context.lineTo(x + size, baseline);
  context.closePath();
  context.fill();

  context.fillStyle = shadeColor;
  context.beginPath();
  context.moveTo(x + size * 0.52, baseline - size);
  context.lineTo(x + size, baseline);
  context.lineTo(x + size * 0.52, baseline);
  context.closePath();
  context.fill();
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

function drawClimberDot(state) {
  const position = characterFootPosition(state);
  const x = position.x;
  const ground = position.y;
  const bounce = state.phase === "walking" ? bounceHeightForProgress(state.walkProgress) : 0;
  const radius = state.phase === "game-over" ? 18 : 22;
  const centerY = ground - radius - bounce;

  context.save();
  context.fillStyle = "rgba(42, 23, 32, 0.28)";
  context.beginPath();
  context.ellipse(x, ground + 3, 25 - bounce * 0.16, 7, 0, 0, Math.PI * 2);
  context.fill();

  context.shadowColor = state.phase === "game-over" ? "#ff263d" : "#fff0a3";
  context.shadowBlur = state.phase === "game-over" ? 18 : 24;
  context.fillStyle = state.phase === "game-over" ? "#d73832" : "#fff1a8";
  context.strokeStyle = state.phase === "game-over" ? "#7b101b" : "#5c362d";
  context.lineWidth = 6;
  context.beginPath();
  context.arc(x, centerY, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = state.phase === "game-over" ? "#ff8b86" : "#ffffff";
  context.beginPath();
  context.arc(x - 7, centerY - 8, 6, 0, Math.PI * 2);
  context.fill();
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

    if (height !== null) {
      drawRock(x + SLOT_WIDTH / 2, BOARD.y + BOARD.height, height, true);
    }
  }
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

function drawDamageEffect(state) {
  if (state.damageEffectRemaining <= 0 && state.phase !== "game-over") {
    return;
  }

  const strength = state.phase === "game-over"
    ? 0.28
    : Math.min(0.25, 0.1 + state.damageEffectRemaining * 0.32);
  context.save();
  context.fillStyle = `rgba(184, 18, 30, ${strength})`;
  context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  context.strokeStyle = "rgba(255, 65, 70, 0.9)";
  context.lineWidth = 30;
  context.strokeRect(15, 15, LOGICAL_WIDTH - 30, LOGICAL_HEIGHT - 30);
  if (state.lastDamage > 0) {
    context.fillStyle = "#fff4ef";
    context.strokeStyle = "#7b101b";
    context.lineWidth = 10;
    context.font = "900 58px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.strokeText(`-${state.lastDamage} 체력`, LOGICAL_WIDTH / 2, 245);
    context.fillText(`-${state.lastDamage} 체력`, LOGICAL_WIDTH / 2, 245);
  }
  context.restore();
}

function drawRock(centerX, bottomY, height, isFixed) {
  const visualHeight = rockVisualHeight(height);
  const rockWidth = Math.min(SLOT_WIDTH - 12, 95 + height * 0.24);

  context.save();
  context.shadowColor = isFixed ? "#2e172377" : "#4a202999";
  context.shadowBlur = isFixed ? 8 : 20;
  context.shadowOffsetY = isFixed ? 7 : 15;

  const gradient = context.createLinearGradient(centerX - rockWidth / 2, 0, centerX + rockWidth / 2, 0);
  gradient.addColorStop(0, "#633b34");
  gradient.addColorStop(0.55, "#a56742");
  gradient.addColorStop(1, "#4d2c2c");
  context.fillStyle = gradient;
  context.strokeStyle = isFixed ? "#3d2528" : "#ffe5a1";
  context.lineWidth = isFixed ? 4 : 7;
  context.beginPath();
  context.moveTo(centerX - rockWidth * 0.48, bottomY);
  context.lineTo(centerX - rockWidth * 0.44, bottomY - visualHeight * 0.64);
  context.lineTo(centerX - rockWidth * 0.22, bottomY - visualHeight * 0.93);
  context.lineTo(centerX + rockWidth * 0.18, bottomY - visualHeight);
  context.lineTo(centerX + rockWidth * 0.46, bottomY - visualHeight * 0.7);
  context.lineTo(centerX + rockWidth * 0.5, bottomY);
  context.closePath();
  context.fill();
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

  const centerX = BOARD.x + state.currentRock.position * BOARD.width;
  const bob = reduceDecorativeMotion ? 0 : Math.sin(performanceRef.now() / 210) * 8;
  drawRock(centerX, BOARD.y - 68 + bob, state.currentRock.height, false);

  context.fillStyle = "#3b2027d9";
  context.strokeStyle = "#f7cf71";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(centerX - 72, 82, 144, 52, 20);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffe9a0";
  context.font = "800 25px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`현재 바위 ${state.currentRock.height}`, centerX, 108);
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
  drawSlots(state);
  drawDangerMarkers(state);
  drawClimberDot(state);
  drawCurrentRock(state);
  context.restore();
  drawDamageEffect(state);
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
