import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import { ThemeProvider } from "./components/theme-provider";
import App from "./App";
import "./globals.css";

// HashRouter, not BrowserRouter: packaged Electron loads the app from a
// file:// asar path that no path-based route can match.
createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </HashRouter>
);
