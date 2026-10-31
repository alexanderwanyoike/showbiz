import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  applyAppearance,
  readAppearance,
  DEFAULT_APPEARANCE,
} from "../lib/appearance";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  React.useEffect(() => {
    const saved = readAppearance();
    applyAppearance(saved.ok ? saved.value : DEFAULT_APPEARANCE);
    if (!saved.ok) console.warn(saved.error);
  }, []);
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
