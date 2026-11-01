import { useEffect, useRef } from "react";
import { useBlocker, type Location } from "react-router";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocalDrafts } from "../hooks/useApplicationWork";
import { applicationWork } from "../lib/application-work";

function workspace(location: Pick<Location, "pathname" | "search">) {
  const view = new URLSearchParams(location.search).get("view");
  return location.pathname.startsWith("/project/")
    ? `${location.pathname}:${view === "bible" ? "bible" : "storyboards"}`
    : location.pathname;
}
export function NavigationGuard() {
  const continuing = useRef(false);
  const origin = useRef<HTMLElement | null>(null);
  const dirty = useLocalDrafts();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      applicationWork.getLocalDrafts() &&
      workspace(currentLocation) !== workspace(nextLocation),
  );
  useEffect(() => {
    if (blocker.state === "unblocked") continuing.current = false;
    if (!dirty && blocker.state === "blocked" && !continuing.current) {
      continuing.current = true;
      blocker.proceed();
    }
  }, [dirty, blocker]);
  return (
    <AlertDialog
      open={dirty && blocker.state === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.state === "blocked" && !continuing.current)
          blocker.reset();
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={() => {
          origin.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (origin.current?.isConnected) origin.current.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Leaving this workspace will discard its unsaved input.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => {
              if (blocker.state === "blocked" && !continuing.current) {
                continuing.current = true;
                window.dispatchEvent(
                  new Event("showbiz:discard-workspace-drafts"),
                );
                blocker.proceed();
              }
            }}
          >
            Discard and continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
