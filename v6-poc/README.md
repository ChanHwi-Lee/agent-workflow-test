# v6-poc — AGW v6 Phase 0 PoC

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
