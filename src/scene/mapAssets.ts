import { MAP_ASSET_FILES } from "./mapAssetFiles.ts";

export { MAP_ASSET_FILES };
export type MapAssetFile = typeof MAP_ASSET_FILES[keyof typeof MAP_ASSET_FILES];

const pendingAssets = new Map<MapAssetFile, Promise<string>>();

/** Content-hashed art is immutable: reuse the browser's response cache across visits. */
export function loadMapAsset(file: MapAssetFile): Promise<string> {
  const existing = pendingAssets.get(file);
  if (existing) return existing;
  const url = (import.meta.env?.BASE_URL ?? "/games/tactics/") + "assets/maps/red-banner/" + file;
  const pending = fetch(url, {cache: "force-cache"})
    .then(response => {
      if (!response.ok) throw new Error("Map asset unavailable");
      return response.blob();
    })
    .then(blob => URL.createObjectURL(blob))
    // Preserve the ordinary image error/fallback behavior when Fetch/cache is unavailable.
    .catch(() => url);
  pendingAssets.set(file, pending);
  return pending;
}
