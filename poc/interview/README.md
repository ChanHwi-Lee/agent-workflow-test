# AGW Interview HITL PoC

자연어 프롬프트 → (인터뷰) → HTML + 스크린샷 생성을 A (no-interview) / B (interview) 로 self-play 돌려 품질 차이를 측정하는 PoC.

- 스펙: `../../interview-hitl-poc-spec.md`
- agent-worker 는 수정하지 않는다. `dist/phases/` 의 v6 노드를 상대 경로로 재사용.
- 모델: `gemini-3.1-flash-lite-preview` (SSOT 락)
- 실행: 독립 pnpm 패키지. `pnpm install && pnpm build && pnpm smoke`.

## 환경변수

- `GOOGLE_API_KEY` — M2 이후 실제 생성에 필요. M1 smoke 에는 불필요.

## 디렉터리

```
poc/interview/
├── src/
│   ├── lib/
│   │   ├── agentWorkerImports.ts  # v6 노드 re-export
│   │   └── gemini.ts              # 인터뷰 Q/A 용 JSON Gemini caller
│   └── smoke.ts                   # M1 검증 스크립트
├── seeds/seeds.json               # 3 seed prompts
├── package.json
├── tsconfig.json
└── README.md
```

## Milestones

- **M1**: skeleton + agent-worker import 경로 + smoke (진행 중)
- **M2**: A 경로 9 run
- **M3**: interview node
- **M4**: B 경로 9 run
- **M5**: dashboard + score API
- **M6**: 사용자 1 라운드 평가 + 집계
