import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Periodic watchdog every 1 minute to ensure the display queue never stalls and cleanup old records
crons.interval(
  "display queue watchdog",
  { minutes: 1 },
  internal.display.watchdogQueue
);

export default crons;
