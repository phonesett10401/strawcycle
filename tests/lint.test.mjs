// Guards against code hidden after a trailing `//` comment (the source of several film bugs).
// Heuristic: scan each file as JS with a small tokenizer that skips '...' / "..." strings and `...` template
// literals (GLSL lives there; `https://` inside a string never counts). For each real `//` comment, flag it if its
// text contains `;` followed by something statement-shaped: a declaration (`const x =`), an `if (` / `for (` / `while (`, or an identifier
// then `(` with no space, `=` / `+=` (not `==`), or `++`/`--`. Prose with semicolons passes.
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';

const STATEMENT = /;\s*(?:(?:const|let|var)\s+\w+\s*=|(?:if|for|while)\s*\(|[A-Za-z_$][\w$.\[\]]*(?:\(|\s*[-+*\/]?=(?!=)|\+\+|--))/;

export function commentsOf(src) {
  const out = []; let line = 1, i = 0, mode = null;   // mode: ' " ` or null
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') line++;
    if (mode) {
      if (c === '\\') { i += 2; continue; }
      if (c === mode) mode = null;
      else if (c === '\n' && mode !== '`') mode = null;
    } else if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i); const e = end < 0 ? src.length : end;
      out.push({ line, text: src.slice(i + 2, e) }); i = e; continue;
    } else if (c === '/' && n === '*') {
      const e = src.indexOf('*/', i + 2); for (const ch of src.slice(i, e)) if (ch === '\n') line++;
      i = e + 2; continue;
    } else if (c === "'" || c === '"' || c === '`') mode = c;
    i++;
  }
  return out;
}

test('heuristic catches hidden statements and ignores URLs, strings and GLSL', () => {
  assert.equal(commentsOf('a(); // note; b = 2;').filter((c) => STATEMENT.test(c.text)).length, 1);
  assert.equal(commentsOf('a(); // note; render(p);').filter((c) => STATEMENT.test(c.text)).length, 1);
  assert.equal(commentsOf("const u = 'https://x.y'; // a plain note; fine").filter((c) => STATEMENT.test(c.text)).length, 0);
  assert.equal(commentsOf('const g = `x; // y = 1;\n`; f();').length, 0);
});

for (const f of ['film.js', 'post.js', 'tiers.js', 'timeline.js']) {
  test(`${f}: no code after a trailing // comment`, () => {
    const bad = commentsOf(readFileSync(new URL('../' + f, import.meta.url), 'utf8')).filter((c) => STATEMENT.test(c.text));
    assert.deepEqual(bad.map((c) => `${f}:${c.line} ${c.text.trim()}`), []);
  });
}
