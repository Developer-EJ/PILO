export function createMeetingReportRefreshCoalescer() {
  const inFlightByReportId = new Map<string, Promise<void>>();

  return {
    run(reportId: string, refresh: () => Promise<void>): Promise<void> {
      const inFlight = inFlightByReportId.get(reportId);
      if (inFlight) return inFlight;

      const request = refresh();
      inFlightByReportId.set(reportId, request);
      void request.then(
        () => {
          if (inFlightByReportId.get(reportId) === request) {
            inFlightByReportId.delete(reportId);
          }
        },
        () => {
          if (inFlightByReportId.get(reportId) === request) {
            inFlightByReportId.delete(reportId);
          }
        },
      );
      return request;
    },
  };
}
