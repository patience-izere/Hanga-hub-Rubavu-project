import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../dist", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const limits = { ".js": 900_000, ".css": 100_000 };
const totalLimit = 2_000_000;
const files = [];

async function collect(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const details = await stat(path);
    if (details.isDirectory()) await collect(path);
    else files.push({ path, bytes: details.size });
  }
}

await collect(root);
const violations = files.filter(({ path, bytes }) => {
  const extension = Object.keys(limits).find((item) => path.endsWith(item));
  return extension ? bytes > limits[extension] : false;
});
const total = files.reduce((sum, file) => sum + file.bytes, 0);
if (total > totalLimit) violations.push({ path: root, bytes: total });

// What every page downloads before it can render: the entry script and its modulepreloads.
// Login and the learner dashboard must not pay for the 3D engine (about 1 MB) on mobile data.
const initialLimit = 450_000;
const html = await readFile(join(root, "index.html"), "utf8");
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
  (match) => match[1],
);
const initialBytes = files
  .filter(({ path }) => initial.some((asset) => path.endsWith(asset)))
  .reduce((sum, file) => sum + file.bytes, 0);
for (const asset of initial.filter((name) => /three/.test(name))) {
  violations.push({ path: join(root, asset), bytes: 0, reason: "3D code in the initial load" });
}
if (initialBytes > initialLimit) {
  violations.push({ path: join(root, "index.html"), bytes: initialBytes, reason: "initial JS" });
}
if (violations.length) {
  for (const violation of violations) {
    console.error(
      `Performance budget exceeded: ${relative(root, violation.path) || "total"} ` +
        `(${violation.reason ?? "size"}, ${violation.bytes} bytes)`,
    );
  }
  process.exit(1);
}
console.log(
  `Performance budgets passed: ${files.length} files, ${total} bytes total, ` +
    `${initialBytes} bytes of initial JavaScript.`,
);
