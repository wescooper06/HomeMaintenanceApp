const fs = require("node:fs");
const path = require("node:path");

for (const relative of [
  ["app", "capacitor.build.gradle"],
  ["capacitor-cordova-android-plugins", "build.gradle"],
]) {
  const file = path.resolve(__dirname, "..", "android", ...relative);
  const source = fs.readFileSync(file, "utf8");
  const updated = source.replace(/JavaVersion\.VERSION_21/g, "JavaVersion.VERSION_17");
  if (source !== updated) fs.writeFileSync(file, updated);
}
console.log("Generated Android modules use Java 17 compatibility.");
