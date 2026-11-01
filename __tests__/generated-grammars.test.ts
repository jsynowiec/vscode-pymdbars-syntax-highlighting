import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGrammars, serialize } from "../scripts/generate-grammars";
import { readSyntaxFile } from "./helpers";

describe("syntaxes", () => {
  for (const [file, grammar] of Object.entries(buildGrammars())) {
    it(`${file} matches scripts/generate-grammars.ts (run pnpm generate)`, () => {
      const committed = readSyntaxFile(file);
      assert.equal(committed, serialize(grammar));
    });
  }
});
