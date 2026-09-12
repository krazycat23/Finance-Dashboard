import type { ImportWorkspace, ScenarioSetup } from "../types";
export function resolveScenario(workspace:ImportWorkspace,datasetId:string):ScenarioSetup|undefined{return workspace.scenarios.find(scenario=>scenario.datasetId===datasetId);}
export function scenarioRoles(workspace:ImportWorkspace){const find=(kind:ScenarioSetup["kind"],fallback:string)=>workspace.scenarios.find(s=>s.kind===kind)?.scenarioId??fallback;return{actual:find("actual","actual"),budget:find("budget","budget"),forecast:find("forecast","forecast")};}
