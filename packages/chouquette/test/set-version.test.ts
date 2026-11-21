import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { setVersion } from "../../../scripts/set-version.mjs";

test("a release versions chouquette, @chouquette/react-dom and the hosts together", () => {
  const root = mkdtempSync(join(tmpdir(), "version-"));
  for (const p of ["chouquette", "react-dom"])
    cpSync(join(import.meta.dirname, `../../${p}/package.json`), join(root, `packages/${p}/package.json`), { recursive: true });
  setVersion(root, "1.2.3");
  const read = (p: string) => JSON.parse(readFileSync(join(root, `packages/${p}/package.json`), "utf8"));
  const chouquette = read("chouquette");
  expect(chouquette.version).toBe("1.2.3");
  expect(chouquette.dependencies["@chouquette/react-dom"]).toBe("1.2.3");
  expect(new Set(Object.values(chouquette.optionalDependencies))).toEqual(new Set(["1.2.3"]));
  expect(read("react-dom").version).toBe("1.2.3");
  expect(read("react-dom").peerDependencies.chouquette).toBe("1.2.3");
});
