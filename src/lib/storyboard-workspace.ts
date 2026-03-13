interface StoryboardShotIdentity {
  id: string;
}

export function getSelectedShotId<T extends StoryboardShotIdentity>(
  shots: T[],
  selectedShotId: string | undefined
): string | null {
  if (shots.length === 0) {
    return null;
  }

  if (selectedShotId && shots.some((shot) => shot.id === selectedShotId)) {
    return selectedShotId;
  }

  return shots[0].id;
}

export function getAdjacentShotIds<T extends StoryboardShotIdentity>(
  shots: T[],
  selectedShotId: string
): string[] {
  const selectedIndex = shots.findIndex((shot) => shot.id === selectedShotId);

  if (selectedIndex === -1) {
    return [];
  }

  const adjacentIds: string[] = [];

  if (selectedIndex > 0) {
    adjacentIds.push(shots[selectedIndex - 1].id);
  }

  if (selectedIndex < shots.length - 1) {
    adjacentIds.push(shots[selectedIndex + 1].id);
  }

  return adjacentIds;
}
