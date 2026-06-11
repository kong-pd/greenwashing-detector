import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./additions.css"; // FR-34 standard badges + methodology panel styles
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
