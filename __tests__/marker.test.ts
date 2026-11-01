import { describe, it } from "node:test";
import {
  assertLikePlainPython,
  assertNoScopes,
  assertScopes,
  scopesOf,
  tokenizePython,
} from "./tokenize";

describe("# prompt: markdown", () => {
  it("reads the string like an f-string, even without the f prefix", async () => {
    const lines = await tokenizePython(
      '# prompt: markdown\nPROMPT = """# Title\nHi {name}, **{tone}**\n"""\nx = 1',
    );

    assertScopes(scopesOf(lines, 1, "Title"), [
      "meta.template.pymdbars.fstring",
      "markup.heading.markdown",
    ]);
    assertScopes(scopesOf(lines, 2, "name"), ["meta.interpolation.pymdbars"]);
    assertScopes(scopesOf(lines, 2, "tone"), [
      "markup.bold.markdown",
      "meta.interpolation.pymdbars",
    ]);
  });

  it("reads Handlebars written with four braces", async () => {
    const lines = await tokenizePython('# prompt: markdown\nP = """{{{{#if a}}}}x{{{{/if}}}}"""');

    assertScopes(scopesOf(lines, 1, "if"), ["keyword.control.handlebars"]);
  });

  it("ends the string and leaves following code as plain Python", async () => {
    await assertLikePlainPython('# prompt: markdown\nP = """# T\ntext"""\nx = 1', -1);
  });

  const prefixes: [string, string][] = [
    ["f", 'f"""'],
    ["rf", 'rf"""'],
    ["r", 'r"""'],
    ["u", 'u"""'],
    ["single quotes", "'''"],
  ];

  for (const [name, open] of prefixes) {
    it(`accepts the prefix and ends the string: ${name}`, async () => {
      const quotes = open.slice(-3);
      const source = `# prompt: markdown\nP = ${open}# T {a}\n${quotes}\nx = 1`;
      const lines = await assertLikePlainPython(source, -1);

      assertScopes(scopesOf(lines, 1, "T"), ["markup.heading.markdown"]);
      assertScopes(scopesOf(lines, 1, "a"), ["meta.interpolation.pymdbars"]);
    });
  }

  it("accepts annotated, dotted and indented assignments", async () => {
    const source = [
      "class A:",
      "    # prompt: markdown",
      '    PROMPT: str = """# One"""',
      "    # prompt: markdown",
      '    self.text = """# Two"""',
      "    def f(self):",
      "        # prompt: markdown",
      '        x: dict[str, int] = """# Three"""',
    ].join("\n");
    const lines = await tokenizePython(source);

    for (const [line, word] of [
      [2, "One"],
      [4, "Two"],
      [7, "Three"],
    ] as const) {
      assertScopes(scopesOf(lines, line, word), ["markup.heading.markdown"]);
    }
  });

  it("scopes the marker like an ordinary comment", async () => {
    await assertLikePlainPython("# prompt: markdown\nP = '''x'''", 0);
  });
});

describe("# prompt: markdown-handlebars", () => {
  it("reads the string as a Handlebars template, not an f-string", async () => {
    const lines = await tokenizePython(
      '# prompt: markdown-handlebars\nP = """# Hi {{name}}\nkeep {x}\n"""',
    );

    assertScopes(scopesOf(lines, 1, "name"), [
      "meta.template.pymdbars.plain",
      "meta.function.inline.other.handlebars",
    ]);
    assertNoScopes(scopesOf(lines, 2, "keep {x}"), ["meta.interpolation.pymdbars"]);
  });

  it("still treats an explicit f prefix as an f-string", async () => {
    const lines = await tokenizePython('# prompt: markdown-handlebars\nP = f"""{a} {{{{b}}}}"""');

    assertScopes(scopesOf(lines, 1, "a"), ["meta.interpolation.pymdbars"]);
    assertScopes(scopesOf(lines, 1, "b"), ["meta.function.inline.other.handlebars"]);
  });

  it("supports raw prefixes and ends the string", async () => {
    const lines = await assertLikePlainPython(
      '# prompt: markdown-handlebars\nP = r"""# {{a}}\n"""\nx = 1',
      -1,
    );

    assertScopes(scopesOf(lines, 1, "a"), ["meta.function.inline.other.handlebars"]);
  });
});

describe("marker scope limits", () => {
  const unmarked: Record<string, string> = {
    "blank line between marker and assignment": '# prompt: markdown\n\nP = """# T"""',
    "non-assignment line after the marker": '# prompt: markdown\nprint(1)\nP = """# T"""',
    "assignment of a non-string, then a string": '# prompt: markdown\nx = 1\nP = """# T"""',
    "assignment of a one-line string, then a string": '# prompt: markdown\nx = "a"\nP = """# T"""',
    "second assignment after a marked one": '# prompt: markdown\nA = """a"""\nP = """# T"""',
    "marker with extra text": '# prompt: markdown please\nP = """# T"""',
    "marker with a longer name": '# prompt: markdownx\nP = """# T"""',
    "marker with another value": '# prompt: html\nP = """# T"""',
    "marker after code": 'x = 1  # prompt: markdown\nP = """# T"""',
    "marker inside a string": 'S = """\n# prompt: markdown\n"""\nP = """# T"""',
    "marker above a return": '# prompt: markdown\nreturn """# T"""',
    "marker above a comparison": '# prompt: markdown\nx == """# T"""',
  };

  for (const [name, source] of Object.entries(unmarked)) {
    it(`does not highlight the last string: ${name}`, async () => {
      await assertLikePlainPython(source, -1);
    });
  }
});
