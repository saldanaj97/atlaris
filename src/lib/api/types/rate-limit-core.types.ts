export type SlidingWindowLimiter = {
  check: (key: string) => void;
  getRemainingRequests: (key: string) => number;
  getResetTime: (key: string) => number;
  reset: (key: string) => void;
  clear: () => void;
};
