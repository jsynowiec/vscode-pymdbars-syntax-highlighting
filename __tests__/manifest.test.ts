import assert from "node:assert/strict";
import { test } from "node:test";
import { SYNTAX_PATH } from "../scripts/generate-grammars";
import { listSyntaxFiles, manifest, readSyntaxFile } from "./helpers";

test("every generated injection grammar is contributed to source.python", () => {
  const files = listSyntaxFiles().filter((f) => f.endsWith(".injection.json"));

  assert.ok(files.length > 0);

  for (const file of files) {
    const { scopeName }: { scopeName: string } = JSON.parse(readSyntaxFile(file));
    const entry = manifest.contributes.grammars.find((g) => g.path === `./${SYNTAX_PATH}/${file}`);

    assert.ok(entry, `${file} is not listed in contributes.grammars`);
    assert.equal(entry.scopeName, scopeName, `${file} scopeName differs from the manifest`);
    assert.deepEqual(entry.injectTo, ["source.python"]);
  }
});
