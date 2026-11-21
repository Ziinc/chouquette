// Sets the version of chouquette, @chouquette/react-dom and the hosts
// chouquette depends on, for a release.
//
//   node scripts/set-version.mjs 0.2.0
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function setVersion(root, version) {
  const edit = (name, change) => {
    const path = join(root, "packages", name, "package.json");
    const pkg = JSON.parse(readFileSync(path, "utf8"));
    change(pkg);
    writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  };
  edit("chouquette", pkg => {
    pkg.version = version;
    pkg.dependencies["@chouquette/react-dom"] = version;
    for (const host of Object.keys(pkg.optionalDependencies)) pkg.optionalDependencies[host] = version;
  });
  edit("react-dom", pkg => {
    pkg.version = version;
    pkg.peerDependencies.chouquette = version;
  });
}

if (process.argv[1] === import.meta.filename) setVersion(join(import.meta.dirname, ".."), process.argv[2].replace(/^v/, ""));
