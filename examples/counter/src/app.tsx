import { createRoot } from "react-dom/client"; // aliased to @chouquette/react-dom
import { Counter } from "./counter";

createRoot({ window: 0 }).render(<Counter />);
