import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import { ThemeProvider } from "./components/theme-provider";
import { ApplicationClosingDialog } from "./components/ApplicationClosingDialog";
import App from "./App";
import "./globals.css";
import { connectApplicationWork } from "./lib/application-work";

connectApplicationWork();

// HashRouter, not BrowserRouter: packaged Electron loads the app from a
// file:// asar path that no path-based route can match.
createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
      <ApplicationClosingDialog />
    </ThemeProvider>
  </HashRouter>
);
