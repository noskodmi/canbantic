/**
 * Returns the @kanbantic/shared package version. Used as a smoke check
 * that the workspace + TS toolchain is wired correctly. Will be replaced
 * by a real export surface (ABIs, viem clients, ENS helpers) in Phase 1+.
 */
export function version(): string {
  return "0.0.0";
}
