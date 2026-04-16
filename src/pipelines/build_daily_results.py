from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")
RAW_DIR = Path("data/raw")

HORSE_PRED_PATH = PREDICTIONS_DIR / "horse_predictions.csv"
RESULTS_PATH = RAW_DIR / "race_results.csv"

OUT_RACE_RESULT = PREDICTIONS_DIR / "race_result_view.csv"
OUT_DAILY_RESULT = PREDICTIONS_DIR / "daily_result_view.csv"


def safe_div(numerator: float, denominator: float) -> float | None:
    if denominator == 0:
        return None
    return numerator / denominator


def normalize_text(series: pd.Series) -> pd.Series:
    return (
        series.astype(str)
        .str.strip()
        .str.replace("\u3000", "", regex=False)
        .str.replace(" ", "", regex=False)
    )


def normalize_horse_id(series: pd.Series) -> pd.Series:
    """
    例:
    12102856.0 -> 12102856
    '12102856.0' -> 12102856
    '20170401_HANSHIN_11_パーティードレス' -> 20170401_HANSHIN_11_パーティードレス
    """
    s = series.astype(str).str.strip()
    s = s.str.replace(".0", "", regex=False)
    s = s.replace({"nan": "", "None": ""})
    return s


def build_results_name_map(results_df: pd.DataFrame) -> pd.DataFrame:
    """
    race_results.csv に horse_name 列が無いので、
    horse_id が 'race_id_馬名' 形式のときだけ horse_name を復元する。
    """
    df = results_df.copy()
    df["horse_name_from_id"] = ""

    mask = df["horse_id"].astype(str).str.startswith(df["race_id"].astype(str) + "_", na=False)
    df.loc[mask, "horse_name_from_id"] = (
        df.loc[mask, "horse_id"]
        .astype(str)
        .str.replace(df.loc[mask, "race_id"].astype(str) + "_", "", regex=False)
    )
    return df


def main():
    horse_df = pd.read_csv(HORSE_PRED_PATH, low_memory=False)
    results_df = pd.read_csv(RESULTS_PATH, low_memory=False)

    required_horse_cols = {
        "race_id",
        "horse_id",
        "horse_name",
        "race_date",
        "venue",
        "race_no",
        "race_name",
        "jockey_name",
        "signal",
        "confidence_label",
        "ability_score",
        "win_prob",
        "top2_prob",
        "top3_prob",
        "win_rank",
    }
    required_results_cols = {"race_id", "horse_id", "finish_position", "final_odds"}

    missing_horse = required_horse_cols - set(horse_df.columns)
    missing_results = required_results_cols - set(results_df.columns)

    if missing_horse:
        raise ValueError(f"horse_predictions.csv missing columns: {missing_horse}")
    if missing_results:
        raise ValueError(f"race_results.csv missing columns: {missing_results}")

    horse_df = horse_df.copy()
    results_df = results_df.copy()

    # 正規化
    horse_df["race_id"] = normalize_text(horse_df["race_id"])
    results_df["race_id"] = normalize_text(results_df["race_id"])

    horse_df["horse_id_norm"] = normalize_horse_id(horse_df["horse_id"])
    results_df["horse_id_norm"] = normalize_horse_id(results_df["horse_id"])

    horse_df["horse_name_norm"] = normalize_text(horse_df["horse_name"])

    results_df = build_results_name_map(results_df)
    results_df["horse_name_from_id_norm"] = normalize_text(results_df["horse_name_from_id"])

    horse_df["win_rank"] = pd.to_numeric(horse_df["win_rank"], errors="coerce")
    results_df["finish_position"] = pd.to_numeric(results_df["finish_position"], errors="coerce")
    results_df["final_odds"] = pd.to_numeric(results_df["final_odds"], errors="coerce")
    results_df["final_popularity"] = pd.to_numeric(results_df.get("final_popularity"), errors="coerce")

    # 予測1位馬
    pred1_df = (
        horse_df.sort_values(["race_id", "win_rank"], ascending=[True, True])
        .groupby("race_id", as_index=False)
        .first()
    )

    # -----------------------------
    # 1段階目: race_id + horse_id で結合
    # -----------------------------
    merged_id = pred1_df.merge(
        results_df[
            [
                "race_id",
                "horse_id_norm",
                "finish_position",
                "final_odds",
                "final_popularity",
            ]
        ],
        on=["race_id", "horse_id_norm"],
        how="left",
    )

    # -----------------------------
    # 2段階目: 未結合だけ race_id + horse_name で救済
    # -----------------------------
    unmatched = merged_id["finish_position"].isna()

    if unmatched.any():
        fallback_src = pred1_df.loc[unmatched].copy()

        merged_name = fallback_src.merge(
            results_df[
                [
                    "race_id",
                    "horse_name_from_id_norm",
                    "finish_position",
                    "final_odds",
                    "final_popularity",
                ]
            ],
            left_on=["race_id", "horse_name_norm"],
            right_on=["race_id", "horse_name_from_id_norm"],
            how="left",
        )

        merged_id.loc[unmatched, "finish_position"] = merged_name["finish_position"].values
        merged_id.loc[unmatched, "final_odds"] = merged_name["final_odds"].values
        merged_id.loc[unmatched, "final_popularity"] = merged_name["final_popularity"].values

    merged = merged_id.copy()

    # 的中判定
    merged["win_hit"] = (merged["finish_position"] == 1).fillna(False).astype(int)
    merged["top3_hit"] = (merged["finish_position"] <= 3).fillna(False).astype(int)

    # 単勝100円ベタ買い
    merged["win_bet"] = 100
    merged["win_return"] = merged.apply(
        lambda row: row["final_odds"] * 100
        if pd.notna(row["finish_position"]) and row["finish_position"] == 1 and pd.notna(row["final_odds"])
        else 0,
        axis=1,
    )

    # レース単位結果ビュー
    race_result_view = merged[
        [
            "race_id",
            "race_date",
            "venue",
            "race_no",
            "race_name",
            "horse_id",
            "horse_name",
            "jockey_name",
            "signal",
            "confidence_label",
            "ability_score",
            "win_prob",
            "top2_prob",
            "top3_prob",
            "finish_position",
            "final_odds",
            "final_popularity",
            "win_hit",
            "top3_hit",
            "win_return",
        ]
    ].copy()

    race_result_view["ability_score"] = pd.to_numeric(race_result_view["ability_score"], errors="coerce").round(2)
    race_result_view["win_prob"] = pd.to_numeric(race_result_view["win_prob"], errors="coerce").round(4)
    race_result_view["top2_prob"] = pd.to_numeric(race_result_view["top2_prob"], errors="coerce").round(4)
    race_result_view["top3_prob"] = pd.to_numeric(race_result_view["top3_prob"], errors="coerce").round(4)

    race_result_view.to_csv(OUT_RACE_RESULT, index=False)

    # 日次集計
    total_races = len(merged)
    pred1_win_hits = int(merged["win_hit"].sum())
    pred1_top3_hits = int(merged["top3_hit"].sum())

    win_bet_total = float(merged["win_bet"].sum())
    win_return_total = float(pd.to_numeric(merged["win_return"], errors="coerce").fillna(0).sum())

    win_hit_rate = safe_div(pred1_win_hits, total_races)
    top3_hit_rate = safe_div(pred1_top3_hits, total_races)
    win_roi = safe_div(win_return_total, win_bet_total)

    matched_results = int(merged["finish_position"].notna().sum())

    daily_result_df = pd.DataFrame(
        [
            {
                "race_date": merged["race_date"].iloc[0] if total_races > 0 else None,
                "total_races": total_races,
                "matched_results": matched_results,
                "pred1_win_hits": pred1_win_hits,
                "pred1_top3_hits": pred1_top3_hits,
                "pred1_win_hit_rate": round(win_hit_rate * 100, 2) if win_hit_rate is not None else None,
                "pred1_top3_hit_rate": round(top3_hit_rate * 100, 2) if top3_hit_rate is not None else None,
                "win_bet_total": int(win_bet_total),
                "win_return_total": round(win_return_total, 2),
                "win_profit": round(win_return_total - win_bet_total, 2),
                "win_roi": round(win_roi * 100, 2) if win_roi is not None else None,
                "note": "horse_id優先結合 + 馬名fallback結合",
            }
        ]
    )

    daily_result_df.to_csv(OUT_DAILY_RESULT, index=False)

    print("saved:", OUT_RACE_RESULT)
    print("saved:", OUT_DAILY_RESULT)
    print("total_races:", total_races)
    print("matched_results:", matched_results)
    print("pred1_win_hits:", pred1_win_hits)
    print("pred1_top3_hits:", pred1_top3_hits)


if __name__ == "__main__":
    main()