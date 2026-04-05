import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

import { IdentifierSchema, IsoDateTimeSchema } from "../common.js";

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

export type TemplateSaveReceipt = Static<typeof TemplateSaveReceiptSchema>;
