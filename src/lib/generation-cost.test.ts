import { expect, it } from "vitest";
import { estimateGenerationCost } from "../../shared/generation-cost";
it("estimates provider-specific video costs using the selected duration, resolution and audio",()=>{
 const price={provider:"fal",model_id:"video",source_url:"https://fal.ai/models/video",checked_at:"2026-10-31T12:00:00Z",currency:"USD" as const,rates:[{unit:"second" as const,microusd:100000,resolution:"720p",audio:false},{unit:"second" as const,microusd:250000,resolution:"1080p",audio:true}]};
 expect(estimateGenerationCost(price,{kind:"video",duration:8,resolution:"1080p",audio:true})).toMatchObject({kind:"estimate",min_microusd:2000000,max_microusd:2000000});
 expect(estimateGenerationCost({...price,provider:"openrouter",rates:[{unit:"second",microusd:150000}]},{kind:"video",duration:8})).toMatchObject({kind:"estimate",min_microusd:1200000,max_microusd:1200000});
 expect(estimateGenerationCost(price,{kind:"video",duration:8,resolution:"4K",audio:true})).toMatchObject({kind:"unavailable"});
});

it("keeps Auto duration as a range and rejects invalid image dimensions",()=>{
 const price={provider:"local",model_id:"model",source_url:"https://localai.io",checked_at:"2026-10-01T12:00:00Z",currency:"USD" as const,rates:[{unit:"second" as const,microusd:150000}]};
 expect(estimateGenerationCost(price,{kind:"video",duration:"auto",duration_range:[4,12]},Date.parse("2026-10-31T12:00:00Z"))).toMatchObject({kind:"estimate",min_microusd:600000,max_microusd:1800000,stale:true});
 expect(estimateGenerationCost({...price,rates:[{unit:"megapixel",microusd:40000}]},{kind:"image",width:-1000,height:-1000})).toMatchObject({kind:"unavailable"});
 expect(estimateGenerationCost(null,{kind:"image"})).toMatchObject({kind:"unavailable"});
});
