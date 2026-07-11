import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const distDirectory = path.join(process.cwd(), "dist");

async function removeSourceMaps(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await removeSourceMaps(entryPath);
    } else if (entry.name.endsWith(".map")) {
      await rm(entryPath);
    }
  }
}

await removeSourceMaps(distDirectory);
console.log("Removed source maps from the publish package.");
