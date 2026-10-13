// The random id of this browser, used only to count one person once however many tabs are open. It is not tied to a wallet or a
// name. The team's own browsers (opened once with ?team=1) have none, so they are never counted.
const KEY = "goshi-vid";

export function visitorId(): string {
  try {
    if (localStorage.getItem("goshi-team") === "1") return "";
    let v = localStorage.getItem(KEY) ?? "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(v)) {
      v = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return "";
  }
}
