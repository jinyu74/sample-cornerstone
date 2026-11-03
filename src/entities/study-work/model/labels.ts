import type { Label, LabelCategory, Target } from "./types";

/** 기본 라벨. 검사별 작업 문서는 이 목록으로 시작하고 사용자 정의 라벨을 추가한다 */
export const DEFAULT_LABELS: readonly Label[] = [
  { id: "organ-liver", name: "간", color: "#16a34a", category: "organ" },
  { id: "organ-kidney", name: "신장", color: "#2563eb", category: "organ" },
  { id: "organ-spleen", name: "비장", color: "#9333ea", category: "organ" },
  { id: "organ-pancreas", name: "췌장", color: "#ca8a04", category: "organ" },
  { id: "organ-lung", name: "폐", color: "#0891b2", category: "organ" },
  { id: "lesion-nodule", name: "결절", color: "#dc2626", category: "lesion" },
  { id: "lesion-mass", name: "종괴", color: "#ea580c", category: "lesion" },
  { id: "lesion-cyst", name: "낭종", color: "#db2777", category: "lesion" },
];

export type LabelValidationError =
  "empty-name" | "duplicate-name" | "invalid-color" | "invalid-category";

const CATEGORIES: readonly LabelCategory[] = ["organ", "lesion"];
const COLOR = /^#[0-9a-f]{6}$/i;
const normalizeName = (name: string) => name.trim().toLocaleLowerCase("ko");

/** 라벨 검증. 이름은 같은 분류 안에서 공백·대소문자를 무시하고 고유해야 한다 */
export function validateLabel(
  label: Label,
  labels: readonly Label[],
): LabelValidationError | null {
  if (!label.name.trim()) return "empty-name";
  if (!CATEGORIES.includes(label.category)) return "invalid-category";
  if (!COLOR.test(label.color)) return "invalid-color";
  const name = normalizeName(label.name);
  const duplicate = labels.some(
    (other) =>
      other.id !== label.id &&
      other.category === label.category &&
      normalizeName(other.name) === name,
  );
  return duplicate ? "duplicate-name" : null;
}

/** 라벨 이름 + 그 라벨 대상의 다음 번호. 삭제로 빈 번호는 재사용하지 않는다 */
export function nextTargetName(
  label: Label,
  targets: readonly Target[],
): string {
  const pattern = /\s(\d+)$/;
  const max = targets
    .filter((target) => target.labelId === label.id)
    .reduce((highest, target) => {
      const match = pattern.exec(target.name);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
  return `${label.name} ${max + 1}`;
}
