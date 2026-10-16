// The words of the "who leads and by how much" strip of the arena, set by the page (it has the language).
export interface LeadStrings { top: string; youLead: string; youBehind: string }
let strings: LeadStrings = { top: "\u265b {name}  {m}", youLead: "You lead by {n}", youBehind: "You are #{rank}, {n} behind" };
export function setLeadStrings(s: LeadStrings): void { strings = s; }
export function leadStrings(): LeadStrings { return strings; }
