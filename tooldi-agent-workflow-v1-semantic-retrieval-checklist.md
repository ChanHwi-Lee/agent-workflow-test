# Tooldi Agent Workflow v1 Semantic Retrieval Checklist

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Semantic Retrieval Checklist |
| 문서 목적 | 향후 `embedding / semantic retrieval / hybrid retrieval` 을 현재 spring template intelligence 구조에 안전하게 추가하기 위한 checklist 를 정리한다. |
| 상태 | Working Draft |
| 문서 유형 | Future Checklist |
| 작성일 | 2026-04-07 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker Runtime`, `Tooldi PHP content API`, future vector index |
| 기준 데이터 | `tooldi-agent-workflow-v1-template-intelligence-design-lock.md`, `tooldi-agent-workflow-v1-next-implementation-roadmap.md`, `tooldi-agent-workflow-v1-tooldi-content-discovery.md`, current worker code |
| 대상 독자 | PM, Agent Backend, Worker, Search/Retrieval, QA |
| Owner | Ouroboros workflow |

## 1. 문서 성격

- 이 문서는 normative spec 이 아니라 future implementation checklist 다.
- 현재 동작을 override 하지 않는다.
- 현재 real source-of-truth 는 계속 `Tooldi PHP content API` 와 그 뒤의 canonical Tooldi data 로 본다.
- future vector index / semantic retrieval store 는 source-of-truth 가 아니라 `derived retrieval store` 로 취급한다.

## 2. 현재 구조에서 확인된 seam

현재 worker 는 이미 아래 구조를 가진다.

1. `catalog source`
2. `candidate assembly`
3. `retrieval stage`
4. `selection decision`
5. `executable plan`

즉 semantic retrieval 을 넣을 때 완전히 새 구조를 만들 필요는 없고, 아래 3개 seam 을 키우는 방식이 가장 자연스럽다.

- `runRetrievalStage`
- `TooldiCatalogSourceClient` 와 별개인 retrieval client seam
- `TemplateCandidate` 의 score / provenance 확장

## 3. 고정 원칙

### 3.1 source-of-truth 분리

- PHP API / MariaDB = canonical source-of-truth
- vector DB / embedding index = derived retrieval store
- runtime selection 은 retrieval 결과를 참고할 수 있지만, source metadata 의 canonical identity 는 계속 Tooldi source serial / assetId 를 따른다.

### 3.2 retrieval stage 분리 유지

- semantic retrieval 은 `assembleTemplateCandidates` 안에 직접 섞지 않는다.
- retrieval 는 반드시 dedicated stage 로 유지한다.
- candidate assembly 는 raw source candidate 와 retrieval augmentation 을 받아 최종 candidate set 을 만드는 역할만 맡는다.

### 3.3 fallback 우선

- retrieval 실패가 곧 run 실패가 되면 안 된다.
- 초기 단계에서는 `semantic retrieval unavailable -> metadata/keyword fallback` 이 기본이다.
- 즉 semantic path 는 additive 이어야 하고, current real-source keyword path 를 깨면 안 된다.

### 3.4 evidence 남김

- semantic retrieval 이 들어오면 `왜 이 후보가 올라왔는지`를 artifact 와 `run.log` 로 남겨야 한다.
- black-box similarity score 하나만 남기는 구조는 피한다.

## 4. TO-BE 데이터 흐름

추후 추천 흐름:

1. `source query`
   - PHP API 기반 raw inventory candidate 수집
2. `retrieval query`
   - keyword query 또는 user prompt 기반 semantic query
3. `retrieval augmentation`
   - top-k candidate id / serial / score 반환
4. `candidate assembly`
   - raw candidate 와 retrieval result 를 merge
5. `selection`
   - retrieval score + execution safety + layout fit + readability heuristic 를 함께 비교
6. `plan / mutation`
   - chosen candidate 기준으로만 실행

즉 retrieval 은 source 를 대체하는 것이 아니라 `candidate ranking input` 으로 추가되는 것이 맞다.

## 5. 타입 / 계약 checklist

### 5.1 retrieval mode 확장

현재 `retrievalMode` 는 `none` 뿐이다. 추후 아래를 추가하는 것이 적절하다.

- `metadata_search`
- `semantic_search`
- `hybrid`

### 5.2 retrieval result artifact 추가

추후 아래 artifact 가 필요하다.

- `retrieval-query.json`
- `retrieval-result.json`
- `retrieval-rerank.json` optional

최소 필드:

- query text
- mode
- top-k candidate ids
- source family
- raw similarity scores
- reranked scores optional
- fallbackUsed

### 5.3 candidate score provenance 확장

현재 `fitScore` 단일 값은 semantic retrieval 에는 부족하다.

추후 `TemplateCandidate` 또는 sibling score object 에 아래가 필요하다.

- `keywordScore`
- `semanticScore`
- `rerankScore`
- `executionSafetyScore`
- `layoutFitScore`
- `finalScore`

### 5.4 selection evidence 확장

`SelectionDecision.compareCriteria` 와 별개로 아래 provenance 를 남기는 구조가 필요하다.

- chosen candidate 의 retrieval source
- keyword hit 여부
- semantic top-k rank
- rerank rank optional
- selection reason summary

## 6. 인덱싱 / 데이터 파이프라인 checklist

### 6.1 offline index build

- source asset 의 canonical serial / assetId 를 인덱스 key 로 사용한다.
- index row 는 최소 아래를 가져야 한다.
  - source family
  - serial
  - assetId
  - thumbnail/origin metadata
  - keyword text
  - category
  - orientation optional
  - embedding vector
  - embedding model name / version
  - embedding timestamp

### 6.2 freshness / invalidation

- source asset rec_status / screening / is_use 변경 시 index invalidation 전략이 필요하다.
- stale vector row 가 live source candidate 와 불일치할 수 있다는 점을 체크해야 한다.

### 6.3 family 분리 유지

- `photo` 와 `graphic` 은 같은 embedding space 를 쓰더라도 retrieval family 는 분리하는 편이 안전하다.
- 이유:
  - execution path 가 다름
  - crop / readability / insert seam 이 다름
  - ranking 기준도 다름

## 7. runtime integration checklist

### 7.1 새 client seam

추후 별도 client seam 이 필요하다.

- `SemanticRetrievalClient`
- `searchBackgroundCandidatesBySemanticQuery`
- `searchGraphicCandidatesBySemanticQuery`
- `searchPhotoCandidatesBySemanticQuery`

혹은 generic client 를 두더라도 family 단위 필터는 반드시 유지한다.

### 7.2 query construction

- query text 는 raw user prompt 그대로 쓰지 않고, normalized intent / tone / slot intent 를 반영해 생성하는 것이 적절하다.
- 예:
  - background query
  - hero visual query
  - decoration query

즉 하나의 prompt 를 여러 retrieval query profile 로 나눌 가능성을 미리 고려해야 한다.

### 7.3 hybrid merge

- semantic top-k 만 그대로 쓰지 않는다.
- initial candidate merge 는 아래 순서가 적절하다.
  - semantic top-k
  - keyword exact hit
  - execution-safe fallback

### 7.4 graceful degradation

- vector store timeout / unavailable / low-confidence 일 때는:
  - warning log 남김
  - keyword path 로 계속 진행

## 8. 평가 / 품질 checklist

- semantic retrieval 도입 후 최소 비교 항목:
  - current keyword-only baseline 대비 clickless quality improvement 여부
  - photo branch 선택률 변화
  - fallback 비율
  - latency 증가량
  - low-confidence retrieval 빈도
  - selected candidate 와 실제 visual outcome 간 상관

초기에는 offline eval set 으로 먼저 본다.

- `봄 템플릿`
- `여름 세일`
- `고급 이벤트 배너`
- `미니멀 공지 배너`

## 9. 현재 기준으로 남겨둘 deferred checklist

- `runRetrievalStage` 를 진짜 retrieval stage 로 승격
- retrieval artifact 추가
- candidate score provenance 확장
- retrieval client seam 추가
- family별 query profile 설계
- vector index freshness / invalidation 정책
- hybrid retrieval fallback 규칙
- eval set / observability 확장

## 10. 현재 상태 요약

- 지금 구조는 semantic retrieval 을 추가하기 좋은 편이다.
- 이유는 source, retrieval, selection, execution 이 이미 어느 정도 분리돼 있기 때문이다.
- 하지만 semantic retrieval 이 실제로 들어오면 아래 3개는 반드시 커져야 한다.
  - `retrievalMode`
  - candidate score provenance
  - retrieval artifact / evidence
