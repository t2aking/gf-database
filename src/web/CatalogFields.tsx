import type { CatalogDetails, CatalogInput, EntityKind } from "../domain/catalog.js";

export const fieldClass =
  "w-full rounded-[10px] border border-line-strong bg-field px-3 py-[0.72rem] text-text-bright outline-none focus:outline-2 focus:outline-offset-1 focus:outline-[#5ed4a2]";
export const buttonClass =
  "cursor-pointer rounded-[10px] bg-mint px-4 py-[0.72rem] font-bold text-[#062018] transition-colors hover:bg-mint-hover disabled:opacity-50";
export const kindLabels = { character: "キャラクター", weapon: "武器", summon: "召喚石" } as const;
export const elementLabels = {
  fire: "火",
  water: "水",
  earth: "土",
  wind: "風",
  light: "光",
  dark: "闇",
  plain: "無",
} as const;
export type FieldErrors = Record<string, string[]>;

export function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
export function formNumber(form: FormData, name: string): number {
  const value = formString(form, name).trim();
  return value === "" ? Number.NaN : Number(value);
}
function formList(form: FormData, name: string) {
  return formString(form, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
export function catalogFormInput(form: FormData, kind: EntityKind) {
  const details =
    kind === "character"
      ? {
          roles: formList(form, "roles"),
          weaponProficiencies: formList(form, "weaponProficiencies"),
          races: formList(form, "races"),
        }
      : kind === "weapon"
        ? {
            weaponType: formString(form, "weaponType"),
            skillEffects: formList(form, "skillEffects"),
            maxUncapLevel: formNumber(form, "maxUncapLevel"),
          }
        : {
            auraEffects: formList(form, "auraEffects"),
            callEffects: formList(form, "callEffects"),
            maxUncapLevel: formNumber(form, "maxUncapLevel"),
          };
  return {
    kind,
    name: formString(form, "name"),
    element: formString(form, "element") || null,
    rarity: formString(form, "rarity") || null,
    tags: formList(form, "tags"),
    details,
  } as CatalogInput;
}

export function FieldError({ name, errors }: { name: string; errors: FieldErrors }) {
  const messages = Object.entries(errors)
    .filter(([key]) => key === name || key.startsWith(`${name}.`))
    .flatMap(([, values]) => values);
  return messages.length > 0 ? (
    <span role="alert" className="block text-sm text-[#ffb3ba]">
      {messages.join(" / ")}
    </span>
  ) : null;
}

type Values = {
  kind: EntityKind;
  name: string;
  element: string | null;
  rarity: string | null;
  tags: string[];
  details: CatalogDetails;
};
export function CatalogFields({
  kind,
  onKindChange,
  values,
  errors = {},
}: {
  kind: EntityKind;
  onKindChange: (kind: EntityKind) => void;
  values?: Values;
  errors?: FieldErrors;
}) {
  const details: Record<string, unknown> = values?.kind === kind ? { ...values.details } : {};
  function textField(name: string, label: string, value: unknown, numeric = false) {
    const display = Array.isArray(value)
      ? value.join(", ")
      : typeof value === "number" || typeof value === "string"
        ? value
        : "";
    return (
      <label
        key={name === "name" || name === "rarity" || name === "tags" ? name : `${kind}-${name}`}
        className="grid gap-1 text-sm"
      >
        {label}
        <input
          className={fieldClass}
          name={name}
          defaultValue={display}
          type={numeric ? "number" : "text"}
          min={numeric ? 0 : undefined}
          max={numeric ? 10 : undefined}
          step={numeric ? 1 : undefined}
          aria-invalid={Boolean(
            errors[name] || Object.keys(errors).some((key) => key.startsWith(`details.${name}`)),
          )}
        />
        <FieldError
          name={name === "name" || name === "rarity" || name === "tags" ? name : `details.${name}`}
          errors={errors}
        />
      </label>
    );
  }
  return (
    <>
      <label className="grid gap-1 text-sm">
        種類
        <select
          className={fieldClass}
          name="kind"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as EntityKind)}
        >
          {Object.entries(kindLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <FieldError name="kind" errors={errors} />
      </label>
      {textField("name", "名称", values?.name)}
      <label className="grid gap-1 text-sm">
        属性
        <select className={fieldClass} name="element" defaultValue={values?.element ?? ""}>
          <option value="">属性なし</option>
          {Object.entries(elementLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <FieldError name="element" errors={errors} />
      </label>
      {textField("rarity", "レアリティ（任意）", values?.rarity)}
      {textField("tags", "役割タグ（カンマ区切り）", values?.tags)}
      {kind === "character" ? (
        <>
          {textField("roles", "役割（例: attacker, support）", details.roles)}
          {textField(
            "weaponProficiencies",
            "得意武器（例: sword, dagger）",
            details.weaponProficiencies,
          )}
          {textField("races", "種族（例: human）", details.races)}
        </>
      ) : kind === "weapon" ? (
        <>
          {textField("weaponType", "武器種（例: sword）", details.weaponType)}
          {textField("skillEffects", "スキル分類（例: attack, hp）", details.skillEffects)}
          {textField("maxUncapLevel", "最大上限解放段階", details.maxUncapLevel, true)}
        </>
      ) : (
        <>
          {textField("auraEffects", "加護分類（例: element-attack）", details.auraEffects)}
          {textField("callEffects", "召喚効果分類（例: damage-cut）", details.callEffects)}
          {textField("maxUncapLevel", "最大上限解放段階", details.maxUncapLevel, true)}
        </>
      )}
      <FieldError name="form" errors={errors} />
    </>
  );
}
