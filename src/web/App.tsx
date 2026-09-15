import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { CatalogInput } from "../domain/catalog.js";
import { api, type CatalogItem } from "./api.js";

const kindLabels = { character: "キャラクター", weapon: "武器", summon: "召喚石" } as const;
const elementLabels = {
  fire: "火",
  water: "水",
  earth: "土",
  wind: "風",
  light: "光",
  dark: "闇",
  plain: "無",
} as const;

const fieldClass =
  "w-full rounded-[10px] border border-line-strong bg-field px-3 py-[0.72rem] text-text-bright outline-none focus:outline-2 focus:outline-offset-1 focus:outline-[#5ed4a2]";
const buttonClass =
  "cursor-pointer rounded-[10px] bg-mint px-4 py-[0.72rem] font-bold text-[#062018] transition-colors hover:bg-mint-hover";
const panelClass = "mt-4 rounded-2xl border border-line bg-surface/85 p-[1.4rem] shadow-panel";
const headingClass = "mb-4 text-[1.1rem] font-bold";

function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function formList(form: FormData, name: string): string[] {
  return formString(form, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function App() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [createKind, setCreateKind] = useState<CatalogItem["kind"]>("character");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
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
  }, [kind, ownedOnly, query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadItems(), 150);
    return () => window.clearTimeout(timeout);
  }, [loadItems]);

  async function createEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setError(undefined);
      const common = {
        name: formString(form, "name"),
        element: (formString(form, "element") || undefined) as CatalogItem["element"],
        rarity: formString(form, "rarity") || undefined,
        tags: formList(form, "tags"),
      };
      const details =
        createKind === "character"
          ? {
              roles: formList(form, "roles"),
              weaponProficiencies: formList(form, "weaponProficiencies"),
              races: formList(form, "races"),
            }
          : createKind === "weapon"
            ? {
                weaponType: formString(form, "weaponType"),
                skillEffects: formList(form, "skillEffects"),
                maxUncapLevel: Number(formString(form, "maxUncapLevel")),
              }
            : {
                auraEffects: formList(form, "auraEffects"),
                callEffects: formList(form, "callEffects"),
                maxUncapLevel: Number(formString(form, "maxUncapLevel")),
              };
      await api.createCatalog({ kind: createKind, ...common, details } as CatalogInput);
      event.currentTarget.reset();
      await loadItems();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登録に失敗しました。");
    }
  }

  async function toggleOwned(item: CatalogItem, owned: boolean) {
    try {
      await api.setInventory(item.id, {
        owned,
        quantity: item.quantity ?? 1,
        uncapLevel: item.uncapLevel ?? 0,
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

      <section className={panelClass}>
        <h2 className={headingClass}>カタログへ追加</h2>
        <form
          className="grid grid-cols-3 gap-[0.7rem] max-[850px]:grid-cols-2 max-[560px]:grid-cols-1"
          onSubmit={createEntity}
        >
          <select
            className={fieldClass}
            name="kind"
            aria-label="種類"
            value={createKind}
            onChange={(event) => setCreateKind(event.target.value as CatalogItem["kind"])}
            required
          >
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input className={fieldClass} name="name" placeholder="名称" required maxLength={120} />
          <select className={fieldClass} name="element" aria-label="属性" defaultValue="">
            <option value="">属性なし</option>
            {Object.entries(elementLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            className={fieldClass}
            name="rarity"
            placeholder="レアリティ（任意）"
            maxLength={20}
          />
          <input
            className={fieldClass}
            name="tags"
            placeholder="役割タグをカンマ区切り（例: heal, dispel）"
          />
          {createKind === "character" && (
            <>
              <input
                className={fieldClass}
                name="roles"
                placeholder="役割（例: attacker, support）"
                required
              />
              <input
                className={fieldClass}
                name="weaponProficiencies"
                placeholder="得意武器（例: sword, dagger）"
                required
              />
              <input className={fieldClass} name="races" placeholder="種族（例: human）" required />
            </>
          )}
          {createKind === "weapon" && (
            <>
              <input
                className={fieldClass}
                name="weaponType"
                placeholder="武器種（例: sword）"
                required
              />
              <input
                className={fieldClass}
                name="skillEffects"
                placeholder="スキル分類（例: attack, hp）"
                required
              />
              <input
                className={fieldClass}
                name="maxUncapLevel"
                type="number"
                min="0"
                max="10"
                placeholder="最大上限解放段階"
                required
              />
            </>
          )}
          {createKind === "summon" && (
            <>
              <input
                className={fieldClass}
                name="auraEffects"
                placeholder="加護分類（例: element-attack）"
                required
              />
              <input
                className={fieldClass}
                name="callEffects"
                placeholder="召喚効果分類（例: damage-cut）"
                required
              />
              <input
                className={fieldClass}
                name="maxUncapLevel"
                type="number"
                min="0"
                max="10"
                placeholder="最大上限解放段階"
                required
              />
            </>
          )}
          <button className={buttonClass} type="submit">
            追加
          </button>
        </form>
      </section>

      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <h2 className={headingClass}>カタログと所持情報</h2>
          <span className="text-sm text-[#82a79a]">
            {busy ? "読み込み中…" : `${items.length}件`}
          </span>
        </div>
        <div className="mb-4 grid grid-cols-[2fr_1fr_auto] gap-[0.7rem] max-[560px]:grid-cols-1">
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
                  checked={Boolean(item.owned)}
                  onChange={(event) => void toggleOwned(item, event.target.checked)}
                />
                <span />
              </label>
              <div className="grid gap-1">
                <strong>{item.name}</strong>
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
