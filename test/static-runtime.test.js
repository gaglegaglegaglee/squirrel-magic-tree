import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicFiles = ["../index.html", "../styles.css", "../src/app.js", "../src/game-controller.js", "../src/game-state.js"];

test("브라우저 실행 파일은 외부 URL이나 런타임 네트워크 API에 의존하지 않는다", async () => {
  const contents = await Promise.all(publicFiles.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  const combined = contents.join("\n");
  const networkNames = [["fet", "ch"], ["XMLHttp", "Request"], ["Web", "Socket"], ["Event", "Source"], ["send", "Beacon"]]
    .map((parts) => parts.join(""));

  for (const name of networkNames) {
    assert.equal(combined.includes(name), false);
  }
  assert.doesNotMatch(combined, /(?:src|href)=["']https?:\/\//i);
});

test("반응형 HUD와 Canvas 및 움직임 줄이기 규칙이 공개 CSS에 포함된다", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /max-width:\s*100%/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.hud strong\.acorn-lost/);
  assert.match(css, /@keyframes\s+acorn-loss-bounce/);
});

test("주요 키보드 동작은 네이티브 button과 접근 가능한 dialog로 제공된다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const id of ["start-button", "start-help-button", "game-help-button", "exit-button", "restart-button"]) {
    assert.match(html, new RegExp(`<button[^>]+id=["']${id}["']`));
  }
  assert.match(html, /id="result-overlay"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(html, /id="tutorial-overlay"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/);
});
