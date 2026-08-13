import fs from "node:fs";
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", '<!doctype html><html><body><main><h1>Local build</h1><button type="button">Run</button></main></body></html>\n');
