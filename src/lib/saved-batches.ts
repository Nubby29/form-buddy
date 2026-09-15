export type SavedBatch = {
  id: string;
  name: string;
  urls: string[];
  createdAt: string;
};

const KEY = "formcheck.saved-batches";

export function loadSavedBatches(): SavedBatch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is SavedBatch =>
        !!b && typeof b === "object" && Array.isArray((b as SavedBatch).urls),
    );
  } catch {
    return [];
  }
}

function persist(batches: SavedBatch[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(batches));
  } catch {
    /* storage unavailable */
  }
}

export function addSavedBatch(name: string, urls: string[]): SavedBatch[] {
  const batch: SavedBatch = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    urls,
    createdAt: new Date().toISOString(),
  };
  const next = [batch, ...loadSavedBatches()];
  persist(next);
  return next;
}

export function removeSavedBatch(id: string): SavedBatch[] {
  const next = loadSavedBatches().filter((b) => b.id !== id);
  persist(next);
  return next;
}
