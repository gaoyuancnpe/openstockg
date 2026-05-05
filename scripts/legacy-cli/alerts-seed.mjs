#!/usr/bin/env node

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "openstock";

function requireEnv(name, value) {
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function parseJSONArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const raw = process.argv[idx + 1];
  if (!raw) return null;
  return JSON.parse(raw);
}

async function main() {
  requireEnv("MONGODB_URI", MONGODB_URI);

  const rule = parseJSONArg("--rule");
  if (!rule) {
    const example = {
      enabled: true,
      name: "Price crosses above SMA20",
      symbols: ["AAPL", "MSFT"],
      cooldownSec: 3600,
      notify: {
        email: "you@example.com"
      },
      condition: {
        op: "crossesAbove",
        left: { var: "price" },
        right: { var: "sma20" }
      }
    };
    process.stdout.write("Usage:\n");
    process.stdout.write("  node scripts/legacy-cli/alerts-seed.mjs --rule '<json>'\n\n");
    process.stdout.write("Example:\n");
    process.stdout.write(JSON.stringify(example, null, 2) + "\n");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const res = await db.collection("alert_rules").insertOne(rule);
  process.stdout.write(`Inserted rule ${String(res.insertedId)}\n`);
  await client.close();
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
