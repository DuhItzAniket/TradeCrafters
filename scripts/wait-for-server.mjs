const base = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000";
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      console.log("Application is ready.");
      process.exit(0);
    }
  } catch {
    /* startup may still be compiling */
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error("Application did not become ready within the startup budget.");
