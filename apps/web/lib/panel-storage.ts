/**
 * SSR-safe storage for react-resizable-panels layout persistence. The library's
 * default storage is `localStorage`, which is read during render (including
 * server snapshots) and would throw on the server — this guards every access.
 */
export const panelStorage: Pick<Storage, "getItem" | "setItem"> = {
  getItem: (key) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
};
