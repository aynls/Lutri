const key = "lutri.viewer.context";
export function setViewerContext(assetIds: string[]) {
  localStorage.setItem(key, JSON.stringify({ ids: assetIds, at: Date.now() }));
}
export function takeViewerContext(assetId: string): string {
  let ids = [assetId];
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Date.now() - value?.at < 60000 && Array.isArray(value?.ids) && value.ids.includes(assetId)) ids = value.ids;
  } catch {
    /* Use the current image alone. */
  }
  localStorage.removeItem(key);
  const token = crypto.randomUUID();
  localStorage.setItem(`${key}:${token}`, JSON.stringify({ ids, at: Date.now() }));
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const name = localStorage.key(i);
    if (name?.startsWith(`${key}:`)) {
      try {
        const value = JSON.parse(localStorage.getItem(name) ?? "null");
        if (Date.now() - value?.at > 86400000) localStorage.removeItem(name);
      } catch {
        localStorage.removeItem(name);
      }
    }
  }
  return token;
}
export function getViewerContext(assetId: string): string[] {
  const token = new URLSearchParams(location.search).get("context");
  const name = `${key}:${token}`;
  try {
    const raw = sessionStorage.getItem(name) ?? localStorage.getItem(name) ?? "null";
    const value = JSON.parse(raw);
    if (Array.isArray(value?.ids) && value.ids.includes(assetId)) {
      sessionStorage.setItem(name, raw);
      localStorage.removeItem(name);
      return value.ids;
    }
    return [assetId];
  } catch {
    return [assetId];
  }
}
