/**
 * PIPE-06 layer 2: after `next build`, every App Router route must be prerendered.
 * Reads Next's machine-readable manifests instead of parsing build stdout.
 */
import { existsSync, readFileSync } from "node:fs";

const PRERENDER = ".next/prerender-manifest.json";
const APP_ROUTES = ".next/app-path-routes-manifest.json";

for (const file of [PRERENDER, APP_ROUTES]) {
  if (!existsSync(file)) {
    console.error(`check-static: ${file} not found. Run \`npm run build\` first.`);
    process.exit(1);
  }
}

const prerender = JSON.parse(readFileSync(PRERENDER, "utf8")) as {
  routes?: Record<string, unknown>;
};
const appRoutes = JSON.parse(readFileSync(APP_ROUTES, "utf8")) as Record<string, string>;

const staticRoutes = new Set(Object.keys(prerender.routes ?? {}));
const dynamicRoutes = Object.values(appRoutes).filter((route) => !staticRoutes.has(route));

if (dynamicRoutes.length > 0) {
  console.error("Dynamic routes found:");
  for (const route of dynamicRoutes) console.error(`  - ${route}`);
  process.exit(1);
}

console.log(`All ${Object.keys(appRoutes).length} app routes are static.`);
