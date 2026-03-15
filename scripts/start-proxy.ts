#!/usr/bin/env bun
import path from "node:path";
import { pathToFileURL } from "node:url";

import { defaultEnvFile, loadConfig, parseEnvFile, repoRoot, validateConfig } from "./config";

const envFilePath = path.resolve(process.argv[2] ?? defaultEnvFile());
const config = loadConfig(envFilePath);
const check = validateConfig(config, "client");
if (!check.ok) {
  throw new Error(check.errors.join("\n"));
}

const parsedEnv = parseEnvFile(envFilePath);
for (const [key, value] of Object.entries(parsedEnv)) {
  process.env[key] = value;
}

process.env.CVM_ENV_FILE = envFilePath;

console.error("Starting SDK proxy");
await import(pathToFileURL(path.join(repoRoot(), "scripts", "proxy-stdio.ts")).href);
