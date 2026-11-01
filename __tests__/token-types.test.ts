import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenTypesOf } from "./tokenize";

// VS Code derives a token type from the scopes. Bracket pairing, quote auto-closing and
// suggestions treat "string" tokens as prose and everything else as code, so the whole template
// text has to count as a string.
const templates: Record<string, string> = {
  "f-string": [
    'p = TemplateStr(f"""# Title {name}',
    "Prose (with a [link](x) and :) smileys) {a.b:>4} {{{{#if c}}}}d{{{{/if}}}}",
    "`code {x}` **bold** > quote",
    "```json",
    '{"a": 1}',
    "```",
    '""")',
  ].join("\n"),
  "plain string": [
    'p = TemplateStr("""# Title {{name}}',
    "Prose (with a [link](x) and :) smileys) {{#if c}}d{{else}}e{{/if}} {{!-- note --}}",
    "- item {{{raw}}}",
    '""")',
  ].join("\n"),
  marker: '# prompt: markdown\nP = """# Title {x}\nProse (a :)\n"""',
};

describe("template text is a string or comment token", () => {
  for (const [name, source] of Object.entries(templates)) {
    it(name, async () => {
      const types = await tokenTypesOf(source);
      // Everything between the first and the last triple quote is template text.
      const bodyStart = source.search(/"""|'''/) + 3;
      const bodyEnd = Math.max(source.lastIndexOf('"""'), source.lastIndexOf("'''"));
      assert.ok(bodyEnd > bodyStart);

      let offset = 0;

      for (const [row, line] of source.split("\n").entries()) {
        for (let col = 0; col < line.length; col++) {
          const at = offset + col;
          if (at < bodyStart || at >= bodyEnd) continue;
          // Handlebars comments are comment tokens, which VS Code also treats as prose.
          const type = types[row][col];
          assert.ok(
            type === "string" || type === "comment",
            `line ${row}, column ${col} is ${type}: ${line.slice(col)}`,
          );
        }
        offset += line.length + 1;
      }
    });
  }
});
