import { connectAgentChanges } from "./lib/agent-changes";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router";
import Application from "./Application";
import "@fontsource-variable/manrope";
import "./globals.css";
import { connectApplicationWork } from "./lib/application-work";

connectApplicationWork();
connectAgentChanges();

// Hash URLs work inside packaged file:// paths. The data router blocks
// navigation before a workspace with unsaved input can unmount.
const router = createHashRouter([{ path: "*", element: <Application /> }]);
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
