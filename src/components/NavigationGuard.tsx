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
import { useApplicationWork } from "../hooks/useApplicationWork";
import { applicationWork } from "../lib/application-work";

function workspace(location: Pick<Location, "pathname" | "search">) {
  const view = new URLSearchParams(location.search).get("view");
  return location.pathname.startsWith("/project/")
    ? `${location.pathname}:${view === "bible" ? "bible" : "storyboards"}`
    : location.pathname;
}
export function NavigationGuard() {
  const origin = useRef<HTMLElement | null>(null);
  useApplicationWork();
  // Native status includes delayed echoes; internal navigation leaves only this renderer's drafts.
  const dirty = applicationWork.snapshot().unsaved.includes("draft");
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      applicationWork.snapshot().unsaved.includes("draft") && workspace(currentLocation) !== workspace(nextLocation),
  );
  useEffect(() => {
    if (!dirty && blocker.state === "blocked") blocker.proceed();
  }, [dirty, blocker]);
  return (
    <AlertDialog
      open={dirty && blocker.state === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.state === "blocked") blocker.reset();
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={() => { origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (origin.current?.isConnected) origin.current.focus(); }}
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
              if (blocker.state === "blocked") {
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
