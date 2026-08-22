import { readFileSync, writeFileSync } from "node:fs";

const [,, inFile = "architecture_hypothesis.md", outFile = "architecture_hypothesis.html"] = process.argv;

const md = readFileSync(inFile, "utf8");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Architecture Hypothesis — DeepTutor Brain → Learning Dojo</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
  html { background: #ffffff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 980px; margin: 0 auto; padding: 40px 24px 80px;
    line-height: 1.65;
    background: #ffffff; color: #1a1a24;
  }
  h1 { border-bottom: 2px solid #7c6ee0; padding-bottom: 8px; color: #14101f; }
  h2 { border-bottom: 1px solid #d8d8e0; padding-bottom: 5px; margin-top: 40px; color: #14101f; }
  h3 { color: #14101f; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; color: #1a1a24; }
  th, td { border: 1px solid #c9c9d4; padding: 8px 12px; text-align: left; vertical-align: top; color: #1a1a24; }
  th { background: #efeafb; color: #14101f; }
  tr:nth-child(even) td { background: #fafafd; }
  code { background: #efeff5; color: #3b2f7a; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f4f4fa; border-radius: 8px; border: 1px solid #e2e2ec; }
  pre code { display: block; padding: 14px; overflow-x: auto; background: transparent; color: #24243a; }
  blockquote {
    border-left: 4px solid #7c6ee0; margin: 16px 0; padding: 8px 18px;
    background: #f6f4fd; color: #33334a; border-radius: 0 8px 8px 0;
  }
  .mermaid {
    display: flex; justify-content: center; margin: 20px 0;
    background: #ffffff; border: 1px solid #e3e3ea; border-radius: 8px; padding: 16px;
  }
  hr { border: none; border-top: 1px solid #dcdce4; margin: 32px 0; }
  a { color: #5b4bc4; }
  li { margin: 4px 0; }
</style>
</head>
<body>
<div id="content">Loading…</div>
<script type="text/markdown" id="md-src">${md}</script>
<script>
  const src = document.getElementById('md-src').textContent;
  const div = document.createElement('div');
  div.innerHTML = marked.parse(src);
  div.querySelectorAll('pre > code.language-mermaid').forEach((el) => {
    const m = document.createElement('div');
    m.className = 'mermaid';
    m.textContent = el.textContent;
    el.closest('pre').replaceWith(m);
  });
  document.getElementById('content').replaceChildren(div);
  mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });
</script>
</body>
</html>`;

writeFileSync(outFile, html);
console.log("written", html.length, "bytes");
