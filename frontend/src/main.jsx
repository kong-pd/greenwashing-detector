import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Loading from "./pages/Loading";
import Report from "./pages/Report";
import Fallback from "./pages/Fallback";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/loading/:jobId" element={<Loading />} />
        <Route path="/report/:jobId" element={<Report />} />
        <Route path="/fallback" element={<Fallback />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);