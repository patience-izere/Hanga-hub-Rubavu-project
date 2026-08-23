import { readdir, stat } from "node:fs/promises";
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
if (violations.length) {
  for (const violation of violations) {
    console.error(
      `Performance budget exceeded: ${relative(root, violation.path) || "total"} (${violation.bytes} bytes)`,
    );
  }
  process.exit(1);
}
console.log(`Performance budgets passed: ${files.length} files, ${total} bytes total.`);
