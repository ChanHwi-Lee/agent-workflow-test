import assert from "node:assert/strict";
import test from "node:test";

import { routeAfterBuildReferenceCompositionV2 } from "./runJobGraphEdges.js";

test(
  "routeAfterBuildReferenceCompositionV2 routes to send_finalize when finalizeDraft is present (coverage-failure short-circuit)",
  () => {
    const route = routeAfterBuildReferenceCompositionV2({
      finalizeDraft: { marker: "any-truthy-draft" },
    });
    assert.equal(route, "send_finalize");
    assert.notEqual(
      route,
      "build_search_profile",
      "coverage-failure paths must not continue through the normal build pipeline",
    );
  },
);

test(
  "routeAfterBuildReferenceCompositionV2 routes to build_search_profile when finalizeDraft is absent (normal path)",
  () => {
    assert.equal(
      routeAfterBuildReferenceCompositionV2({ finalizeDraft: undefined }),
      "build_search_profile",
    );
    assert.equal(
      routeAfterBuildReferenceCompositionV2({ finalizeDraft: null as unknown as undefined }),
      "build_search_profile",
    );
    assert.equal(
      routeAfterBuildReferenceCompositionV2({}),
      "build_search_profile",
    );
  },
);
