const tagAliases: Readonly<Record<string, string>> = {
  damagecut: "damage-cut",
  "damage-cut": "damage-cut",
  ディスペル: "dispel",
  回復: "heal",
  弱体無効: "veil",
};

function normalizeToken(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}

export function normalizeTag(value: string): string {
  const normalized = normalizeToken(value);
  return tagAliases[normalized] ?? normalized;
}

export function normalizeTags(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeTag))];
}
