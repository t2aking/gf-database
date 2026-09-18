import { useEffect, useRef, useState, type FormEvent } from "react";
import { catalogUpdateSchema, inventoryInputSchema, type EntityKind } from "../domain/catalog.js";
import { api, ApiError, type CatalogDetail } from "./api.js";
import {
  CatalogFields,
  FieldError,
  buttonClass,
  fieldClass,
  catalogFormInput,
  formString,
  formNumber,
  type FieldErrors,
} from "./CatalogFields.js";

export function CatalogEditor({
  entityId,
  onClose,
  onChanged,
}: {
  entityId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [item, setItem] = useState<CatalogDetail>();
  const [kind, setKind] = useState<EntityKind>("character");
  const [error, setError] = useState<string>();
  const [catalogErrors, setCatalogErrors] = useState<FieldErrors>({});
  const [inventoryErrors, setInventoryErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string>();
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [deletePreview, setDeletePreview] = useState<CatalogDetail>();

  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void api
      .getCatalog(entityId)
      .then(({ item: detail }) => {
        if (active) {
          setItem(detail);
          setKind(detail.kind);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "読み込みに失敗しました。");
      });
    return () => {
      active = false;
    };
  }, [entityId]);

  function report(caught: unknown, setErrors?: (errors: FieldErrors) => void) {
    if (caught instanceof ApiError) setErrors?.(caught.fieldErrors);
    setError(caught instanceof Error ? caught.message : "操作に失敗しました。");
  }
  async function refresh(saved: "catalog" | "inventory") {
    const { item: detail } = await api.getCatalog(entityId);
    setItem(detail);
    if (saved === "catalog") {
      setKind(detail.kind);
      setCatalogRevision((value) => value + 1);
    } else {
      setInventoryRevision((value) => value + 1);
    }
    await onChanged();
  }
  function invalid(
    issues: Array<{ path: PropertyKey[]; message: string }>,
    setErrors: (errors: FieldErrors) => void,
  ) {
    const errors: FieldErrors = {};
    for (const issue of issues) (errors[issue.path.join(".") || "form"] ??= []).push(issue.message);
    setErrors(errors);
  }
  async function saveCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCatalogErrors({});
    setError(undefined);
    setMessage(undefined);
    const parsed = catalogUpdateSchema.safeParse(
      catalogFormInput(new FormData(event.currentTarget), kind),
    );
    if (!parsed.success) {
      invalid(parsed.error.issues, setCatalogErrors);
      return;
    }
    setBusy(true);
    try {
      await api.updateCatalog(entityId, parsed.data);
      await refresh("catalog");
      setMessage("カタログを保存しました。");
    } catch (caught) {
      report(caught, setCatalogErrors);
    } finally {
      setBusy(false);
    }
  }
  async function saveInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setInventoryErrors({});
    setError(undefined);
    setMessage(undefined);
    const awakening = formString(form, "awakeningLevel");
    const parsed = inventoryInputSchema.safeParse({
      owned: true,
      quantity: formNumber(form, "quantity"),
      uncapLevel: formNumber(form, "uncapLevel"),
      awakeningLevel: awakening === "" ? null : Number(awakening),
      notes: formString(form, "notes") || null,
    });
    if (!parsed.success) {
      invalid(parsed.error.issues, setInventoryErrors);
      return;
    }
    setBusy(true);
    try {
      await api.setInventory(entityId, parsed.data);
      await refresh("inventory");
      setMessage("所持情報を保存しました。");
    } catch (caught) {
      report(caught, setInventoryErrors);
    } finally {
      setBusy(false);
    }
  }
  async function removeInventory() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await api.setInventory(entityId, { owned: false, quantity: 1, uncapLevel: 0 });
      await refresh("inventory");
      setMessage("所持を解除しました。");
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  }
  async function previewDelete() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const { item: detail } = await api.getCatalog(entityId);
      setDeletePreview(detail);
      setConfirmed(false);
      setConfirmDelete(true);
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  }
  async function deleteCatalog() {
    if (!confirmed) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.deleteCatalog(entityId);
      await onChanged();
      onClose();
    } catch (caught) {
      report(caught);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="editor-title"
      className="fixed inset-0 m-auto max-h-[90vh] w-[min(760px,95vw)] overflow-y-auto rounded-2xl border border-line bg-surface p-6 text-text-bright backdrop:bg-black/70"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="editor-title" className="mb-4 text-xl font-bold">
        {confirmDelete ? "カタログ削除の確認" : "カタログ詳細・編集"}
      </h2>
      {error && (
        <p role="alert" className="mb-4 text-[#ffb3ba]">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-4 text-mint">
          {message}
        </p>
      )}
      {!item && !error && <p>読み込み中…</p>}
      {item && (
        <>
          {confirmDelete && deletePreview && (
            <fieldset disabled={busy} className="grid gap-4">
              <p>「{deletePreview.name}」をカタログから削除します。この操作は元に戻せません。</p>
              <p>
                関連する所持情報:{" "}
                {deletePreview.inventory
                  ? `1件（所持数 ${deletePreview.inventory.quantity}、上限解放 ${deletePreview.inventory.uncapLevel}、覚醒 ${deletePreview.inventory.awakeningLevel ?? "未設定"}、メモを含む）`
                  : "0件"}
              </p>
              <p>関連する出典情報: {deletePreview.sources.length}件</p>
              <p>上記の所持情報と出典情報も同時に削除されます。</p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                関連データを含む削除を確認しました
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!confirmed}
                  onClick={() => void deleteCatalog()}
                >
                  削除を実行
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    setConfirmDelete(false);
                    setConfirmed(false);
                  }}
                >
                  削除をキャンセル
                </button>
              </div>
            </fieldset>
          )}
          <div hidden={confirmDelete}>
            <form key={`catalog-${catalogRevision}`} onSubmit={saveCatalog} noValidate>
              <fieldset disabled={busy} className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
                <CatalogFields
                  kind={kind}
                  onKindChange={setKind}
                  values={item}
                  errors={catalogErrors}
                />
                <button className={buttonClass} type="submit">
                  カタログを保存
                </button>
              </fieldset>
            </form>
            <h3 className="mt-6 mb-3 font-bold">所持情報{!item.inventory && "（未所持）"}</h3>
            <form key={`inventory-${inventoryRevision}`} onSubmit={saveInventory} noValidate>
              <fieldset disabled={busy} className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
                {(
                  [
                    ["quantity", "所持数", item.inventory?.quantity ?? 1, 1, 999],
                    ["uncapLevel", "上限解放段階", item.inventory?.uncapLevel ?? 0, 0, 10],
                    [
                      "awakeningLevel",
                      "覚醒レベル（任意）",
                      item.inventory?.awakeningLevel ?? "",
                      0,
                      20,
                    ],
                  ] as const
                ).map(([name, label, value, min, max]) => (
                  <label key={name} className="grid gap-1 text-sm">
                    {label}
                    <input
                      className={fieldClass}
                      name={name}
                      type="number"
                      min={min}
                      max={max}
                      step={1}
                      defaultValue={value}
                      aria-invalid={Boolean(inventoryErrors[name])}
                    />
                    <FieldError name={name} errors={inventoryErrors} />
                  </label>
                ))}
                <label className="grid gap-1 text-sm">
                  メモ
                  <textarea
                    className={fieldClass}
                    name="notes"
                    defaultValue={item.inventory?.notes ?? ""}
                    aria-invalid={Boolean(inventoryErrors.notes)}
                  />
                  <FieldError name="notes" errors={inventoryErrors} />
                </label>
                <button className={buttonClass} type="submit">
                  {item.inventory ? "所持情報を保存" : "所持情報を登録"}
                </button>
                {item.inventory && (
                  <button
                    className={buttonClass}
                    type="button"
                    onClick={() => void removeInventory()}
                  >
                    所持を解除
                  </button>
                )}
              </fieldset>
            </form>
            <h3 className="mt-6 font-bold">出典情報（{item.sources.length}件）</h3>
            <ul className="my-3 grid gap-2">
              {item.sources.map((source) => (
                <li key={source.id} className="break-words text-sm">
                  {source.kind} · {source.observedAt}
                  {source.url && <span className="block">{source.url}</span>}
                  {source.note && <span className="block">{source.note}</span>}
                </li>
              ))}
            </ul>
            <button
              className={buttonClass}
              disabled={busy}
              type="button"
              onClick={() => void previewDelete()}
            >
              カタログを削除…
            </button>
          </div>
        </>
      )}
      <button
        className={`${buttonClass} mt-4 ml-3`}
        disabled={busy}
        type="button"
        onClick={onClose}
      >
        閉じる（未保存の変更を破棄）
      </button>
    </dialog>
  );
}
