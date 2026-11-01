import { describe, it } from "node:test";
import { assertScopes, scopesOf, tokenizePython } from "./tokenize";

describe("block constructs in indented templates", () => {
  for (const indent of [4, 8, 12]) {
    it(`highlights headings, fences and quotes indented by ${indent} spaces`, async () => {
      const pad = " ".repeat(indent);
      const lines = await tokenizePython(
        [
          "class P:",
          `${pad}system = TemplateStr("""`,
          `${pad}# Role`,
          `${pad}\`\`\`json`,
          `${pad}{"a": 1}`,
          `${pad}\`\`\``,
          `${pad}> note`,
          `${pad}""")`,
        ].join("\n"),
      );

      assertScopes(scopesOf(lines, 2, "Role"), ["markup.heading.markdown"]);
      assertScopes(scopesOf(lines, 3, "json"), ["fenced_code.block.language.markdown"]);
      assertScopes(scopesOf(lines, 4, '{"a": 1}'), ["markup.fenced_code.block.markdown"]);
      assertScopes(scopesOf(lines, 6, ">"), ["punctuation.definition.quote.begin.markdown"]);
    });
  }
});

describe("placeholders inside inline code", () => {
  it("highlights an f-string expression", async () => {
    const lines = await tokenizePython('TemplateStr(f"""Call `{tool}` now""")');

    assertScopes(scopesOf(lines, 0, "tool"), [
      "markup.inline.raw.string.markdown",
      "meta.interpolation.pymdbars",
    ]);
  });

  it("highlights a Handlebars variable", async () => {
    const lines = await tokenizePython('TemplateStr("""Call `{{tool}}` now""")');

    assertScopes(scopesOf(lines, 0, "tool"), [
      "markup.inline.raw.string.markdown",
      "variable.parameter.handlebars",
    ]);
  });

  const nested: [string, string][] = [
    ["bold", "**bold `{x}` more**"],
    ["italic", "*em `{x}` more*"],
    ["link text", "[`{x}`](http://a.b)"],
  ];

  for (const [name, text] of nested) {
    it(`highlights an f-string expression in code inside ${name}`, async () => {
      const lines = await tokenizePython(`TemplateStr(f"""${text}""")`);

      assertScopes(scopesOf(lines, 0, "x"), [
        "markup.inline.raw.string.markdown",
        "meta.interpolation.pymdbars",
      ]);
    });

    it(`highlights a Handlebars variable in code inside ${name}`, async () => {
      const lines = await tokenizePython(`TemplateStr("""${text.replace("{x}", "{{x}}")}""")`);

      assertScopes(scopesOf(lines, 0, "x"), [
        "markup.inline.raw.string.markdown",
        "variable.parameter.handlebars",
      ]);
    });
  }

  it("keeps double-backtick spans together", async () => {
    const lines = await tokenizePython('TemplateStr(f"""A ``a ` {b}`` c""")');

    assertScopes(scopesOf(lines, 0, "b"), ["markup.inline.raw.string.markdown"]);
    assertScopes(scopesOf(lines, 0, "c"), ["meta.template.pymdbars.fstring"]);
  });
});

describe("the other quote style inside a fenced code block", () => {
  const fence = (quote: string, other: string) =>
    [
      `p = TemplateStr(${quote}`,
      "```python",
      "def f():",
      `    ${other}doc${other}`,
      "    return 1",
      "```",
      `${quote})`,
    ].join("\n");

  it("does not end the fence of a ''' template at \"\"\"", async () => {
    const lines = await tokenizePython(fence("'''", '"""'));

    assertScopes(scopesOf(lines, 4, "return 1"), ["markup.fenced_code.block.markdown"]);
  });

  it("does not end the fence of a \"\"\" template at '''", async () => {
    const lines = await tokenizePython(fence('"""', "'''"));

    assertScopes(scopesOf(lines, 4, "return 1"), ["markup.fenced_code.block.markdown"]);
  });
});

describe("links", () => {
  it("still highlights a finished link", async () => {
    const lines = await tokenizePython('TemplateStr("""See [docs](http://a.b/c) now""")');

    assertScopes(scopesOf(lines, 0, "docs"), ["string.other.link.title.markdown"]);
    assertScopes(scopesOf(lines, 0, "http://a.b/c"), ["markup.underline.link.markdown"]);
  });
});
