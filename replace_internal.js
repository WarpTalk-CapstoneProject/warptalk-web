/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS maintenance script */
const fs = require("fs");
const path = require("path");

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      let content = fs.readFileSync(fullPath, "utf8");
      let originalContent = content;

      // Replacements
      content = content.replace(/"\/internal\//g, '"/');
      content = content.replace(/"\/internal"/g, '"/billing"');
      content = content.replace(/\/internal\//g, "/");
      content = content.replace(/\/internal/g, "/billing");

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, "utf8");
        console.log("Updated " + fullPath);
      }
    }
  }
}

processDir("src");
