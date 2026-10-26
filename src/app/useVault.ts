import { useSyncExternalStore } from "react";
import { vault } from "../data/vault";

let version = 0;
vault.subscribe(() => { version++; });

export function useVault() {
  useSyncExternalStore(
    (cb) => vault.subscribe(cb),
    () => version,
  );
  return vault;
}
