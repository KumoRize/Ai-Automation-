export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Runs once per server start. The scheduler publishes scheduled posts and polls YouTube/X comments.
  if (process.env.APP_SECRET) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
  if (process.env.AI_SELF_TEST === "1") {
    const { runAiSelfTest } = await import("./lib/ai/selftest");
    void runAiSelfTest(); // in the background, so startup isn't delayed
  }
}
