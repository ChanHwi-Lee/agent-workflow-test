import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema, IsoDateTimeSchema } from "../common.js";

export const TemplateSaveEvidenceSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    serial: Type.Integer({ minimum: 1 }),
    modified: IsoDateTimeSchema,
    version: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const TemplateSaveReceiptSchema = Type.Object(
  {
    saveReceiptId: IdentifierSchema,
    outputTemplateCode: Type.String({ minLength: 1 }),
    savedRevision: Type.Integer({ minimum: 0 }),
    savedAt: IsoDateTimeSchema,
    reason: Type.Union(
      ["milestone_first_editable", "run_completed"].map((value) =>
        Type.Literal(value),
      ),
    ),
  },
  { additionalProperties: false },
);

export type TemplateSaveEvidence = Static<typeof TemplateSaveEvidenceSchema>;
export type TemplateSaveReceipt = Static<typeof TemplateSaveReceiptSchema>;
