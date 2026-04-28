# v6-poc — AGW v6 Phase 0 PoC

> Historical evidence. 이 디렉터리는 live runtime이 아니라 v6 설계 결정을 가능하게 한 PoC/검증 자산이다. 삭제하지 않고 보존하되, 현재 구현 truth는 `tooldi-agent-runtime/`와 v6 SSOT를 기준으로 읽는다.

LLM free HTML → Playwright render → Toolditor primitive mapper. Local PoC.

## Layout

```
samples/      hand-written HTML inputs (5)
extracted/    RenderedElement[] JSON (one per sample)
commands/     ToolditorCommand[] JSON (one per sample)
screenshots/  original.png + reconstructed.png (round-trip verification)
extract.mjs   Playwright + DOM extraction
mapper.mjs    RenderedElement → ToolditorCommand
verify.mjs    commands → minimal HTML → screenshot (round-trip)
run.mjs       extract → map → verify
```

## Usage

```bash
npm install
npx playwright install chromium
node run.mjs
```

## Status

Phase 0 complete. See `PHASE-0-REPORT.md` for findings.

## Philosophy (locked)

- 시스템이 layout family 를 정의하지 않는다.
- Slot / topology / CTA / role 을 contract 로 올리지 않는다.
- LLM 은 결과를 만든다.
- 브라우저는 layout 을 계산한다.
- 코드는 결과를 추출한다.
