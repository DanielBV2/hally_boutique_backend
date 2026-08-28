import { execSync } from "node:child_process";

export async function setup(): Promise<void> {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}
