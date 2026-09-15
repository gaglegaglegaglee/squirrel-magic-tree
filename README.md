# 피라미드 건설

무작위 높이의 바위를 10칸에 배치하고, 낙차 피해를 견디며 피라미드를 높이는 서버 없는 Canvas 웹게임입니다.

## 실행

Node.js와 Python 3가 설치된 환경에서 다음 명령을 실행합니다.

```bash
npm start
```

그다음 브라우저에서 `http://localhost:4173`을 엽니다. 외부 패키지 설치, API 키와 별도 서버는 필요하지 않습니다.

## 검증

전체 자동 검증과 JavaScript 문법 검사는 다음 명령으로 실행합니다.

```bash
npm test
node --check src/app.js
node --check src/game-controller.js
node --check src/game-state.js
node --check src/record-store.js
node --check src/tutorial-store.js
```

게임 파일은 최초 로딩 뒤 네트워크 요청 없이 동작하며 기록과 안내 완료 여부만 현재 브라우저 저장소에 보관합니다.
