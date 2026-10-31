import { invoke } from "./bridge";
import type { LocalGenerationConfig } from "../../shared/local-generation";
import type { Result } from "../../shared/result";

export const getLocalGenerationConfig = () => invoke<Result<LocalGenerationConfig>>("get_local_generation_config");
export const saveLocalGenerationConfig = (config: LocalGenerationConfig) => invoke<Result<LocalGenerationConfig>>("set_local_generation_config", config);
