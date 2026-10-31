import { expect, it } from "vitest";
import { estimateGenerationCost } from "../../shared/generation-cost";
it("estimates provider-specific video costs using the selected duration, resolution and audio",()=>{
 const price={provider:"fal",model_id:"video",source_url:"https://fal.ai/models/video",checked_at:"2026-10-31T12:00:00Z",currency:"USD" as const,rates:[{unit:"second" as const,microusd:100000,resolution:"720p",audio:false},{unit:"second" as const,microusd:250000,resolution:"1080p",audio:true}]};
 expect(estimateGenerationCost(price,{kind:"video",duration:8,resolution:"1080p",audio:true})).toMatchObject({kind:"estimate",min_microusd:2000000,max_microusd:2000000});
 expect(estimateGenerationCost({...price,provider:"openrouter",rates:[{unit:"second",microusd:150000}]},{kind:"video",duration:8})).toMatchObject({kind:"estimate",min_microusd:1200000,max_microusd:1200000});
 expect(estimateGenerationCost(price,{kind:"video",duration:8,resolution:"4K",audio:true})).toMatchObject({kind:"unavailable"});
});
