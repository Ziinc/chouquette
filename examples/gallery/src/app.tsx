import { createRoot } from "react-dom/client"; // aliased to @chouquette/react-dom
import { Gallery } from "./gallery";

const theme = {
  primary: { light: "#2563eb", dark: "#3b82f6" },
  muted: { light: "#e5e5e5", dark: "#262626" },
  border: { light: "#e5e5e5", dark: "#404040" },
};

createRoot({ window: 0, theme }).render(<Gallery />);
