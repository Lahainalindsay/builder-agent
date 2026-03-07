import { PromptSpec, TemplateDefinition } from "../types/spec";
import { templates } from "../templates/library";

export function selectTemplate(spec: PromptSpec): TemplateDefinition {
  const exactMatch = templates.find((template) => template.appType === spec.appType);
  return exactMatch ?? templates.find((template) => template.id === "fallback-minimal") ?? templates[0];
}
