// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ModelPicker } from "../components/ModelPicker";
vi.stubGlobal("ResizeObserver",class {observe(){}unobserve(){}disconnect(){}});
Element.prototype.scrollIntoView=vi.fn();
afterEach(cleanup);
it("opens on the current model so Enter does not silently switch to the first listed model", async () => {
  const select=vi.fn();
  render(createElement(ModelPicker,{groups:[{family:"video",displayName:"Video",models:[{id:"kling",name:"Kling"},{id:"seedance",name:"Seedance"}]}],value:"seedance",onSelect:select,trigger:createElement("button",null,"Video model")}));
  const user=userEvent.setup();
  await user.click(screen.getByRole("button",{name:"Video model"}));
  expect(screen.getByRole("option",{name:"Seedance",selected:true}).getAttribute("aria-current")).toBe("true");
  await user.keyboard("{Enter}");
  expect(select).not.toHaveBeenCalled();
});
