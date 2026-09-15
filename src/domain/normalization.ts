export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}
