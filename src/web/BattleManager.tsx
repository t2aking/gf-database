import { useEffect, useState, type FormEvent } from "react";
import { battleInputSchema, battlePurposes, type BattleInput } from "../domain/battles.js";
import { capabilityTags, type CapabilityTag } from "../domain/catalog.js";
import { api, type Battle } from "./api.js";
import { buttonClass, elementLabels, fieldClass } from "./CatalogFields.js";

const blank: BattleInput = {
  name: "",
  enemyElement: null,
  recommendedElement: null,
  purpose: "full-auto",
  requiredTags: [],
  preferredTags: [],
  notes: null,
};
const purposeLabels: Record<BattleInput["purpose"], string> = {
  "full-auto": "フルオート",
  short: "短期",
  long: "長期",
  other: "その他",
};

export function BattleManager({ onChanged }: { onChanged: (items: Battle[]) => void }) {
  const [items, setItems] = useState<Battle[]>([]);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<BattleInput>(blank);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await api.listBattles();
    setItems(response.items);
    onChanged(response.items);
  }
  useEffect(() => {
    void load().catch((caught) => setError(String(caught)));
  }, []);

  function startEdit(item: Battle) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      enemyElement: item.enemyElement,
      recommendedElement: item.recommendedElement,
      purpose: item.purpose,
      requiredTags: item.requiredTags,
      preferredTags: item.preferredTags,
      notes: item.notes,
    });
    setError(undefined);
  }

  function toggleTag(field: "requiredTags" | "preferredTags", tag: CapabilityTag) {
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(tag)
        ? current[field].filter((value) => value !== tag)
        : [...current[field], tag],
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = battleInputSchema.safeParse(form);
    if (!parsed.success) {
      setError(
        parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" / "),
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (editingId) await api.updateBattle(editingId, parsed.data);
      else await api.createBattle(parsed.data);
      setEditingId(undefined);
      setForm(blank);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Battle) {
    if (!window.confirm(`「${item.name}」を削除しますか？`)) return;
    setBusy(true);
    try {
      await api.deleteBattle(item.id);
      if (editingId === item.id) {
        setEditingId(undefined);
        setForm(blank);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "削除に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface/85 p-[1.4rem] shadow-panel">
      <h2 className="mb-4 text-[1.1rem] font-bold">バトル条件</h2>
      {error && (
        <p role="alert" className="mb-3 text-[#ffb3ba]">
          {error}
        </p>
      )}
      <div className="mb-4 grid gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-deep p-3"
          >
            <strong>{item.name}</strong>
            <span className="text-sm text-muted">
              {purposeLabels[item.purpose]} · 必須 {item.requiredTags.join(", ") || "なし"} · 優先{" "}
              {item.preferredTags.join(", ") || "なし"}
            </span>
            <button type="button" className="text-mint underline" onClick={() => startEdit(item)}>
              編集
            </button>
            <button
              type="button"
              className="text-[#ffb3ba] underline"
              disabled={busy}
              onClick={() => void remove(item)}
            >
              削除
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={(event) => void save(event)} className="grid gap-3">
        <h3 className="font-bold">{editingId ? "条件を編集" : "条件を追加"}</h3>
        <div className="grid grid-cols-2 gap-3 max-[560px]:grid-cols-1">
          <label className="grid gap-1">
            名称
            <input
              className={fieldClass}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              maxLength={120}
            />
          </label>
          <label className="grid gap-1">
            目的
            <select
              className={fieldClass}
              value={form.purpose}
              onChange={(event) =>
                setForm({ ...form, purpose: event.target.value as BattleInput["purpose"] })
              }
            >
              {battlePurposes.map((value) => (
                <option key={value} value={value}>
                  {purposeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          {(["enemyElement", "recommendedElement"] as const).map((field) => (
            <label key={field} className="grid gap-1">
              {field === "enemyElement" ? "敵属性" : "推奨属性"}
              <select
                className={fieldClass}
                value={form[field] ?? ""}
                onChange={(event) => setForm({ ...form, [field]: event.target.value || null })}
              >
                <option value="">未指定</option>
                {Object.entries(elementLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {(["requiredTags", "preferredTags"] as const).map((field) => (
          <fieldset key={field} className="rounded-lg border border-line p-3">
            <legend>{field === "requiredTags" ? "必須タグ" : "優先タグ"}</legend>
            <div className="flex flex-wrap gap-3">
              {capabilityTags.map((tag) => (
                <label key={tag} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={form[field].includes(tag)}
                    onChange={() => toggleTag(field, tag)}
                  />
                  {tag}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="grid gap-1">
          メモ
          <textarea
            className={fieldClass}
            value={form.notes ?? ""}
            maxLength={1000}
            onChange={(event) => setForm({ ...form, notes: event.target.value || null })}
          />
        </label>
        <div className="flex gap-2">
          <button className={buttonClass} type="submit" disabled={busy}>
            {editingId ? "更新" : "追加"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(undefined);
                setForm(blank);
              }}
            >
              キャンセル
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
