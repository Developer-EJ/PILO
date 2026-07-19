type SessionWithId = { id: string };

export function getCurrentScreenShareSnapshotOutcome({
  activeSession,
  session,
  viewerSessionId
}: {
  activeSession: SessionWithId | null;
  session: SessionWithId | null;
  viewerSessionId: string | null;
}) {
  return {
    shouldDisconnectViewer:
      session === null &&
      viewerSessionId !== null &&
      viewerSessionId === activeSession?.id
  };
}
