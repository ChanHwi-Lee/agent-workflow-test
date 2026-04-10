import assert from "node:assert/strict";
import test from "node:test";

import {
  createClusterZoneBounds,
  createGeometryPresets,
  resolveCopySlotBounds,
  resolveGraphicBindingBounds,
} from "./layoutGeometry.js";

test("layoutGeometry는 명시된 resolvedSlotBounds를 우선 적용한다", () => {
  const presets = createGeometryPresets(
    1200,
    628,
    "promo_split",
    "left_copy_right_graphic",
    "promo_multi_graphic",
    84,
    "balanced",
  );

  const overrides = {
    headline: { x: 10, y: 20, width: 300, height: 90 },
  };

  const bounds = resolveCopySlotBounds(
    presets,
    {
      headline: "left_copy_column",
      subheadline: "left_copy_column",
      cta: "bottom_center",
    },
    overrides,
  );

  assert.deepEqual(bounds.headline, overrides.headline);
  assert.equal(typeof bounds.subheadline.x, "number");
  assert.equal(typeof bounds.cta.y, "number");
});

test("layoutGeometry는 cta_container bounds를 cta bounds 기준으로 확장한다", () => {
  const presets = createGeometryPresets(
    1200,
    628,
    "promo_split",
    "left_copy_right_graphic",
    "promo_multi_graphic",
    84,
    "balanced",
  );

  const copyBounds = resolveCopySlotBounds(presets, {
    headline: "left_copy_column",
    subheadline: "left_copy_column",
    offer_line: "left_copy_column",
    cta: "bottom_center",
  });
  const zoneBounds = createClusterZoneBounds(presets, [
    "right_cluster",
    "top_corner",
    "bottom_strip",
  ]);

  const containerBounds = resolveGraphicBindingBounds(
    "cta_container",
    "bottom_strip",
    zoneBounds,
    copyBounds,
  );

  assert.equal(containerBounds.x, copyBounds.cta.x - 12);
  assert.equal(containerBounds.y, copyBounds.cta.y - 6);
  assert.equal(containerBounds.width, copyBounds.cta.width + 24);
  assert.equal(containerBounds.height, copyBounds.cta.height + 12);
});
