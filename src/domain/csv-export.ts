import type { CatalogDetails, Element, EntityKind } from "./catalog.js";
import { importColumns, maxImportBytes, maxImportRows } from "./csv-import.js";

export type CsvExportRecord = {
  kind: EntityKind;
  name: string;
  element: Element | null;
  rarity: string | null;
  tags: string[];
  details: CatalogDetails;
  owned: boolean;
  quantity: number | null;
  uncapLevel: number | null;
  awakeningLevel: number | null;
  notes: string | null;
};

const encoder = new TextEncoder();
const header = `\ufeff${importColumns.join(",")}\r\n`;
const cell = (value: string | number | boolean | null) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

export function exportCatalogCsv(records: readonly CsvExportRecord[]): string[] {
  if (records.length === 0) return [];
  const files: string[] = [];
  let lines: string[] = [];
  let bytes = encoder.encode(header).length;
  for (const record of records) {
    const line =
      [
        record.kind,
        record.name,
        record.element,
        record.rarity,
        record.tags.join("|"),
        record.owned,
        record.owned ? record.quantity : null,
        record.owned ? record.uncapLevel : null,
        record.owned ? record.awakeningLevel : null,
        record.owned ? record.notes : null,
        JSON.stringify(record.details),
      ]
        .map(cell)
        .join(",") + "\r\n";
    const lineBytes = encoder.encode(line).length;
    if (bytes + lineBytes > maxImportBytes || lines.length === maxImportRows) {
      if (lines.length === 0) throw new Error("CSV row exceeds the import size limit.");
      files.push(header + lines.join(""));
      lines = [];
      bytes = encoder.encode(header).length;
    }
    if (bytes + lineBytes > maxImportBytes)
      throw new Error("CSV row exceeds the import size limit.");
    lines.push(line);
    bytes += lineBytes;
  }
  if (lines.length) files.push(header + lines.join(""));
  return files;
}
