export function createStatusPollRetry() {
  let consecutiveFailures = 0;
  return {
    allowRetry() {
      consecutiveFailures += 1;
      return consecutiveFailures < 3;
    },
    reset() {
      consecutiveFailures = 0;
    },
  };
}
