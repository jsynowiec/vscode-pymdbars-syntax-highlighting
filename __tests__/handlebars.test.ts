import { describe, it } from "node:test";
import {
  assertLikePlainPython,
  assertNoScopes,
  assertScopes,
  scopesOf,
  tokenizePython,
} from "./tokenize";

const tpl = (body: string, prefix = "") => `p = TemplateStr(${prefix}"""${body}""")`;

describe("Handlebars in a plain TemplateStr string", () => {
  it("scopes a variable and keeps the surrounding Markdown", async () => {
    const lines = await tokenizePython(tpl("# Hi {{name}}\nBe **{{tone}}** now.\n"));
    assertScopes(scopesOf(lines, 0, "name"), [
      "meta.template.pymdbars.plain",
      "markup.heading.markdown",
      "meta.function.inline.other.handlebars",
      "variable.parameter.handlebars",
    ]);
    assertScopes(scopesOf(lines, 1, "tone"), [
      "markup.bold.markdown",
      "meta.function.inline.other.handlebars",
      "variable.parameter.handlebars",
    ]);
    assertScopes(scopesOf(lines, 0, "{{"), ["support.constant.handlebars"]);
  });

  it("scopes conditionals: if, else and the closing tag", async () => {
    const lines = await tokenizePython(tpl("{{#if admin}}\nyes\n{{else}}\nno\n{{/if}}\n"));
    assertScopes(scopesOf(lines, 0, "if"), [
      "meta.function.block.start.handlebars",
      "keyword.control.handlebars",
    ]);
    assertScopes(scopesOf(lines, 0, "admin"), ["variable.parameter.handlebars"]);
    assertScopes(scopesOf(lines, 2, "else"), [
      "meta.function.inline.else.handlebars",
      "keyword.control.handlebars",
    ]);
    assertScopes(scopesOf(lines, 4, "if"), [
      "meta.function.block.end.handlebars",
      "keyword.control.handlebars",
    ]);
  });

  it("scopes loops with block parameters and @data variables", async () => {
    const lines = await tokenizePython(
      tpl("{{#each items as |item i|}}\n{{@index}} {{item.name}}\n{{/each}}\n"),
    );
    assertScopes(scopesOf(lines, 0, "each"), ["keyword.control.handlebars"]);
    assertScopes(scopesOf(lines, 0, "items"), ["variable.parameter.handlebars"]);
    assertScopes(scopesOf(lines, 0, "item i"), ["variable.parameter.handlebars"]);
    assertScopes(scopesOf(lines, 1, "@index"), ["variable.parameter.handlebars"]);
    assertScopes(scopesOf(lines, 1, "item.name"), ["variable.parameter.handlebars"]);
  });

  it("scopes helper calls, literals, hash arguments and strings", async () => {
    const lines = await tokenizePython(tpl("{{upper name \"x\" 3 true sep=', '}}"));
    assertScopes(scopesOf(lines, 0, "upper"), ["entity.name.function.handlebars"]);
    assertScopes(scopesOf(lines, 0, "name"), ["variable.parameter.handlebars"]);
    assertScopes(scopesOf(lines, 0, "3"), ["constant.numeric.handlebars"]);
    assertScopes(scopesOf(lines, 0, "true"), ["constant.language.handlebars"]);
    assertScopes(scopesOf(lines, 0, "sep"), ["entity.other.attribute-name.handlebars"]);
    assertScopes(scopesOf(lines, 0, ", "), ["string.quoted.single.handlebars"]);
  });

  it("scopes comments, including multi-line ones, and triple-stash output", async () => {
    const lines = await tokenizePython(tpl("{{! note }}\n{{!-- long\ncomment --}}\n{{{raw}}}\n"));
    assertScopes(scopesOf(lines, 0, "note"), ["comment.block.handlebars"]);
    assertScopes(scopesOf(lines, 2, "comment"), ["comment.block.handlebars"]);
    assertScopes(scopesOf(lines, 3, "raw"), [
      "meta.function.inline.other.handlebars",
      "variable.parameter.handlebars",
    ]);
  });

  it("scopes partials", async () => {
    const lines = await tokenizePython(tpl("{{> header title}}"));
    assertScopes(scopesOf(lines, 0, "header"), ["variable.parameter.handlebars"]);
    assertScopes(scopesOf(lines, 0, "{{>"), ["support.constant.handlebars"]);
  });

  it("treats single braces as literal text", async () => {
    const lines = await tokenizePython(tpl("keep {name} and {{name}}"));
    assertNoScopes(scopesOf(lines, 0, "keep {name} and"), ["meta.interpolation.pymdbars"]);
  });

  it("still ends the string after an unterminated tag", async () => {
    await assertLikePlainPython(tpl("hello {{name") + "\nx = 1", -1);
  });
});

describe("Handlebars in an f-string TemplateStr string", () => {
  it("treats four braces as Handlebars and highlights {expr} as Python", async () => {
    const lines = await tokenizePython(tpl("Hi {name}, write {{{{language}}}}.", "f"));
    assertScopes(scopesOf(lines, 0, "language"), [
      "meta.function.inline.other.handlebars",
      "variable.parameter.handlebars",
    ]);
    assertNoScopes(scopesOf(lines, 0, "language"), ["constant.character.escape.python"]);
    assertScopes(scopesOf(lines, 0, "name"), ["meta.interpolation.pymdbars"]);
    assertScopes(scopesOf(lines, 0, "{{{{"), ["support.constant.handlebars"]);
    assertScopes(scopesOf(lines, 0, "}}}}"), ["support.constant.handlebars"]);
  });

  it("scopes block tags written with four braces", async () => {
    const lines = await tokenizePython(
      tpl("{{{{#if admin}}}}\nyes\n{{{{else}}}}\nno\n{{{{/if}}}}\n", "f"),
    );
    assertScopes(scopesOf(lines, 0, "if"), ["keyword.control.handlebars"]);
    assertScopes(scopesOf(lines, 2, "else"), ["keyword.control.handlebars"]);
    assertScopes(scopesOf(lines, 4, "if"), ["keyword.control.handlebars"]);
  });

  it("scopes six braces as triple-stash output", async () => {
    const lines = await tokenizePython(tpl("{{{{{{raw}}}}}}", "f"));
    assertScopes(scopesOf(lines, 0, "raw"), ["meta.function.inline.other.handlebars"]);
  });

  it("keeps two braces as Python escapes, not Handlebars", async () => {
    const lines = await tokenizePython(tpl("{{literal}}", "f"));
    assertScopes(scopesOf(lines, 0, "{{"), ["constant.character.escape.python"]);
    assertNoScopes(scopesOf(lines, 0, "literal"), ["meta.function.inline.other.handlebars"]);
  });

  it("reads three braces like Python: escaped brace, expression, escaped brace", async () => {
    const lines = await tokenizePython(tpl("{{{x}}}", "f"));
    assertScopes(scopesOf(lines, 0, "{{"), ["constant.character.escape.python"]);
    assertScopes(scopesOf(lines, 0, "x"), ["meta.interpolation.pymdbars"]);
    assertScopes(scopesOf(lines, 0, "}}"), ["constant.character.escape.python"]);
  });

  it("reads an f-string expression inside a Handlebars tag as Python", async () => {
    const lines = await tokenizePython(tpl("{{{{#if {flag}}}}}yes{{{{/if}}}}", "f"));
    assertScopes(scopesOf(lines, 0, "flag"), ["meta.interpolation.pymdbars"]);
    assertNoScopes(scopesOf(lines, 0, "flag"), ["variable.parameter.handlebars"]);
    assertNoScopes(scopesOf(lines, 0, "yes"), ["meta.function.block.start.handlebars"]);
  });

  it("reads an f-string expression as the whole content of a tag", async () => {
    const lines = await tokenizePython(tpl("{{{{{x}}}}}", "f"));
    assertScopes(scopesOf(lines, 0, "x"), ["meta.interpolation.pymdbars"]);
  });

  it("still ends the string after an unterminated tag", async () => {
    await assertLikePlainPython(tpl("hello {{{{name", "f") + "\nx = 1", -1);
  });
});

describe("the other quote style inside a tag or expression", () => {
  const tag = "p = TemplateStr('''{{upper \"\"\"}}''')";
  const expression = "p = TemplateStr(f\"\"\"{d['''k''']}\"\"\")";

  it("does not end a Handlebars tag", async () => {
    const lines = await tokenizePython(tag);
    assertScopes(scopesOf(lines, 0, "}}"), ["support.constant.handlebars"]);
  });

  it("does not end an f-string expression", async () => {
    const lines = await tokenizePython(expression);
    assertScopes(scopesOf(lines, 0, "k"), ["meta.interpolation.pymdbars"]);
  });

  it("also preserves the other quote style with double-quoted outer strings", async () => {
    const tag = `p = TemplateStr("""{{upper '''}}""")`;
    const expression = `p = TemplateStr(f'''{d["""k"""]}''')`;
    assertScopes(scopesOf(await tokenizePython(tag), 0, "}}"), ["support.constant.handlebars"]);
    assertScopes(scopesOf(await tokenizePython(expression), 0, "k"), [
      "meta.interpolation.pymdbars",
    ]);
    await assertLikePlainPython(`${tag}\nx = 1`, -1);
    await assertLikePlainPython(`${expression}\nx = 1`, -1);
  });

  it("keeps tag delimiters inside complete quoted arguments", async () => {
    const lines = await tokenizePython(tpl(`{{upper "}}" sep='}}'}}`));
    assertScopes(scopesOf(lines, 0, "}}"), ["string.quoted.double.handlebars"]);
  });

  it("still closes the string", async () => {
    await assertLikePlainPython(`${tag}\nx = 1`, -1);
    await assertLikePlainPython(`${expression}\nx = 1`, -1);
  });
});
