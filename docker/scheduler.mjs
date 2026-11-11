import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";

const heartbeat = () =>
  writeFileSync("/tmp/licensemeter-scheduler-heartbeat", String(Date.now()));

// Same UTC schedule as vercel.json. No automatic retries for email jobs:
// an ambiguous response must not send duplicate messages.
export function dueJobs(now) {
  if (now.getUTCMinutes() !== 0) return [];
  const jobs = [];
  if (now.getUTCHours() === 3) jobs.push("sync");
  if (now.getUTCHours() === 5) jobs.push("retention");
  if (now.getUTCHours() === 6 && now.getUTCDay() === 1) jobs.push("digest");
  if (now.getUTCHours() === 7 && now.getUTCDate() === 1) jobs.push("report");
  return jobs;
}

async function runScheduler() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET is required");
  const base = process.env.CRON_BASE_URL ?? "http://web:3000";
  const slots = new Map();
  const inFlight = new Set();
  const tick = () => {
    heartbeat();
    const now = new Date();
    const slot = now.toISOString().slice(0, 13);
    for (const job of dueJobs(now)) {
      if (slots.get(job) === slot || inFlight.has(job)) continue;
      slots.set(job, slot);
      inFlight.add(job);
      void fetch(`${base}/api/cron/${job}`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(30 * 60 * 1000),
      })
        .then(async (response) => {
          console.log(`${job}: HTTP ${response.status}`);
          await response.body?.cancel();
        })
        .catch(() => {
          console.error(
            `${job}: request failed; inspect the web container logs`,
          );
        })
        .finally(() => inFlight.delete(job));
    }
  };
  heartbeat();
  // Start on the next tick. Restarting does not backfill missed schedules.
  const timer = setInterval(tick, 30_000);
  console.log(
    "Scheduler active (UTC): sync daily 03:00, retention daily 05:00, digest Monday 06:00, report day 1 at 07:00.",
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => {
      clearInterval(timer);
      process.exit(0);
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runScheduler();
