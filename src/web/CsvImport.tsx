import { useRef, useState, type ChangeEvent } from "react";
import { importTemplate, maxImportBytes, type ImportPreview } from "../domain/csv-import.js";
import { api, ApiError } from "./api.js";
import { buttonClass, kindLabels } from "./CatalogFields.js";

export function CsvImport({ onChanged }: { onChanged: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [review, setReview] = useState<{ preview: ImportPreview; token: string | null }>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [exportFiles, setExportFiles] = useState<string[]>([]);
  const [exportTotal, setExportTotal] = useState(0);
  const [exportPrepared, setExportPrepared] = useState(false);
  function clear() {
    setCsv("");
    setFilename("");
    setReview(undefined);
    setConfirmed(false);
    if (input.current) input.current.value = "";
  }
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setReview(undefined);
    setConfirmed(false);
    setCsv("");
    setFilename("");
    setError(undefined);
    setMessage(undefined);
    if (!file) return;
    if (file.size > maxImportBytes) {
      setError("CSVは1MiB以内にしてください。");
      return;
    }
    setBusy(true);
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      setCsv(text);
      setFilename(file.name);
    } catch {
      setError("UTF-8のCSVを選択してください。");
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    setConfirmed(false);
    setReview(undefined);
    try {
      setReview(await api.previewImport(csv));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "検証に失敗しました。");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!confirmed || !review?.token || review.preview.errors.length) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await api.applyImport(csv, review.token);
      clear();
      setExportFiles([]);
      setExportPrepared(false);
      setMessage(
        `一括保存しました。新規 ${result.preview.newCount}件、更新 ${result.preview.updateCount}件。`,
      );
      await onChanged();
    } catch (caught) {
      if (caught instanceof ApiError && caught.importPreview)
        setReview({ preview: caught.importPreview, token: null });
      setConfirmed(false);
      setError(caught instanceof Error ? caught.message : "一括保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob(["\ufeff", importTemplate()], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gf-import-template.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function prepareExport() {
    setBusy(true);
    setError(undefined);
    setExportFiles([]);
    setExportTotal(0);
    setExportPrepared(false);
    try {
      const result = await api.exportCatalog();
      setExportFiles(result.files);
      setExportTotal(result.total);
      setExportPrepared(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CSVの書き出しに失敗しました。");
    } finally {
      setBusy(false);
    }
  }
  function downloadExport(csv: string, index: number) {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gf-catalog-${String(index + 1).padStart(3, "0")}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="mt-4 rounded-2xl border border-line bg-surface/85 p-6 shadow-panel"
      aria-labelledby="csv-title"
    >
      <h2 id="csv-title" className="mb-3 text-lg font-bold">
        CSVで一括登録・更新
      </h2>
      <p className="mb-3 text-sm text-muted">
        UTF-8、1MiB・1,000行以内。全行を検証し、確認後にまとめて保存します。実データやCSVはGit管理に入れないでください。攻略記事本文・画像を取り込まないでください。
      </p>
      <p className="mb-3 text-sm text-muted">
        種類＋正規化名称が同じ項目は更新されます。新規登録のdetailsは必須、既存更新の空欄detailsは保持されます。その他の空欄はクリアまたは既定値になります。owned=falseは所持情報を削除します。
      </p>
      {error && (
        <p role="alert" className="mb-3 text-[#ffb3ba]">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-3 text-mint">
          {message}
        </p>
      )}
      <fieldset disabled={busy} className="grid gap-3">
        <button className={buttonClass} type="button" onClick={download}>
          架空データのCSVテンプレートをダウンロード
        </button>
        <div className="rounded-xl border border-line p-4 text-sm">
          <p className="mb-2 font-bold">登録済みデータを書き出す</p>
          <p className="mb-3 text-muted">
            CSVには実際のカタログと所持情報が含まれます。Git管理外に保存してください。出典とmetadataは含まれず、再取り込み時も保持されます。表計算ソフトは先頭が
            =、+、-、@
            の値を数式として解釈する場合があります。開く際は各列を文字列として読み込んでください。
          </p>
          <button className={buttonClass} type="button" onClick={() => void prepareExport()}>
            登録済みデータのCSVを準備
          </button>
          {exportTotal > 0 && (
            <div className="mt-3">
              <p>
                {exportTotal}件を{exportFiles.length}
                ファイルに分割しました。各ファイルは1,000行・1MiB以内です。
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {exportFiles.map((file, index) => (
                  <button
                    key={index}
                    className={buttonClass}
                    type="button"
                    onClick={() => downloadExport(file, index)}
                  >
                    CSV {index + 1}/{exportFiles.length} をダウンロード
                  </button>
                ))}
              </div>
            </div>
          )}
          {exportPrepared && exportTotal === 0 && (
            <p className="mt-2 text-muted">登録データがないため、ファイルはありません。</p>
          )}
        </div>
        <label className="grid gap-2 text-sm">
          CSVファイル
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void choose(event)}
          />
        </label>
        {filename && <p className="break-all text-sm">選択中: {filename}</p>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            disabled={!csv}
            onClick={() => void preview()}
          >
            検証・プレビュー
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              clear();
              setError(undefined);
              setMessage(undefined);
            }}
          >
            インポートをキャンセル
          </button>
        </div>
        {review && (
          <>
            <p role="status">
              全 {review.preview.total}行 · 新規 {review.preview.newCount}件 · 更新{" "}
              {review.preview.updateCount}件 · エラー {review.preview.errorCount}行
            </p>
            {review.preview.errors.length > 0 && (
              <>
                <p className="text-[#ffb3ba]">
                  エラーがあるため保存できません。CSVを修正して選び直してください。
                </p>
                <ul className="max-h-72 overflow-auto text-sm text-[#ffb3ba]">
                  {review.preview.errors.map((issue, index) => (
                    <li key={index}>
                      {issue.line}行目 · {issue.field}: {issue.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-2 text-left">行別の変更予定</caption>
                <thead>
                  <tr>
                    <th>行</th>
                    <th>操作</th>
                    <th>種類・名称</th>
                    <th>所持</th>
                  </tr>
                </thead>
                <tbody>
                  {review.preview.items.map((item) => (
                    <tr className="border-b border-line" key={item.line}>
                      <td className="p-2">{item.line}</td>
                      <td>{item.action === "create" ? "新規" : "更新"}</td>
                      <td>
                        {kindLabels[item.kind as keyof typeof kindLabels]} · {item.name}
                      </td>
                      <td>{item.owned ? `所持数 ${item.quantity}` : "未所持（所持情報を削除）"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {review.token && review.preview.errors.length === 0 && (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  更新・所持解除を含む全行の変更予定を確認しました
                </label>
                <button
                  className={buttonClass}
                  type="button"
                  disabled={!confirmed}
                  onClick={() => void apply()}
                >
                  確認した全行を保存
                </button>
              </>
            )}
          </>
        )}
        {busy && <p role="status">処理中…</p>}
      </fieldset>
    </section>
  );
}
