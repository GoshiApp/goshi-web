// Entry of the free practice card (no wallet). The match itself and the arena live in arena-shell.ts.
import { getShell } from "./arena-shell.ts";

getShell()?.bindCard();
