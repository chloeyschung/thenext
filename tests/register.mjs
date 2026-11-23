// Node's built-in TS support needs extension resolution for Next.js imports.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".") || /\.[a-z]+$/i.test(specifier)) {
        throw error;
      }
      return nextResolve(`${specifier}.ts`, context);
    }
  },
  load(url, context, nextLoad) {
    // Explicit module format avoids changing the app's package type for tests.
    return nextLoad(url, url.endsWith(".ts") ? { ...context, format: "module-typescript" } : context);
  },
});
