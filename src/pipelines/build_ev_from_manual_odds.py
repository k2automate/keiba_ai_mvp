from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")
ODDS_PATH = Path("data/odds/manual_win_odds.csv")
HORSE_PRED_PATH = PREDICTIONS_DIR / "horse_predictions.csv"
OUT_PATH = PREDICTIONS_DIR / "ev_manual.csv"


def normalize_text(s: pd.Series) -> pd.Series:
    return (
        s.astype(str)
        .str.strip()
        .str.replace("\u3000", "", regex=False)
        .str.replace(" ", "", regex=False)
    )


def ev_label_from_value(x: float | None) -> str:
    if pd.isna(x):
        return "オッズ未入力"
    if x >= 1.2:
        return "買い"
    if x >= 1.0:
        return "相手まで"
    return "見送り"


def main() -> None:
    horse_df = pd.read_csv(HORSE_PRED_PATH)
    odds_df = pd.read_csv(ODDS_PATH)

    # 必須列確認
    required_horse = {"race_id", "horse_name", "win_prob"}
    required_odds = {"race_id", "horse_name", "win_odds"}
    if not required_horse.issubset(horse_df.columns):
        raise ValueError(f"horse_predictions.csv missing columns: {required_horse - set(horse_df.columns)}")
    if not required_odds.issubset(odds_df.columns):
        raise ValueError(f"manual_win_odds.csv missing columns: {required_odds - set(odds_df.columns)}")

    # 正規化キー
    horse_df = horse_df.copy()
    odds_df = odds_df.copy()

    horse_df["horse_name_key"] = normalize_text(horse_df["horse_name"])
    odds_df["horse_name_key"] = normalize_text(odds_df["horse_name"])

    # もし horse_no もあるなら、参考用に保持
    if "horse_no" in odds_df.columns:
        odds_df["horse_no"] = pd.to_numeric(odds_df["horse_no"], errors="coerce")

    odds_df["win_odds"] = pd.to_numeric(odds_df["win_odds"], errors="coerce")

    # race_id + horse_name で結合
    merged = horse_df.merge(
        odds_df[["race_id", "horse_name", "horse_name_key", "win_odds"]],
        on=["race_id", "horse_name_key"],
        how="left",
        suffixes=("", "_odds"),
    )

    merged["horse_name_odds"] = merged["horse_name_odds"].fillna("")
    merged["win_ev"] = merged["win_prob"] * merged["win_odds"]
    merged["ev_label"] = merged["win_ev"].apply(ev_label_from_value)

    # 表示用
    out_cols = [
        "race_id",
        "race_date",
        "venue",
        "race_no",
        "race_name",
        "horse_id",
        "horse_name",
        "jockey_name",
        "gate_no",
        "horse_no",
        "win_prob",
        "top2_prob",
        "top3_prob",
        "ability_score",
        "win_rank",
        "top2_rank",
        "top3_rank",
        "ability_rank",
        "confidence_raw",
        "confidence_label",
        "signal",
        "signal_priority",
        "horse_name_odds",
        "win_odds",
        "win_ev",
        "ev_label",
    ]

    out_df = merged[out_cols].copy()
    out_df.to_csv(OUT_PATH, index=False)

    matched = out_df["win_odds"].notna().sum()
    print("saved:", OUT_PATH)
    print("rows:", len(out_df))
    print("matched_odds_rows:", int(matched))


if __name__ == "__main__":
    main()