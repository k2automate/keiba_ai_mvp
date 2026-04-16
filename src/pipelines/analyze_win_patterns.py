from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")
RACE_RESULT_PATH = PREDICTIONS_DIR / "race_result_view.csv"

OUT_SIGNAL = PREDICTIONS_DIR / "pattern_signal_stats.csv"
OUT_CONF = PREDICTIONS_DIR / "pattern_confidence_stats.csv"
OUT_ABILITY = PREDICTIONS_DIR / "pattern_ability_band_stats.csv"
OUT_TOP = PREDICTIONS_DIR / "pattern_best_conditions.csv"


def safe_roi(return_sum: float, count: int, stake_per_race: float = 100.0) -> float | None:
    cost = count * stake_per_race
    if cost == 0:
        return None
    return return_sum / cost


def main():
    df = pd.read_csv(RACE_RESULT_PATH).copy()

    df["win_hit"] = pd.to_numeric(df["win_hit"], errors="coerce").fillna(0).astype(int)
    df["top3_hit"] = pd.to_numeric(df["top3_hit"], errors="coerce").fillna(0).astype(int)
    df["win_return"] = pd.to_numeric(df["win_return"], errors="coerce").fillna(0.0)
    df["ability_score"] = pd.to_numeric(df["ability_score"], errors="coerce")

    # 能力帯
    df["ability_band"] = pd.cut(
        df["ability_score"],
        bins=[0, 40, 50, 60, 70, 1000],
        labels=["0-40", "40-50", "50-60", "60-70", "70+"],
        include_lowest=True,
        right=False,
    )

    # -------------------------
    # シグナル別
    # -------------------------
    signal_stats = (
        df.groupby("signal", dropna=False)
        .agg(
            races=("race_id", "count"),
            win_hits=("win_hit", "sum"),
            top3_hits=("top3_hit", "sum"),
            win_return_total=("win_return", "sum"),
        )
        .reset_index()
    )

    signal_stats["win_hit_rate"] = (signal_stats["win_hits"] / signal_stats["races"] * 100).round(2)
    signal_stats["top3_hit_rate"] = (signal_stats["top3_hits"] / signal_stats["races"] * 100).round(2)
    signal_stats["win_roi"] = signal_stats.apply(
        lambda r: round(safe_roi(r["win_return_total"], int(r["races"])) * 100, 2),
        axis=1,
    )
    signal_stats = signal_stats.sort_values(["win_roi", "win_hit_rate"], ascending=[False, False])
    signal_stats.to_csv(OUT_SIGNAL, index=False)

    # -------------------------
    # 信頼度別
    # -------------------------
    conf_stats = (
        df.groupby("confidence_label", dropna=False)
        .agg(
            races=("race_id", "count"),
            win_hits=("win_hit", "sum"),
            top3_hits=("top3_hit", "sum"),
            win_return_total=("win_return", "sum"),
        )
        .reset_index()
    )

    conf_stats["win_hit_rate"] = (conf_stats["win_hits"] / conf_stats["races"] * 100).round(2)
    conf_stats["top3_hit_rate"] = (conf_stats["top3_hits"] / conf_stats["races"] * 100).round(2)
    conf_stats["win_roi"] = conf_stats.apply(
        lambda r: round(safe_roi(r["win_return_total"], int(r["races"])) * 100, 2),
        axis=1,
    )
    conf_stats = conf_stats.sort_values(["win_roi", "win_hit_rate"], ascending=[False, False])
    conf_stats.to_csv(OUT_CONF, index=False)

    # -------------------------
    # 能力帯別
    # -------------------------
    ability_stats = (
        df.groupby("ability_band", dropna=False)
        .agg(
            races=("race_id", "count"),
            win_hits=("win_hit", "sum"),
            top3_hits=("top3_hit", "sum"),
            win_return_total=("win_return", "sum"),
        )
        .reset_index()
    )

    ability_stats["win_hit_rate"] = (ability_stats["win_hits"] / ability_stats["races"] * 100).round(2)
    ability_stats["top3_hit_rate"] = (ability_stats["top3_hits"] / ability_stats["races"] * 100).round(2)
    ability_stats["win_roi"] = ability_stats.apply(
        lambda r: round(safe_roi(r["win_return_total"], int(r["races"])) * 100, 2),
        axis=1,
    )
    ability_stats = ability_stats.sort_values(["win_roi", "win_hit_rate"], ascending=[False, False])
    ability_stats.to_csv(OUT_ABILITY, index=False)

    # -------------------------
    # 勝ちパターン要約
    # -------------------------
    top_rows = []

    if len(signal_stats) > 0:
        s = signal_stats.iloc[0]
        top_rows.append({
            "pattern_type": "best_signal",
            "pattern_value": s["signal"],
            "races": s["races"],
            "win_hit_rate": s["win_hit_rate"],
            "top3_hit_rate": s["top3_hit_rate"],
            "win_roi": s["win_roi"],
        })

    if len(conf_stats) > 0:
        c = conf_stats.iloc[0]
        top_rows.append({
            "pattern_type": "best_confidence",
            "pattern_value": c["confidence_label"],
            "races": c["races"],
            "win_hit_rate": c["win_hit_rate"],
            "top3_hit_rate": c["top3_hit_rate"],
            "win_roi": c["win_roi"],
        })

    if len(ability_stats) > 0:
        a = ability_stats.iloc[0]
        top_rows.append({
            "pattern_type": "best_ability_band",
            "pattern_value": a["ability_band"],
            "races": a["races"],
            "win_hit_rate": a["win_hit_rate"],
            "top3_hit_rate": a["top3_hit_rate"],
            "win_roi": a["win_roi"],
        })

    top_df = pd.DataFrame(top_rows)
    top_df.to_csv(OUT_TOP, index=False)

    print("saved:", OUT_SIGNAL)
    print("saved:", OUT_CONF)
    print("saved:", OUT_ABILITY)
    print("saved:", OUT_TOP)


if __name__ == "__main__":
    main()