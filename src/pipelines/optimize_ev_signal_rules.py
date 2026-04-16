from __future__ import annotations

from pathlib import Path
import itertools
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")
RAW_DIR = Path("data/raw")

EV_PATH = PREDICTIONS_DIR / "ev_manual.csv"
RESULTS_PATH = RAW_DIR / "race_results.csv"

OUT_PATH = PREDICTIONS_DIR / "ev_signal_rule_optimization.csv"


def safe_roi(return_sum: float, count: int, stake_per_bet: float = 100.0) -> float | None:
    cost = count * stake_per_bet
    if cost == 0:
        return None
    return return_sum / cost


def normalize_text(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.strip()
        .str.replace("\u3000", "", regex=False)
        .str.replace(" ", "", regex=False)
    )


def build_results_name_map(results_df: pd.DataFrame) -> pd.DataFrame:
    """
    race_results.csv の horse_id から horse_name を復元する。

    パターン1:
      horse_id = "20170401_HANSHIN_11_パーティードレス"
      -> horse_name_from_id = "パーティードレス"

    パターン2:
      horse_id = "12102856.0"
      -> horse_name_from_id = ""
      （このケースは馬名での救済は不可）
    """
    df = results_df.copy()

    horse_id_str = df["horse_id"].astype(str).fillna("")
    race_id_str = df["race_id"].astype(str).fillna("")

    horse_name_list = []
    for hid, rid in zip(horse_id_str, race_id_str):
        prefix = rid + "_"
        if hid.startswith(prefix):
            horse_name_list.append(hid[len(prefix):])
        else:
            horse_name_list.append("")

    df["horse_name_from_id"] = horse_name_list
    return df


def main():
    ev_df = pd.read_csv(EV_PATH, low_memory=False).copy()
    results_df = pd.read_csv(RESULTS_PATH, low_memory=False).copy()

    # 正規化
    ev_df["race_id"] = normalize_text(ev_df["race_id"])
    results_df["race_id"] = normalize_text(results_df["race_id"])

    ev_df["horse_name"] = normalize_text(ev_df["horse_name"])

    results_df = build_results_name_map(results_df)
    results_df["horse_name_from_id"] = normalize_text(results_df["horse_name_from_id"])

    # 数値化
    ev_df["win_ev"] = pd.to_numeric(ev_df["win_ev"], errors="coerce")
    results_df["finish_position"] = pd.to_numeric(results_df["finish_position"], errors="coerce")
    results_df["final_odds"] = pd.to_numeric(results_df["final_odds"], errors="coerce")

    # ---------------------------------
    # race_id + horse_name で結合
    # ---------------------------------
    merged = ev_df.merge(
        results_df[["race_id", "horse_name_from_id", "finish_position", "final_odds"]],
        left_on=["race_id", "horse_name"],
        right_on=["race_id", "horse_name_from_id"],
        how="left",
    )

    # 的中・払戻
    merged["win_hit"] = (merged["finish_position"] == 1).fillna(False).astype(int)
    merged["top3_hit"] = (merged["finish_position"] <= 3).fillna(False).astype(int)
    merged["win_return"] = merged.apply(
        lambda row: row["final_odds"] * 100
        if pd.notna(row["finish_position"]) and row["finish_position"] == 1 and pd.notna(row["final_odds"])
        else 0,
        axis=1,
    )

    signals = ["軸", "複勝圏", "能力注", "様子見"]
    thresholds = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5]

    rows = []

    for threshold in thresholds:
        for r in range(1, 5):
            for signal_combo in itertools.combinations(signals, r):
                sub = merged[
                    merged["signal"].isin(signal_combo)
                    & merged["win_ev"].notna()
                    & (merged["win_ev"] >= threshold)
                    & merged["finish_position"].notna()
                ].copy()

                count = len(sub)
                if count == 0:
                    continue

                win_hits = int(sub["win_hit"].sum())
                top3_hits = int(sub["top3_hit"].sum())
                win_return_total = float(sub["win_return"].sum())

                roi = safe_roi(win_return_total, count)
                win_hit_rate = win_hits / count
                top3_hit_rate = top3_hits / count

                rows.append(
                    {
                        "ev_threshold": threshold,
                        "signals": " / ".join(signal_combo),
                        "bets": count,
                        "win_hits": win_hits,
                        "top3_hits": top3_hits,
                        "win_hit_rate": round(win_hit_rate * 100, 2),
                        "top3_hit_rate": round(top3_hit_rate * 100, 2),
                        "win_return_total": round(win_return_total, 2),
                        "win_roi": round(roi * 100, 2) if roi is not None else None,
                    }
                )

    out_df = pd.DataFrame(rows)

    if not out_df.empty:
        out_df = out_df.sort_values(
            ["win_roi", "win_hit_rate", "bets"],
            ascending=[False, False, False],
        )

    out_df.to_csv(OUT_PATH, index=False)

    print("saved:", OUT_PATH)
    print("rows:", len(out_df))
    print("matched_rows:", int(merged["finish_position"].notna().sum()))


if __name__ == "__main__":
    main()