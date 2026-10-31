import path from "node:path";
import { expect, it } from "vitest";
import { desktopAppIconPath } from "./app-icon";

it("loads the packaged runtime PNG from inside app.asar rather than build-only resources",()=>{
  const application=path.join("/opt","Showbiz","resources","app.asar");
  expect(desktopAppIconPath(application,true)).toBe(path.join(application,"dist","icon.png"));
});
it("loads the same generated public PNG while running the development shell",()=>{
  const application=path.join("/work","Showbiz project");
  expect(desktopAppIconPath(application,false)).toBe(path.join(application,"public","icon.png"));
});
