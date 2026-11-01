import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenizePython } from "./tokenize";

// Anything that is neither inside TemplateStr(...) nor under a marker comment must tokenize exactly
// like plain Python, line by line.
const samples: Record<string, string> = {
  "module docstring": '"""# Title\n\n{{name}} {x}\n"""\nx = 1',
  "function docstring":
    'def f():\n    """Do *things*.\n\n    ```python\n    x = 1\n    ```\n    """\n    return 1',
  "plain triple-quoted assignment": 'P = """# Title\n{{#if a}}x{{/if}}\n"""\ny = 2',
  "f-string assignment": 'P = f"""# {name}\n{{{{a}}}}\n"""\ny = 2',
  "raw f-string assignment": "P = rf'''# {name}'''\ny = 2",
  "single-quoted triple": "P = '''# T'''\ny = 2",
  bytes: 'P = b"""# T"""\ny = 2',
  "other call with f-string": 'render(f"""# {name}""")\ny = 2',
  "other call with plain string": 'render("""# {{name}}""", x=1)\ny = 2',
  "similar call names":
    'MyTemplateStr("""# T""")\nTemplateStrFoo("""# T""")\nTemplateStr.x("""# T""")',
  "TemplateStr not called": "cls = TemplateStr\nz = [TemplateStr]",
  "one-line strings in TemplateStr":
    'TemplateStr("{{name}} {x}")\nTemplateStr(\'# T\')\nTemplateStr(f"{a}")',
  "TemplateStr with a variable": "TemplateStr(template, strict=True)\ny = 2",
  "dict and list values": 'd = {"a": """# T""", "b": [f"""{x}"""]}',
  "comments near the marker":
    "# prompt: other\n# a prompt: markdown\n#prompt markdown\nP = '''x'''",
  "marker-like text in a docstring":
    'def f():\n    """\n    # prompt: markdown\n    """\n    P = """# T"""',
};

describe("unmarked strings keep plain Python highlighting", () => {
  for (const [name, source] of Object.entries(samples)) {
    it(name, async () => {
      assert.deepEqual(await tokenizePython(source), await tokenizePython(source, false));
    });
  }
});
