import {
  catalogUpdateSchema,
  inventoryInputSchema,
  type CatalogDetails,
  type CatalogUpdate,
  type InventoryInput,
} from "./catalog.js";
import { normalizeName } from "./normalization.js";

export const importColumns = [
  "kind",
  "name",
  "element",
  "rarity",
  "tags",
  "owned",
  "quantity",
  "uncapLevel",
  "awakeningLevel",
  "notes",
  "details",
] as const;
export const maxImportBytes = 1024 * 1024;
export const maxImportRows = 1000;
export type ImportError = { line: number; field: string; message: string };
export type ImportRow = {
  line: number;
  catalog: Omit<CatalogUpdate, "details"> & { details?: CatalogDetails };
  inventory: InventoryInput;
};
export type ImportPreview = {
  total: number;
  newCount: number;
  updateCount: number;
  errorCount: number;
  errors: ImportError[];
  items: Array<{
    line: number;
    kind: string;
    name: string;
    action: "create" | "update";
    owned: boolean;
    quantity: number;
  }>;
};

export function parseImportCsv(csv: string) {
  const errors: ImportError[] = [];
  const rows: ImportRow[] = [];
  if (new TextEncoder().encode(csv).length > maxImportBytes)
    return {
      rows,
      total: 0,
      errors: [{ line: 1, field: "csv", message: "CSVは1MiB以内にしてください。" }],
    };
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [],
    value = "",
    quoted = false,
    closed = false,
    syntax = false,
    line = 1,
    start = 1;
  const text = csv.replace(/^\ufeff/, "");
  function finish() {
    cells.push(value);
    if (syntax || cells.length > 1 || cells.some((cell) => cell.trim() !== ""))
      records.push({ line: start, cells });
    cells = [];
    value = "";
    closed = false;
    syntax = false;
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"' || char === ",") syntax = true;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += char;
        if (char === "\n" || (char === "\r" && text[i + 1] !== "\n")) line++;
      }
    } else if (char === ",") {
      cells.push(value);
      value = "";
      closed = false;
    } else if (char === "\r" || char === "\n") {
      finish();
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      start = line;
    } else if (char === '"' && value === "" && !closed) quoted = true;
    else if (char === '"' || closed) {
      errors.push({ line, field: "csv", message: "引用符の形式が不正です。" });
      break;
    } else value += char;
  }
  if (quoted) errors.push({ line: start, field: "csv", message: "引用符が閉じられていません。" });
  if (value !== "" || cells.length || closed) finish();
  const header = records.shift();
  if (!header) errors.push({ line: 1, field: "csv", message: "ヘッダーとデータ行が必要です。" });
  const names = header?.cells.map((cell) => cell.trim()) ?? [];
  if (
    names.length !== importColumns.length ||
    new Set(names).size !== names.length ||
    importColumns.some((column) => !names.includes(column))
  )
    errors.push({
      line: header?.line ?? 1,
      field: "header",
      message: `列は ${importColumns.join(", ")} を各1回指定してください。`,
    });
  if (records.length === 0 || records.length > maxImportRows)
    errors.push({ line: 1, field: "csv", message: "データ行は1〜1,000行にしてください。" });
  if (errors.length) return { rows, total: records.length, errors };
  const seen = new Set<string>();
  for (const record of records) {
    const rowErrors: ImportError[] = [];
    const error = (field: string, message: string) =>
      rowErrors.push({ line: record.line, field, message });
    if (record.cells.length !== names.length) {
      error("csv", "列数がヘッダーと一致しません。");
      errors.push(...rowErrors);
      continue;
    }
    const row = Object.fromEntries(names.map((name, index) => [name, record.cells[index]!]));
    let details: unknown;
    if (row.details?.trim()) {
      try {
        details = JSON.parse(row.details);
      } catch {
        error("details", "種類別詳細は正しいJSONで入力してください。");
      }
    }
    const schema = catalogUpdateSchema.options.find(
      (option) => option.shape.kind.value === row.kind?.trim(),
    );
    const common = {
      kind: row.kind?.trim(),
      name: row.name,
      element: row.element?.trim() || null,
      rarity: row.rarity?.trim() || null,
      tags: row.tags
        ?.split("|")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    const catalog = schema
      ? details === undefined
        ? schema.omit({ details: true }).safeParse(common)
        : schema.safeParse({ ...common, details })
      : undefined;
    if (!catalog) error("kind", "種類はcharacter、weapon、summonのいずれかです。");
    else if (!catalog.success)
      for (const issue of catalog.error.issues)
        error(issue.path.join(".") || "catalog", issue.message);
    const number = (field: string, fallback: number | null) =>
      row[field]?.trim()
        ? /^-?\d+$/.test(row[field].trim())
          ? Number(row[field])
          : Number.NaN
        : fallback;
    const inventory = inventoryInputSchema.safeParse({
      owned:
        row.owned?.trim() === "true" ? true : row.owned?.trim() === "false" ? false : row.owned,
      quantity: number("quantity", 1),
      uncapLevel: number("uncapLevel", 0),
      awakeningLevel: number("awakeningLevel", null),
      notes: row.notes || null,
    });
    if (!inventory.success)
      for (const issue of inventory.error.issues)
        error(issue.path.join(".") || "inventory", issue.message);
    if (schema && row.name?.trim()) {
      const key = `${common.kind}:${normalizeName(row.name)}`;
      if (seen.has(key)) error("name", "CSV内に同じ種類・正規化名称の行があります。");
      seen.add(key);
    }
    errors.push(...rowErrors);
    if (!rowErrors.length && catalog?.success && inventory.success)
      rows.push({ line: record.line, catalog: catalog.data, inventory: inventory.data });
  }
  return { rows, total: records.length, errors };
}

export function importTemplate() {
  const examples = [
    [
      "character",
      "架空の支援役",
      "wind",
      "SSR",
      "heal|dispel",
      "true",
      "1",
      "4",
      "",
      "架空の確認用メモ",
      { roles: ["support"], weaponProficiencies: ["staff"], races: ["human"] },
    ],
    [
      "weapon",
      "架空の試験剣",
      "fire",
      "SSR",
      "attack",
      "true",
      "2",
      "4",
      "",
      "",
      { weaponType: "sword", skillEffects: ["attack"], maxUncapLevel: 5 },
    ],
    [
      "summon",
      "架空の試験召喚石",
      "water",
      "SSR",
      "buff",
      "false",
      "1",
      "0",
      "",
      "",
      { auraEffects: ["element-attack"], callEffects: ["buff"], maxUncapLevel: 5 },
    ],
  ];
  return (
    importColumns.join(",") +
    "\r\n" +
    examples
      .map((row) =>
        row
          .map((value) => {
            const text = typeof value === "object" ? JSON.stringify(value) : value;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
