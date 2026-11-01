import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(__dirname, "..");

interface GrammarContribution {
  scopeName: string;
  path: string;
  injectTo: string[];
}

const manifest: { contributes: { grammars: GrammarContribution[] } } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);

test("every generated injection grammar is contributed to source.python", () => {
  const files = readdirSync(join(root, "syntaxes")).filter((f) => f.endsWith(".injection.json"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const { scopeName }: { scopeName: string } = JSON.parse(
      readFileSync(join(root, "syntaxes", file), "utf8"),
    );
    const entry = manifest.contributes.grammars.find((g) => g.path === `./syntaxes/${file}`);
    assert.ok(entry, `${file} is not listed in contributes.grammars`);
    assert.equal(entry.scopeName, scopeName, `${file} scopeName differs from the manifest`);
    assert.deepEqual(entry.injectTo, ["source.python"]);
  }
});
