export function parseLatestMarkerInt(
  snapshot: string | null,
  marker: string,
): number | null {
  if (!snapshot) {
    return null;
  }

  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...snapshot.matchAll(new RegExp(`${escapedMarker}(\\d+)`, "g"))];
  const value = matches.at(-1)?.[1];
  return value ? Number(value) : null;
}
