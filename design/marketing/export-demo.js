/* eslint-env node, es2020 */
/* eslint-disable @typescript-eslint/no-var-requires -- plain CommonJS script run with node */
// Runs the real code.js against the demo design system and writes its CSS and Tailwind output,
// so the store images show genuine plugin output. Run `npm run build:code` first.
// Usage: node design/marketing/export-demo.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
require("./demo-figma.js");

const root = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(root, "code.js"), "utf8");

(async () => {
  const posted = [];
  const figma = globalThis.makeDemoFigma((m) => posted.push(m));
  vm.runInContext(src, vm.createContext({ figma, __html__: "", console }));
  await figma.ui.onmessage({ type: "RUN", payload: { nameMode: "code-syntax", unitPxForFloat: true, prefix: "" } });
  const res = posted.find((p) => p.type === "RESULT");
  if (!res) throw new Error("no RESULT: " + JSON.stringify(posted));
  fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "out", "demo.css"), res.payload.css);
  fs.writeFileSync(path.join(__dirname, "out", "demo.tailwind.js"), res.payload.tailwind);
  console.log("wrote out/demo.css and out/demo.tailwind.js");
})();
