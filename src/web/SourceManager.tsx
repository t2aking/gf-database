import { useState, type FormEvent } from "react";
import { sourceInputSchema, sourceKindLabels, type SourceInput } from "../domain/sources.js";
import { api, ApiError, type SourceReference } from "./api.js";
import {
  FieldError,
  buttonClass,
  fieldClass,
  formString,
  type FieldErrors,
} from "./CatalogFields.js";

export function dateTimeInput(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}
function isoDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
export function sourceDates(form: FormData) {
  const observedAt = formString(form, "observedAt");
  const verifiedAt = formString(form, "verifiedAt");
  return { observedAt: isoDate(observedAt), verifiedAt: verifiedAt ? isoDate(verifiedAt) : null };
}
type Draft = {
  kind: SourceInput["kind"];
  url: string;
  note: string;
  observedAt: string;
  verifiedAt: string;
};
function newDraft(): Draft {
  return {
    kind: "user",
    url: "",
    note: "",
    observedAt: dateTimeInput(new Date().toISOString()),
    verifiedAt: "",
  };
}
export function SourceManager({
  entityId,
  sources,
  busy,
  setBusy,
  onSaved,
}: {
  entityId: string;
  sources: SourceReference[];
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [formRevision, setFormRevision] = useState(0);
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [editingId, setEditingId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<SourceReference>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  function reset() {
    setFormRevision((value) => value + 1);
    setDraft(newDraft());
    setEditingId(undefined);
    setErrors({});
    setError(undefined);
  }
  function report(caught: unknown) {
    if (caught instanceof ApiError) setErrors(caught.fieldErrors);
    setError(caught instanceof Error ? caught.message : "出典情報の保存に失敗しました。");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setError(undefined);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);

    const parsed = sourceInputSchema.safeParse({
      ...draft,
      url: draft.url || null,
      note: draft.note || null,
      ...sourceDates(form),
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues)
        (next[issue.path.join(".") || "form"] ??= []).push(issue.message);
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      if (editingId) await api.updateSource(entityId, editingId, parsed.data);
      else await api.createSource(entityId, parsed.data);
      await onSaved();
      reset();
      setMessage("出典を保存しました。");
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await api.deleteSource(entityId, pendingDelete.id);
      await onSaved();
      if (pendingDelete.id === editingId) reset();
      setPendingDelete(undefined);
      setMessage("出典を削除しました。");
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="sources-title" className="my-6">
      <h3 id="sources-title" className="font-bold">
        出典情報（{sources.length}件）
      </h3>
      <p className="my-3 text-sm text-[#eadb8e]">
        攻略記事の本文や画像は保存しないでください。確認した短い事実と出典情報だけを記録します。
      </p>
      {error && (
        <p role="alert" className="text-[#ffb3ba]">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-mint">
          {message}
        </p>
      )}
      <ul className="my-3 grid gap-3">
        {sources.map((source) => (
          <li key={source.id} className="rounded-lg border border-line p-3 text-sm break-words">
            <p>
              {sourceKindLabels[source.kind]} · 確認日{" "}
              {new Date(source.observedAt).toLocaleString("ja-JP")}
            </p>
            <p>
              検証日{" "}
              {source.verifiedAt ? new Date(source.verifiedAt).toLocaleString("ja-JP") : "未設定"}
            </p>
            {source.url && <p>{source.url}</p>}
            {source.note && <p>{source.note}</p>}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={busy || Boolean(pendingDelete)}
                onClick={() => {
                  setFormRevision((value) => value + 1);
                  setEditingId(source.id);
                  setDraft({
                    kind: source.kind,
                    url: source.url ?? "",
                    note: source.note ?? "",
                    observedAt: dateTimeInput(source.observedAt),
                    verifiedAt: source.verifiedAt ? dateTimeInput(source.verifiedAt) : "",
                  });
                  setErrors({});
                  setError(undefined);
                  setMessage(undefined);
                }}
              >
                出典を編集
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || Boolean(pendingDelete)}
                onClick={() => {
                  setPendingDelete(source);
                  setError(undefined);
                  setMessage(undefined);
                }}
              >
                出典を削除…
              </button>
            </div>
          </li>
        ))}
      </ul>
      {sources.length === 0 && <p className="mb-3 text-sm text-[#eadb8e]">出典未登録です。</p>}
      {pendingDelete && (
        <fieldset disabled={busy} className="my-3 grid gap-3 rounded-lg border border-line p-3">
          <p>この出典を削除します。カタログと所持情報は保持されます。この操作は元に戻せません。</p>
          <p>
            {sourceKindLabels[pendingDelete.kind]} · {pendingDelete.url ?? "URLなし"} ·{" "}
            {pendingDelete.note}
          </p>
          <div className="flex gap-2">
            <button type="button" className={buttonClass} onClick={() => void remove()}>
              出典削除を実行
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setPendingDelete(undefined)}
            >
              出典削除をキャンセル
            </button>
          </div>
        </fieldset>
      )}
      <form
        key={`${editingId ?? "new"}-${formRevision}`}
        onSubmit={save}
        noValidate
        hidden={Boolean(pendingDelete)}
      >
        <h4 className="mb-3 font-bold">{editingId ? "出典を編集" : "出典を追加"}</h4>
        <fieldset disabled={busy} className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <label className="grid gap-1 text-sm">
            出典種別
            <select
              className={fieldClass}
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as Draft["kind"] })
              }
            >
              {Object.entries(sourceKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <FieldError name="kind" errors={errors} />
          </label>
          <label className="grid gap-1 text-sm">
            出典URL（任意）
            <input
              className={fieldClass}
              type="url"
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              aria-invalid={Boolean(errors.url)}
            />
            <FieldError name="url" errors={errors} />
          </label>
          {(
            [
              ["observedAt", "確認日"],
              ["verifiedAt", "検証日（任意）"],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="grid gap-1 text-sm">
              {label}
              <input
                className={fieldClass}
                type="datetime-local"
                step="1"
                name={name}
                defaultValue={draft[name]}
                aria-invalid={Boolean(errors[name])}
              />
              <FieldError name={name} errors={errors} />
            </label>
          ))}
          <label className="col-span-full grid gap-1 text-sm">
            短い事実メモ（500文字以内）
            <textarea
              className={fieldClass}
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              aria-invalid={Boolean(errors.note)}
            />
            <FieldError name="note" errors={errors} />
          </label>
          <FieldError name="form" errors={errors} />
          <button className={buttonClass} type="submit">
            {editingId ? "出典の変更を保存" : "出典を登録"}
          </button>
          <button className={buttonClass} type="button" onClick={reset}>
            出典の編集をキャンセル
          </button>
        </fieldset>
      </form>
    </section>
  );
}
