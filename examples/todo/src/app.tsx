import { createRoot } from "react-dom/client"; // aliased to @chouquette/react-dom
import { Todo } from "./todo";

const theme = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  "muted-foreground": "#737373",
  border: "#e5e5e5",
  primary: "#0db9b6",
  "primary-foreground": "#ffffff",
};

createRoot({ window: 0, theme }).render(<Todo />);
