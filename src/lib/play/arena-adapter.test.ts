import { test } from "node:test";
import assert from "node:assert/strict";
import { getArena, registerArena, type RealtimeArena } from "./arena-adapter.ts";

test("no real-time arena exists yet", () => {
  assert.equal(getArena(), null);
});

test("a future arena can register through the typed interface", () => {
  const fake: RealtimeArena = {
    id: "fake",
    name: { es: "Falso", en: "Fake" },
    status: "idle",
    mount: async () => {},
    start: () => {},
    onFinish: () => () => {},
    dispose: () => {},
  };
  registerArena(fake);
  assert.equal(getArena(), fake);
});
