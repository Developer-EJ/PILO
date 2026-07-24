export type GithubActiveBoardSnapshotRevision = number;

export type GithubActiveBoardRevisionGuard = {
  captureSnapshot: () => GithubActiveBoardSnapshotRevision;
  recordActivation: () => GithubActiveBoardSnapshotRevision;
  isSnapshotCurrent: (
    snapshotRevision: GithubActiveBoardSnapshotRevision
  ) => boolean;
};

export function createGithubActiveBoardRevisionGuard():
  GithubActiveBoardRevisionGuard {
  let revision = 0;

  return {
    captureSnapshot: () => revision,
    recordActivation: () => {
      revision += 1;
      return revision;
    },
    isSnapshotCurrent: (snapshotRevision) => snapshotRevision === revision
  };
}
