import { type FormEvent, useCallback, useEffect, useState } from "react";
import { catalogInputSchema } from "../domain/catalog.js";
import { api, ApiError, type CatalogItem } from "./api.js";

import {
  CatalogFields,
  buttonClass,
  fieldClass,
  kindLabels,
  elementLabels,
  catalogFormInput,
  type FieldErrors,
} from "./CatalogFields.js";
import { CatalogEditor } from "./CatalogEditor.js";

import { sourceStatusLabels, sourceReviewDays, type SourceStatus } from "../domain/sources.js";

import { CsvImport } from "./CsvImport.js";

const panelClass = "mt-4 rounded-2xl border border-line bg-surface/85 p-[1.4rem] shadow-panel";
const headingClass = "mb-4 text-[1.1rem] font-bold";

export function App() {
  const [selectedId, setSelectedId] = useState<string>();
  const [createErrors, setCreateErrors] = useState<FieldErrors>({});
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [createKind, setCreateKind] = useState<CatalogItem["kind"]>("character");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | "">("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [candidateTags, setCandidateTags] = useState("");
  const [candidates, setCandidates] = useState<
    Array<CatalogItem & { score: number; matchedTags: string[] }>
  >([]);

  const loadItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (kind) params.set("kind", kind);
    if (sourceStatus) params.set("sourceStatus", sourceStatus);
    if (ownedOnly) params.set("owned", "true");
    try {
      setBusy(true);
      setError(undefined);
      setItems((await api.searchCatalog(params)).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "読み込みに失敗しました。");
    } finally {
      setBusy(false);
    }
  }, [kind, ownedOnly, query, sourceStatus]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadItems(), 150);
    return () => window.clearTimeout(timeout);
  }, [loadItems]);

  async function createEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreateErrors({});
    setCreating(true);
    try {
      setError(undefined);
      const parsed = catalogInputSchema.safeParse(catalogFormInput(form, createKind));
      if (!parsed.success) {
        const errors: FieldErrors = {};
        for (const issue of parsed.error.issues)
          (errors[issue.path.join(".") || "form"] ??= []).push(issue.message);
        setCreateErrors(errors);
        return;
      }
      await api.createCatalog(parsed.data);
      formElement.reset();
      await loadItems();
    } catch (caught) {
      if (caught instanceof ApiError) setCreateErrors(caught.fieldErrors);
      setError(caught instanceof Error ? caught.message : "登録に失敗しました。");
    } finally {
      setCreating(false);
    }
  }

  async function toggleOwned(item: CatalogItem, owned: boolean) {
    try {
      await api.setInventory(item.id, {
        owned,
        quantity: item.quantity ?? 1,
        uncapLevel: item.uncapLevel ?? 0,
        awakeningLevel: item.awakeningLevel,
        notes: item.notes,
      });
      await loadItems();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "所持情報の更新に失敗しました。");
    }
  }

  async function findCandidates() {
    try {
      const response = await api.candidates({
        kind: kind ? (kind as CatalogItem["kind"]) : undefined,
        requiredTags: candidateTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setCandidates(response.candidates);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "候補抽出に失敗しました。");
    }
  }

  return (
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[1080px] pt-14 pb-20 max-[560px]:w-[calc(100%-1rem)] max-[560px]:pt-6">
      <header className="mb-6 flex items-start justify-between gap-8 max-[850px]:block">
        <div>
          <p className="m-0 text-xs font-extrabold tracking-[0.2em] text-mint-soft">
            LOCAL-FIRST CATALOG
          </p>
          <h1 className="mt-[0.15rem] mb-2 font-display text-[clamp(2.4rem,7vw,5.2rem)] font-medium tracking-[-0.04em]">
            GF Database
          </h1>
          <p className="max-w-[650px] leading-[1.7] text-muted">
            手元のカタログと所持情報から、LLMが編成候補を検討するためのローカル基盤です。
          </p>
        </div>
        <span className="whitespace-nowrap rounded-full border border-line-strong px-3 py-2 text-[#80dbb5] max-[850px]:mt-2 max-[850px]:inline-block">
          127.0.0.1 only
        </span>
      </header>

      <aside className="mb-4 rounded-xl border border-[#5b5430] bg-[#28230e] px-5 py-4 leading-relaxed text-[#eadb8e]">
        このリポジトリに実ゲームデータは含まれていません。文章・画像を転載せず、確認した事実と出典だけを登録してください。
      </aside>

      {error && (
        <div className="mb-4 rounded-xl border border-[#7d3e43] bg-[#35171a] px-5 py-4 leading-relaxed text-[#ffb3ba]">
          {error}
        </div>
      )}

      <CsvImport
        onChanged={async () => {
          setCandidates([]);
          await loadItems();
        }}
      />

      <section className={panelClass}>
        <h2 className={headingClass}>カタログへ追加</h2>
        <form
          className="grid grid-cols-3 gap-[0.7rem] max-[850px]:grid-cols-2 max-[560px]:grid-cols-1"
          onSubmit={createEntity}
          noValidate
        >
          <fieldset
            disabled={creating}
            className="col-span-full grid grid-cols-3 gap-[0.7rem] max-[850px]:grid-cols-2 max-[560px]:grid-cols-1"
          >
            <CatalogFields kind={createKind} onKindChange={setCreateKind} errors={createErrors} />
            <button className={buttonClass} type="submit">
              {creating ? "追加中…" : "追加"}
            </button>
          </fieldset>
        </form>
      </section>

      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <h2 className={headingClass}>カタログと所持情報</h2>
          <span className="text-sm text-[#82a79a]">
            {busy ? "読み込み中…" : `${items.length}件`}
          </span>
        </div>
        <div className="mb-4 grid grid-cols-[2fr_1fr_1fr_auto] max-[850px]:grid-cols-2 gap-[0.7rem] max-[560px]:grid-cols-1">
          <input
            className={fieldClass}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="名称で検索"
          />
          <select
            className={fieldClass}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-label="種類で絞り込み"
          >
            <option value="">すべて</option>
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="grid gap-1 text-sm">
            出典の状態
            <select
              className={fieldClass}
              value={sourceStatus}
              onChange={(event) => setSourceStatus(event.target.value as SourceStatus | "")}
              aria-label="出典の状態で絞り込み"
            >
              <option value="">すべて</option>
              {Object.entries(sourceStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 px-2 whitespace-nowrap">
            <input
              className="size-auto accent-mint"
              type="checkbox"
              checked={ownedOnly}
              onChange={(event) => setOwnedOnly(event.target.checked)}
            />
            所持のみ
          </label>
        </div>

        <p className="mb-3 text-sm text-muted">
          要再確認: 出典の最新の確認日・検証日から{sourceReviewDays}日以上経過した項目。
        </p>
        <div className="grid gap-[0.55rem]">
          {items.length === 0 && !busy && (
            <p className="p-8 text-center text-[#78968b]">
              まだデータがありません。上のフォームから登録できます。
            </p>
          )}
          {items.map((item) => (
            <article
              className="grid grid-cols-[auto_minmax(160px,1fr)_2fr] items-center gap-[0.9rem] rounded-[11px] bg-surface-deep p-[0.9rem] max-[560px]:grid-cols-[auto_1fr]"
              key={item.id}
            >
              <label>
                <input
                  className="size-[1.15rem] accent-[#69e2ad]"
                  type="checkbox"
                  aria-label={`${item.name}の所持`}
                  checked={Boolean(item.owned)}
                  onChange={(event) => void toggleOwned(item, event.target.checked)}
                />
                <span />
              </label>
              <div className="grid gap-1">
                <strong>{item.name}</strong>
                <small
                  className={item.sourceStatus === "current" ? "text-muted" : "text-[#eadb8e]"}
                >
                  {sourceStatusLabels[item.sourceStatus]} · 出典 {item.sourceCount}件
                  {item.lastConfirmedAt
                    ? ` · 最終確認 ${new Date(item.lastConfirmedAt).toLocaleDateString("ja-JP")}`
                    : ""}
                </small>
                <button
                  className="text-left text-sm text-mint underline"
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                >
                  詳細・編集
                </button>
                {item.owned && (
                  <small className="text-muted">
                    所持数 {item.quantity} · 上限解放 {item.uncapLevel} · 覚醒{" "}
                    {item.awakeningLevel ?? "未設定"}
                  </small>
                )}
                <small className="text-muted-deep">
                  {kindLabels[item.kind]}
                  {item.element ? ` · ${elementLabels[item.element]}` : ""}
                  {item.rarity ? ` · ${item.rarity}` : ""}
                </small>
              </div>
              <div className="flex flex-wrap justify-end gap-[0.35rem] max-[560px]:col-start-2 max-[560px]:justify-start">
                {item.tags.map((tag) => (
                  <span
                    className="rounded-full bg-[#163c30] px-2 py-[0.22rem] text-xs text-[#8fe0bd]"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedId && (
        <CatalogEditor
          key={selectedId}
          entityId={selectedId}
          onClose={() => setSelectedId(undefined)}
          onChanged={async () => {
            setCandidates([]);
            await loadItems();
          }}
        />
      )}

      <section className={panelClass}>
        <h2 className={headingClass}>所持候補を事前評価</h2>
        <p className="text-[#92afa4]">
          必要な役割をタグで指定すると、MCPがLLMへ渡すのと同じ候補順位を確認できます。
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-[0.7rem] max-[560px]:grid-cols-1">
          <input
            className={fieldClass}
            value={candidateTags}
            onChange={(event) => setCandidateTags(event.target.value)}
            placeholder="heal, dispel, damage-cut"
          />
          <button className={buttonClass} type="button" onClick={() => void findCandidates()}>
            候補を表示
          </button>
        </div>
        <ol className="list-decimal pl-6">
          {candidates.map((candidate) => (
            <li
              className="flex justify-between border-b border-[#1d3b31] p-[0.55rem]"
              key={candidate.id}
            >
              <span>{candidate.name}</span>
              <span className="tabular-nums text-mint-soft">score {candidate.score}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
