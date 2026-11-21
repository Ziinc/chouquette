import { createRoot } from "chouquette";
import { hydrateRoot, version } from "chouquette/dom";

export { createRoot, hydrateRoot, version };
export type { Root } from "chouquette";
// Next.js imports react-dom's CommonJS as a default.
export default { createRoot, hydrateRoot, version };
