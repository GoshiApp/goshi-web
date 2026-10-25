// Which program the page talks to. The test site runs contract v6 (3 percent house fee, prizes from the cash in the room,
// backpacks for traps); goshi.app keeps v5 (10 percent, prizes from the nominal pot) until its program is upgraded.
// Chosen at build time from PUBLIC_TARGET; outside a build (the unit tests) it is v6.
const env = (import.meta as { env?: Record<string, string | undefined> }).env;
export const CONTRACT_V6: boolean = env === undefined ? true : env.PUBLIC_TARGET === "test";
