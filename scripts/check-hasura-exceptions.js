#!/usr/bin/env node
const fs = require("fs");
const { execSync } = require("child_process");
const routesDir = "apps/backend/src/routes";
const out = execSync(`grep -rl "hasuraRequest\\|hasuraClient" ${routesDir}`, { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);
console.log("Direct hasura routes:", out.join(", "));
// README expected list
const readme = fs.readFileSync("apps/backend/README.md", "utf8");
console.log("Done");
EOF