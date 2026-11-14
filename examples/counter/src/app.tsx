import { createRoot } from "react-dom/client"; // aliased to @chouquette/react-dom
import { Counter } from "./counter";

const theme = {
  background: { light: "#ffffff", dark: "#0a0a0a" },
  primary: { light: "#2563eb", dark: "#3b82f6" },
  "primary-foreground": "#ffffff",
};

createRoot({ window: 0, theme }).render(<Counter />);
