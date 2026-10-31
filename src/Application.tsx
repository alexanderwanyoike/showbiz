import App from "./App";
import { ApplicationClosingDialog } from "./components/ApplicationClosingDialog";
import { NavigationGuard } from "./components/NavigationGuard";
import { ThemeProvider } from "./components/theme-provider";

export default function Application() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NavigationGuard />
      <App />
      <ApplicationClosingDialog />
    </ThemeProvider>
  );
}
