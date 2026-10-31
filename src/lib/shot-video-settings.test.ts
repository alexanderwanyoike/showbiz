import { expect, it } from "vitest";
import { getAvailableVideoModels } from "./models";
import { resolveShotVideoSettings } from "./shot-video-settings";
it("restores matching shot settings and uses the new model defaults instead of incompatible saved settings", () => {
  const seedance=getAvailableVideoModels().find((model)=>model.id==="seedance-2-fal")!;
  const veo=getAvailableVideoModels().find((model)=>model.id==="veo-3.1-openrouter")!;
  const saved=JSON.stringify({model_id:seedance.id,settings:{duration:"4",resolution:"720p",aspect_ratio:"16:9",audio:false}});
  expect(resolveShotVideoSettings(saved,seedance)).toMatchObject({source:"saved",settings:{duration:"4",resolution:"720p",aspectRatio:"16:9",audio:false}});
  expect(resolveShotVideoSettings(saved,veo)).toMatchObject({source:"model-defaults",settings:veo.defaults});
  expect(resolveShotVideoSettings("broken-json",seedance)).toMatchObject({source:"model-defaults",settings:seedance.defaults,notice:expect.stringContaining("could not be read")});
});
