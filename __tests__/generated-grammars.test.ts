import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildGrammars, serialize } from "../scripts/generate-grammars";

describe("syntaxes/*.json", () => {
  for (const [file, grammar] of Object.entries(buildGrammars())) {
    it(`${file} matches scripts/generate-grammars.ts (run pnpm generate)`, () => {
      const committed = readFileSync(join(__dirname, "..", "syntaxes", file), "utf8");
      assert.equal(committed, serialize(grammar));
    });
  }
});
