import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertLikePlainPython,
  assertNoScopes,
  assertScopes,
  closerToken,
  scopesOf,
  tokenizePython,
} from "./tokenize";

describe("string prefixes and delimiters", () => {
  const cases: [string, string, "fstring" | "plain"][] = [
    ["f", 'f"""', "fstring"],
    ["F", 'F"""', "fstring"],
    ["rf", 'rf"""', "fstring"],
    ["fr", 'fr"""', "fstring"],
    ["RF", 'RF"""', "fstring"],
    ["Fr", "Fr'''", "fstring"],
    ["none", '"""', "plain"],
    ["none, single quotes", "'''", "plain"],
    ["r", 'r"""', "plain"],
    ["R, single quotes", "R'''", "plain"],
  ];

  for (const [name, open, kind] of cases) {
    const quotes = open.slice(-3);
    it(`highlights Markdown and ends the string: ${name}`, async () => {
      const source = `p = TemplateStr(${open}# Title\n    *em*\n    ${quotes})\nx = 1`;
      const lines = await assertLikePlainPython(source, -1);

      assertScopes(scopesOf(lines, 0, "Title"), [
        `meta.template.pymdbars.${kind}`,
        "markup.heading.markdown",
      ]);
      assertScopes(scopesOf(lines, 1, "em"), ["markup.italic.markdown"]);
      assertScopes(closerToken(lines)?.scopes ?? [], ["punctuation.definition.string.end.python"]);
    });
  }

  it("interpolates {expr} in raw f-strings", async () => {
    const lines = await tokenizePython('TemplateStr(rf"""Hi {name}""")');

    assertScopes(scopesOf(lines, 0, "name"), ["meta.interpolation.pymdbars"]);
  });

  it("does not claim prefixes it does not support", async () => {
    await assertLikePlainPython('p = TemplateStr(b"""x""")');
  });
});

describe("escapes", () => {
  for (const prefix of ["f", "", "rf", "r"]) {
    it(`keeps the string open after an escaped quote: prefix '${prefix}'`, async () => {
      const lines = await assertLikePlainPython(
        `p = TemplateStr(${prefix}"""a \\""" b""")\nx = 1`,
        -1,
      );

      assertScopes(scopesOf(lines, 0, '"" b'), [
        prefix.includes("f") ? "meta.template.pymdbars.fstring" : "meta.template.pymdbars.plain",
      ]);
    });

    it(`ends the string after an escaped backslash: prefix '${prefix}'`, async () => {
      const lines = await tokenizePython(`p = TemplateStr(${prefix}"""a \\\\""")\nx = 1`);

      assertScopes(closerToken(lines)?.scopes ?? [], ["punctuation.definition.string.end.python"]);
    });
  }

  const ESCAPE = "constant.character.escape.python";
  const escapeCases: [string, string, boolean][] = [
    ["plain", "", true],
    ["f-string", "f", true],
    ["raw", "r", false],
    ["raw f-string", "rf", false],
  ];

  for (const [name, prefix, escaped] of escapeCases) {
    it(`${escaped ? "scopes" : "does not scope"} \\n as a Python escape: ${name}`, async () => {
      const lines = await tokenizePython(`TemplateStr(${prefix}"""a\\nb""")`);
      const token = lines[0].find((t) => t.text.includes("\\n"));

      assert.ok(token, "no token contains the backslash sequence");
      if (escaped) assertScopes(token.scopes, [ESCAPE]);
      else assertNoScopes(token.scopes, [ESCAPE]);
    });
  }
});
