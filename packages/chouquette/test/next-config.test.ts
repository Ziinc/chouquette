import { expect, test } from "vitest";
import { withChouquette } from "../next/config.mjs";

test("withChouquette: standalone output, react-dom aliased on the client only, chouquette transpiled", () => {
  const seen: string[] = [];
  const user = {
    reactStrictMode: true,
    transpilePackages: ["ui"],
    webpack(config: any, { isServer }: { isServer: boolean }) {
      seen.push(isServer ? "server" : "client");
      config.resolve.alias.mine = "x";
      return config;
    },
  };
  const next = withChouquette(user);
  expect(next).toMatchObject({
    reactStrictMode: true,
    output: "standalone",
    transpilePackages: ["ui", "chouquette", "@chouquette/react-dom"],
    images: { unoptimized: true },
  });

  const client = next.webpack({ resolve: { alias: {} } }, { isServer: false });
  expect(client.resolve.alias).toEqual({
    mine: "x",
    "react-dom$": "@chouquette/react-dom",
    "react-dom/client": "@chouquette/react-dom/client",
  });
  const server = next.webpack({ resolve: { alias: {} } }, { isServer: true });
  expect(server.resolve.alias).toEqual({ mine: "x" });
  expect(seen).toEqual(["client", "server"]);
});

test("withChouquette works without a config of the app's own", () => {
  expect(withChouquette().output).toBe("standalone");
  expect(withChouquette().webpack({ resolve: {} }, { isServer: false }).resolve.alias["react-dom$"]).toBe("@chouquette/react-dom");
});
