from __future__ import annotations

import numpy as np
import pandas as pd


def minmax_by_race(df: pd.DataFrame, col: str) -> pd.Series:
    g = df.groupby("race_id")[col]
    col_min = g.transform("min")
    col_max = g.transform("max")
    return np.where(
        (col_max - col_min) == 0,
        50.0,
        100.0 * (df[col] - col_min) / (col_max - col_min),
    )


def add_ranks(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["win_rank"] = df.groupby("race_id")["win_prob"].rank(method="min", ascending=False)
    df["top2_rank"] = df.groupby("race_id")["top2_prob"].rank(method="min", ascending=False)
    df["top3_rank"] = df.groupby("race_id")["top3_prob"].rank(method="min", ascending=False)
    df["ability_rank"] = df.groupby("race_id")["ability_score"].rank(method="min", ascending=False)
    return df


def add_confidence(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["win_scaled"] = minmax_by_race(df, "win_prob")
    df["top2_scaled"] = minmax_by_race(df, "top2_prob")
    df["top3_scaled"] = minmax_by_race(df, "top3_prob")
    df["ability_scaled"] = minmax_by_race(df, "ability_score")

    def gap_to_second(sub: pd.DataFrame) -> pd.Series:
        sub = sub.sort_values("win_prob", ascending=False).copy()
        top = sub["win_prob"].iloc[0]
        second = sub["win_prob"].iloc[1] if len(sub) > 1 else top
        gap = top - second
        out = []
        for _, row in sub.iterrows():
            out.append(gap if row["win_rank"] == 1 else 0.0)
        return pd.Series(out, index=sub.index)

    df["gap_to_second"] = (
        df.groupby("race_id", group_keys=False).apply(gap_to_second).astype(float)
    )
    df["gap_to_second_scaled"] = minmax_by_race(df, "gap_to_second")

    df["consensus_score"] = 0.0
    df.loc[df["win_rank"] <= 2, "consensus_score"] += 30
    df.loc[df["top2_rank"] <= 2, "consensus_score"] += 25
    df.loc[df["top3_rank"] <= 3, "consensus_score"] += 25
    df.loc[df["ability_rank"] <= 3, "consensus_score"] += 20

    df["rank_gap_win_ability"] = (df["win_rank"] - df["ability_rank"]).abs()

    df["confidence_raw"] = (
        0.28 * df["win_scaled"]
        + 0.22 * df["top2_scaled"]
        + 0.15 * df["top3_scaled"]
        + 0.20 * df["gap_to_second_scaled"]
        + 0.15 * df["consensus_score"]
    )

    df["confidence_raw"] = df["confidence_raw"].clip(0, 100)

    def to_label(x: float) -> str:
        if x >= 85:
            return "S"
        if x >= 70:
            return "A"
        if x >= 55:
            return "B"
        if x >= 40:
            return "C"
        return "D"

    df["confidence_label"] = df["confidence_raw"].apply(to_label)
    return df


def add_signal(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    def decide(row: pd.Series) -> str:
        if row["win_rank"] == 1 and row["confidence_raw"] >= 75:
            return "軸"

        if row["win_rank"] == 1 and row["confidence_raw"] < 75:
            return "注意"

        if row["ability_rank"] <= 3 and row["win_rank"] >= 3:
            return "能力注"

        if row["top2_rank"] <= 2:
            return "複勝圏"

        if row["top3_rank"] <= 2 and row["win_rank"] <= 4:
            return "複勝圏"

        return "様子見"

    df["signal"] = df.apply(decide, axis=1)

    signal_priority_map = {
        "軸": 1,
        "注意": 2,
        "複勝圏": 3,
        "能力注": 4,
        "様子見": 5,
    }
    df["signal_priority"] = df["signal"].map(signal_priority_map).fillna(9).astype(int)

    return df


def build_race_predictions(df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for race_id, sub in df.groupby("race_id"):
        sub = sub.sort_values("win_prob", ascending=False).copy()

        top_win = sub["win_prob"].values
        top2_vals = sub["top2_prob"].values
        top3_vals = sub["top3_prob"].values

        top1 = top_win[0] if len(top_win) > 0 else 0.0
        top2 = top_win[1] if len(top_win) > 1 else top1
        top3 = top_win[2] if len(top_win) > 2 else top2

        gap12 = top1 - top2
        gap23 = top2 - top3

        p = top_win / (top_win.sum() + 1e-9)
        entropy = -np.sum(p * np.log(p + 1e-9))
        entropy_norm = entropy / np.log(len(p) + 1e-9)

        rank_disagreement = np.mean(np.abs(sub["win_rank"] - sub["ability_rank"]))
        rank_disagreement_norm = min(rank_disagreement / 5.0, 1.0)

        field_size = float(sub["field_size"].iloc[0])
        field_size_norm = min(max((field_size - 8.0) / 10.0, 0.0), 1.0)

        weak_favorite = 1.0 - min(top1 / 0.35, 1.0)
        inverse_gap12 = 1.0 - min(gap12 / 0.12, 1.0)
        inverse_gap23 = 1.0 - min(gap23 / 0.10, 1.0)

        top2_spread = float(np.std(top2_vals[:4])) if len(top2_vals) >= 4 else 0.0
        top3_spread = float(np.std(top3_vals[:4])) if len(top3_vals) >= 4 else 0.0
        top2_spread_norm = min(top2_spread / 0.25, 1.0)
        top3_spread_norm = min(top3_spread / 0.25, 1.0)

        top3_sum = float(np.sum(top3_vals[:3])) if len(top3_vals) >= 3 else float(np.sum(top3_vals))
        top3_sum_norm = min(top3_sum / 2.4, 1.0)
        inverse_top3_sum = 1.0 - top3_sum_norm

        chaos_score = (
            22.0 * float(entropy_norm)
            + 16.0 * float(rank_disagreement_norm)
            + 16.0 * float(inverse_gap12)
            + 10.0 * float(inverse_gap23)
            + 10.0 * float(weak_favorite)
            + 8.0 * float(field_size_norm)
            + 8.0 * float(top2_spread_norm)
            + 5.0 * float(top3_spread_norm)
            + 5.0 * float(inverse_top3_sum)
        )

        chaos_score = float(np.clip(chaos_score, 0, 100))

        if chaos_score <= 25:
            chaos_band = "堅い"
        elif chaos_score <= 55:
            chaos_band = "中間"
        elif chaos_score <= 70:
            chaos_band = "やや荒れ"
        else:
            chaos_band = "荒れ"

        rows.append(
            {
                "race_id": race_id,
                "race_name": sub["race_name"].iloc[0],
                "race_date": sub["race_date"].iloc[0],
                "venue": sub["venue"].iloc[0],
                "race_no": sub["race_no"].iloc[0],
                "chaos_score": round(chaos_score, 2),
                "chaos_band": chaos_band,
            }
        )

    return pd.DataFrame(rows)