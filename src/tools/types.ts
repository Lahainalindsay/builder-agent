export interface ToolReference {
  label: string;
  url: string;
}

export interface ToolResultItem {
  tool: "web-search" | "calculator" | "code-interpreter";
  summary: string;
  details: Record<string, unknown>;
  references: ToolReference[];
}

export interface ToolRunResult {
  items: ToolResultItem[];
  warnings: string[];
}

