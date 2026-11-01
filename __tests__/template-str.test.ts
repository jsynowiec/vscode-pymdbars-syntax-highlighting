import { describe, it } from "node:test";
import { assertLikePlainPython, assertScopes, scopesOf, tokenizePython } from "./tokenize";

const FSTRING_TEMPLATE = [
  'prompt = TemplateStr(f"""# Hello {name}',
  "Be *very {tone}* polite.",
  '""")',
  "x = 1",
].join("\n");

describe('TemplateStr(f"""...""")', () => {
  it("highlights Markdown in the body", async () => {
    const lines = await tokenizePython(FSTRING_TEMPLATE);

    assertScopes(scopesOf(lines, 0, "Hello "), [
      "meta.template.pymdbars.fstring",
      "markup.heading.markdown",
    ]);
    assertScopes(scopesOf(lines, 1, "very "), ["markup.italic.markdown"]);
  });

  it("highlights f-string expressions at the top level and inside Markdown spans", async () => {
    const lines = await tokenizePython(FSTRING_TEMPLATE);

    assertScopes(scopesOf(lines, 0, "name"), ["meta.interpolation.pymdbars"]);
    assertScopes(scopesOf(lines, 1, "tone"), [
      "markup.italic.markdown",
      "meta.interpolation.pymdbars",
    ]);
    assertScopes(scopesOf(lines, 1, "{"), ["constant.character.format.placeholder.other.python"]);
  });

  it("scopes expressions with the Python grammar", async () => {
    const lines = await tokenizePython('TemplateStr(f"""Hi {user.name:>4}!""")');

    assertScopes(scopesOf(lines, 0, "name"), ["meta.attribute.python"]);
    assertScopes(scopesOf(lines, 0, ":>4"), ["storage.type.format.python"]);
  });

  it("leaves code after the closing parenthesis scoped like plain Python", async () => {
    await assertLikePlainPython(FSTRING_TEMPLATE, 3);
    await assertLikePlainPython(FSTRING_TEMPLATE, 2);
  });
});
