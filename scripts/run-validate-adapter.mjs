import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const outfile = resolve("node_modules/.cache/validate-adapter.mjs");
await build({
  entryPoints: [resolve("scripts/validate-adapter.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  sourcemap: "inline",
  tsconfig: resolve("tsconfig.app.json"),
  alias: { "@": resolve("src") },
  define: { "import.meta.env.DEV": "false" },
  // Adapters may parse workbooks with CommonJS libraries such as `xlsx`, which
  // call `require` at load. The verify runner already does this; the bundle is
  // ESM, so `require` has to be reconstructed for them.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
