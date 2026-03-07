/**
 * normalizeText()
 * Centralized, conservative normalization for prompt + output text.
 * Keep this list small + high-signal to avoid semantic drift.
 */
export function normalizeText(input: string): string {
  let out = input.toLowerCase();

  const phraseReplacements: Array<[RegExp, string]> = [
    [/\blog\s*in\b/g, "login"],
    [/\bsign\s*in\b/g, "signin"],
    [/\bsign\s*up\b/g, "signup"],
    [/\bfront\s*end\b/g, "frontend"],
    [/\bback\s*end\b/g, "backend"],
    [/\bdash\s*board\b/g, "dashboard"],
    [/\bweb\s*site\b/g, "website"],
    [/\be-?mail\b/g, "email"],
    [/\bset\s*up\b/g, "setup"]
  ];

  for (const [rx, to] of phraseReplacements) out = out.replace(rx, to);

  const wordReplacements: Array<[RegExp, string]> = [
    [/\bmaintainence\b/g, "maintenance"],
    [/\bmaintenence\b/g, "maintenance"],
    [/\bmaintainance\b/g, "maintenance"],
    [/\bcalender\b/g, "calendar"],
    [/\bschedual\b/g, "schedule"],
    [/\bshedule\b/g, "schedule"],
    [/\badress\b/g, "address"],
    [/\brecieve\b/g, "receive"],
    [/\bseperat(e|ed|ing|ion)\b/g, "separat$1"],
    [/\boccured\b/g, "occurred"],
    [/\benviroment\b/g, "environment"],
    [/\bdatabse\b/g, "database"],
    [/\bauthetication\b/g, "authentication"],
    [/\bauthenticationn\b/g, "authentication"],
    [/\bdependancy\b/g, "dependency"],
    [/\bdependancies\b/g, "dependencies"],
    [/\bdepencencies\b/g, "dependencies"],
    [/\binteractiv\b/g, "interactive"],
    [/\berc\s*-\s*20\b/g, "erc-20"]
  ];

  for (const [rx, to] of wordReplacements) out = out.replace(rx, to);

  out = out.replace(/\s+/g, " ").trim();
  return out;
}
