// Rebuilds assets/ (app icons and the alarm sound) from the base64 text copies in assets-b64/.
// The images and sound are kept as text so they survive file-syncing tools that alter binary files.
// Runs automatically after `npm install`.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "assets-b64");
const out = path.join(root, "assets");
fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(src)) {
  if (!name.endsWith(".b64")) continue;
  const data = Buffer.from(fs.readFileSync(path.join(src, name), "utf8"), "base64");
  fs.writeFileSync(path.join(out, name.slice(0, -4)), data);
}
console.log("Wake Word: assets restored");
