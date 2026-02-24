import fs from "fs";

fs.copyFileSync("manifest.json", "dist/manifest.json");
console.log("copied manifest.json -> dist/");