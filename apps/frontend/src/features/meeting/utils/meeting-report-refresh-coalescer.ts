type MeetingReportRefreshEvent = {
  reportId: string;
  updatedAt: string;
};

type RefreshOperation = () => Promise<void>;

type PendingRefresh = {
  event: MeetingReportRefreshEvent;
  refresh: RefreshOperation;
};

type ReportRefreshState = {
  activeEvent: MeetingReportRefreshEvent;
  pending: PendingRefresh | null;
  worker: Promise<void>;
};

function isNewerUpdatedAt(candidate: string, current: string) {
  const candidateTimestamp = Date.parse(candidate);
  const currentTimestamp = Date.parse(current);
  if (
    Number.isFinite(candidateTimestamp) &&
    Number.isFinite(currentTimestamp)
  ) {
    return candidateTimestamp > currentTimestamp;
  }
  return candidate !== current;
}

export function createMeetingReportRefreshCoalescer() {
  const stateByReportId = new Map<string, ReportRefreshState>();

  const drainRefreshes = async (
    state: ReportRefreshState,
    initial: PendingRefresh
  ) => {
    let current = initial;
    let firstError: unknown;
    let failed = false;

    while (true) {
      state.activeEvent = current.event;
      try {
        await current.refresh();
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }

      const pending = state.pending;
      if (!pending) break;
      state.pending = null;
      current = pending;
    }

    if (stateByReportId.get(initial.event.reportId) === state) {
      stateByReportId.delete(initial.event.reportId);
    }
    if (failed) throw firstError;
  };

  const startWorker = (
    event: MeetingReportRefreshEvent,
    refresh: RefreshOperation
  ) => {
    let rejectWorker!: (reason?: unknown) => void;
    let resolveWorker!: () => void;
    const worker = new Promise<void>((resolve, reject) => {
      resolveWorker = resolve;
      rejectWorker = reject;
    });
    const state: ReportRefreshState = {
      activeEvent: event,
      pending: null,
      worker
    };
    stateByReportId.set(event.reportId, state);

    void drainRefreshes(state, { event, refresh }).then(
      () => {
        resolveWorker();
      },
      (error) => {
        rejectWorker(error);
      }
    );
    return worker;
  };

  return {
    run(
      event: MeetingReportRefreshEvent,
      refresh: RefreshOperation
    ): Promise<void> {
      const state = stateByReportId.get(event.reportId);
      if (!state) return startWorker(event, refresh);

      if (
        event.updatedAt === state.activeEvent.updatedAt ||
        event.updatedAt === state.pending?.event.updatedAt
      ) {
        return state.worker;
      }

      const latestEvent = state.pending?.event ?? state.activeEvent;
      if (isNewerUpdatedAt(event.updatedAt, latestEvent.updatedAt)) {
        state.pending = { event, refresh };
      }
      return state.worker;
    }
  };
}
