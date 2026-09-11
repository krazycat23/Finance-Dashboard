/**
 * Bundles and runs scripts/verify.ts.
 *
 * The verification imports application modules that use the `@/` alias and
 * Vite's `import.meta.env`, so it is bundled with esbuild (already present as a
 * Vite dependency) rather than adding a separate TypeScript runner.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(resolve(tmpdir(), "verify-"));
const outfile = resolve(outDir, "verify.mjs");

try {
  await build({
    entryPoints: [resolve(root, "scripts/verify.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    alias: { "@": resolve(root, "src") },
    define: { "import.meta.env.DEV": "false" },
    logLevel: "error",
  });
  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
