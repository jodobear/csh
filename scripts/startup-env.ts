export function applyEnvDefaults(
  values: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const [key, value] of Object.entries(values)) {
    if (!env[key]) {
      env[key] = value;
    }
  }
}
