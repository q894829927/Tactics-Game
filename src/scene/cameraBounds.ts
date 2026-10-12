/**
 * Keep the whole map inside the viewport when it fits, while allowing it to
 * move freely within the remaining space. When the map exceeds the viewport,
 * keep the viewport fully covered by the map.
 *
 * This fixes the previous centered-only rule that silently discarded every
 * drag offset at small zoom levels.
 */
export function clampCameraOffset(offset: number, worldSize: number, viewportSize: number): number {
  if (worldSize <= viewportSize) {
    return Math.max(0, Math.min(viewportSize - worldSize, offset));
  }
  return Math.min(0, Math.max(viewportSize - worldSize, offset));
}
