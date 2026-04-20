import assert from "node:assert/strict";
import test from "node:test";

import { routeAfterBuildObjectNativePath } from "./runJobGraphEdges.js";

test(
  "routeAfterBuildObjectNativePath routes to send_finalize when finalizeDraft is present (coverage-failure short-circuit)",
  () => {
    const route = routeAfterBuildObjectNativePath({
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
  "routeAfterBuildObjectNativePath routes to build_search_profile when finalizeDraft is absent (normal path)",
  () => {
    assert.equal(
      routeAfterBuildObjectNativePath({ finalizeDraft: undefined }),
      "build_search_profile",
    );
    assert.equal(
      routeAfterBuildObjectNativePath({ finalizeDraft: null as unknown as undefined }),
      "build_search_profile",
    );
    assert.equal(
      routeAfterBuildObjectNativePath({}),
      "build_search_profile",
    );
  },
);
