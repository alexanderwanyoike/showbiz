interface StoryboardShotIdentity {
  id: string;
}

export function getSelectedShotId<T extends StoryboardShotIdentity>(
  shots: T[],
  selectedShotId: string | undefined
): string | null {
  if (shots.length === 0) return null;
  if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) {
    return selectedShotId;
  }
  return shots[0].id;
}

export function getAdjacentShotIds<T extends StoryboardShotIdentity>(
  shots: T[],
  selectedShotId: string
): string[] {
  const index = shots.findIndex((shot) => shot.id === selectedShotId);
  if (index === -1) return [];

  const ids: string[] = [];
  if (index > 0) ids.push(shots[index - 1].id);
  if (index < shots.length - 1) ids.push(shots[index + 1].id);
  return ids;
}
