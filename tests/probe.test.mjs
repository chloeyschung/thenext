import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("live probe refuses to run without explicit quota-spending opt-in", () => {
  const env = { ...process.env, TMAP_APP_KEY: "" };
  delete env.ALLOW_TMAP_PROBE;
  const child = spawnSync(process.execPath, [
    "--conditions=react-server", "--import", "./tests/register.mjs", "scripts/probe-tmap.mjs",
  ], { cwd: new URL("../", import.meta.url), env, encoding: "utf8", timeout: 5000 });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /ALLOW_TMAP_PROBE=1/);
  assert.equal(child.stdout, "");
});
