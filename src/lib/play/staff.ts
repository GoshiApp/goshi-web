// The project's own wallet. The word the board shows for "you" becomes CEO when the connected wallet is this one.
export const CEO_WALLET = "2kLcGpwnpz5eroGRW2kWqCdizmPEGDLTb5JAce9u2GJ9";
export const CEO_LABEL = "CEO";
/** "(you)" in a list: the CEO label for the project's wallet, the page's own word for everybody else. */
let enabled = false;
/** Only the version with real money gives the label; the practice site shows everybody the same word. */
export function enableStaffLabels(on: boolean): void { enabled = on; }
export const youWord = (wallet: string | null | undefined, youText: string): string => (enabled && wallet === CEO_WALLET ? CEO_LABEL : youText);
