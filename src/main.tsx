import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ThemeProvider } from "./components/theme-provider";
import App from "./App";
import "./globals.css";
import { installDebugLogTap } from "./lib/debug-log";

installDebugLogTap();

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </BrowserRouter>
);
