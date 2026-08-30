import type { ProcedureDef } from './procedures.js';
import {
  analyzeShop,
  auditQuery,
  intentCancel,
  intentList,
  keysList,
  keysSet,
  keysTest,
  listInsights,
  orgLlmConfigGet,
  orgLlmConfigSet,
  reportGenerate,
} from './procedures.js';

/**
 * Canonical router. The OpenAPI generator walks this to produce the SDK.
 * Adding a procedure here is the single source of truth for the API surface.
 */
export interface Router {
  'intel.analyzeShop': ProcedureDef<
    (typeof analyzeShop.input)['_input'],
    (typeof analyzeShop.output)['_output']
  >;
  'insights.list': ProcedureDef<
    (typeof listInsights.input)['_input'],
    (typeof listInsights.output)['_output']
  >;
  'audit.query': ProcedureDef<
    (typeof auditQuery.input)['_input'],
    (typeof auditQuery.output)['_output']
  >;
  'keys.set': ProcedureDef<(typeof keysSet.input)['_input'], (typeof keysSet.output)['_output']>;
  'keys.list': ProcedureDef<(typeof keysList.input)['_input'], (typeof keysList.output)['_output']>;
  'keys.test': ProcedureDef<(typeof keysTest.input)['_input'], (typeof keysTest.output)['_output']>;
  'org.llmConfig.get': ProcedureDef<
    (typeof orgLlmConfigGet.input)['_input'],
    (typeof orgLlmConfigGet.output)['_output']
  >;
  'org.llmConfig.set': ProcedureDef<
    (typeof orgLlmConfigSet.input)['_input'],
    (typeof orgLlmConfigSet.output)['_output']
  >;
  'intent.cancel': ProcedureDef<
    (typeof intentCancel.input)['_input'],
    (typeof intentCancel.output)['_output']
  >;
  'intent.list': ProcedureDef<
    (typeof intentList.input)['_input'],
    (typeof intentList.output)['_output']
  >;
  'report.generate': ProcedureDef<
    (typeof reportGenerate.input)['_input'],
    (typeof reportGenerate.output)['_output']
  >;
}

export const router: Router = {
  'intel.analyzeShop': analyzeShop,
  'insights.list': listInsights,
  'audit.query': auditQuery,
  'keys.set': keysSet,
  'keys.list': keysList,
  'keys.test': keysTest,
  'org.llmConfig.get': orgLlmConfigGet,
  'org.llmConfig.set': orgLlmConfigSet,
  'intent.cancel': intentCancel,
  'intent.list': intentList,
  'report.generate': reportGenerate,
};

export type ProcedureName = keyof Router;
