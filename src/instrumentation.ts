export async function register() {
  // Runs once per server start. The scheduler publishes scheduled posts and polls YouTube/X comments.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.APP_SECRET) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
