from __future__ import annotations

from pathlib import Path
import pandas as pd


ROOT = Path(".")
DETAIL_PATH = ROOT / "data/predictions/race_detail_view.csv"
FINAL_BET_PLAN_PATH = ROOT / "data/predictions/final_bet_plan.csv"
OUT_PATH = ROOT / "data/predictions/final_multi_bets.csv"


SIGNAL_PRIORITY = {
    "軸": 4,
    "複勝圏": 3,
    "能力注": 2,
    "様子見": 1,
}


def safe_num(v, fallback=0.0) -> float:
    try:
        return float(v)
    except Exception:
        return fallback


def sort_candidates(df: pd.DataFrame) -> pd.DataFrame:
    g = df.copy()
    g["signal_priority"] = g["signal"].map(SIGNAL_PRIORITY).fillna(0)

    sort_cols = ["signal_priority", "win_prob", "ability_score", "win_rank"]
    sort_asc = [False, False, False, True]

    if "win_ev" in g.columns:
        sort_cols = ["signal_priority", "win_ev", "win_prob", "ability_score", "win_rank"]
        sort_asc = [False, False, False, False, True]

    return g.sort_values(sort_cols, ascending=sort_asc)


def build_pair_strings(axis_row: pd.Series, partner_df: pd.DataFrame) -> list[str]:
    axis_no = int(safe_num(axis_row["horse_no"]))
    axis_name = str(axis_row["horse_name"])
    out = []

    for _, r in partner_df.iterrows():
        out.append(f"{axis_no} {axis_name} - {int(safe_num(r['horse_no']))} {r['horse_name']}")
    return out


def build_trio_strings(axis_row: pd.Series, partner_df: pd.DataFrame) -> list[str]:
    axis_no = int(safe_num(axis_row["horse_no"]))
    axis_name = str(axis_row["horse_name"])
    rows = list(partner_df.itertuples())
    out = []

    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            a = rows[i]
            b = rows[j]
            out.append(
                f"{axis_no} {axis_name} - {int(safe_num(a.horse_no))} {a.horse_name} - {int(safe_num(b.horse_no))} {b.horse_name}"
            )

    return out


def main():
    if not DETAIL_PATH.exists():
        raise FileNotFoundError(f"{DETAIL_PATH} がありません")
    if not FINAL_BET_PLAN_PATH.exists():
        raise FileNotFoundError(f"{FINAL_BET_PLAN_PATH} がありません")

    detail_df = pd.read_csv(DETAIL_PATH)
    plan_df = pd.read_csv(FINAL_BET_PLAN_PATH)

    required_detail = {
        "race_id",
        "race_name",
        "horse_no",
        "horse_name",
        "signal",
        "win_prob",
        "ability_score",
        "win_rank",
    }
    missing_detail = required_detail - set(detail_df.columns)
    if missing_detail:
        raise ValueError(f"race_detail_view.csv missing columns: {missing_detail}")

    required_plan = {"race_id", "horse_no", "horse_name", "signal", "action"}
    missing_plan = required_plan - set(plan_df.columns)
    if missing_plan:
        raise ValueError(f"final_bet_plan.csv missing columns: {missing_plan}")

    if "win_ev" not in detail_df.columns:
        detail_df["win_ev"] = 0.0

    rows = []

    for race_id, race_df in detail_df.groupby("race_id"):
        race_df = race_df.copy()

        # 本命は final_bet_plan 側に従う
        axis_plan = plan_df[plan_df["race_id"] == race_id].copy()
        if axis_plan.empty:
            continue

        axis_plan = axis_plan.iloc[0]

        # 見送りは馬券を作らない
        if str(axis_plan["action"]) == "様子見":
            continue

        axis_horse_no = int(safe_num(axis_plan["horse_no"]))
        axis_row_df = race_df[race_df["horse_no"].apply(safe_num).astype(int) == axis_horse_no].copy()
        if axis_row_df.empty:
            continue

        axis_row = axis_row_df.iloc[0]
        race_name = str(axis_row["race_name"])

        others = race_df[race_df["horse_no"].apply(safe_num).astype(int) != axis_horse_no].copy()

        # 相手優先順位
        fukusho_df = sort_candidates(others[others["signal"] == "複勝圏"].copy())
        ability_df = sort_candidates(others[others["signal"] == "能力注"].copy())
        watch_df = sort_candidates(others[others["signal"] == "様子見"].copy())

        # ワイド:
        # 軸 × 複勝圏を基本
        wide_partners = pd.concat(
            [
                fukusho_df.head(2),
                ability_df.head(max(0, 2 - len(fukusho_df.head(2)))),
            ]
        ).drop_duplicates(subset=["horse_no"])

        # 馬連:
        # 軸 × 複勝圏 + 能力注
        umaren_partners = pd.concat(
            [
                fukusho_df.head(2),
                ability_df.head(2),
            ]
        ).drop_duplicates(subset=["horse_no"])

        # 3連複:
        # 軸1頭固定 + 複勝圏/能力注優先で最大4頭から組む
        trifuku_pool = pd.concat(
            [
                fukusho_df.head(2),
                ability_df.head(2),
                watch_df.head(1),
            ]
        ).drop_duplicates(subset=["horse_no"]).head(4)

        wide_bets = build_pair_strings(axis_row, wide_partners) if not wide_partners.empty else []
        umaren_bets = build_pair_strings(axis_row, umaren_partners) if not umaren_partners.empty else []
        trifuku_bets = build_trio_strings(axis_row, trifuku_pool) if len(trifuku_pool) >= 2 else []

        axis_text = f"{int(safe_num(axis_row['horse_no']))} {axis_row['horse_name']}"

        if wide_bets:
            rows.append(
                {
                    "race_id": race_id,
                    "race_name": race_name,
                    "bet_type": "ワイド",
                    "axis_horse": axis_text,
                    "bets": " / ".join(wide_bets),
                    "comment": "軸×複勝圏を基本。足りなければ能力注を追加",
                }
            )

        if umaren_bets:
            rows.append(
                {
                    "race_id": race_id,
                    "race_name": race_name,
                    "bet_type": "馬連",
                    "axis_horse": axis_text,
                    "bets": " / ".join(umaren_bets),
                    "comment": "軸×複勝圏・能力注",
                }
            )

        if trifuku_bets:
            rows.append(
                {
                    "race_id": race_id,
                    "race_name": race_name,
                    "bet_type": "3連複",
                    "axis_horse": axis_text,
                    "bets": " / ".join(trifuku_bets),
                    "comment": "軸1頭固定。相手は複勝圏・能力注優先",
                }
            )

    out = pd.DataFrame(rows)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT_PATH, index=False)

    print(f"saved: {OUT_PATH}")
    print(f"rows: {len(out)}")


if __name__ == "__main__":
    main()