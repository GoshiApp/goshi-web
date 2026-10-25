/** Helpers for the guest onboarding wizard (test site only): names and room codes. Pure, no DOM. */

export const GUEST_NAME_MAX = 14;

/** The two word lists the generated names combine. Short, language neutral, no accents. */
export const GUEST_NAME_A = ["Orb", "Nexo", "Giro", "Volt", "Faro", "Comet", "Pulso", "Eco", "Bruma", "Faro2"] as const;
export const GUEST_NAME_B = ["Veloz", "Dorado", "Bravo", "Noble", "Agil", "Sereno", "Firme", "Libre", "Vivo", "Calmo"] as const;

/** The same cleaning the page and the server apply, so the wizard never sends a name the server would cut. */
export function cleanGuestName(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, GUEST_NAME_MAX).trim();
}

/** A fun two-part name plus two digits. rng is injectable so tests are deterministic. */
export function makeGuestName(rng: () => number): string {
  const a = GUEST_NAME_A[Math.floor(rng() * GUEST_NAME_A.length) % GUEST_NAME_A.length];
  const b = GUEST_NAME_B[Math.floor(rng() * GUEST_NAME_B.length) % GUEST_NAME_B.length];
  const digits = Math.floor(rng() * 100);
  const name = `${a}${b}${String(digits).padStart(2, "0")}`;
  // A long pair plus two digits can reach 15 characters: drop the digits to one when it does.
  return name.length <= GUEST_NAME_MAX ? name : name.slice(0, GUEST_NAME_MAX);
}

/** "k7q2 zm" -> "K7Q2"; anything without valid characters -> "". */
export function cleanGuestCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
