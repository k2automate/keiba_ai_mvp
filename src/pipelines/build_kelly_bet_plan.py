from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")
EV_PATH = PREDICTIONS_DIR / "ev_manual.csv"
OUT_PATH = PREDICTIONS_DIR / "kelly_bet_plan.csv"

BANKROLL = 10000  # 初期資金。必要なら変えてOK
MAX_BET_RATIO = 0.05  # 1点あたり最大5%
KELLY_FRACTION = 0.5  # ハーフケリー


def compute_kelly_fraction(win_prob: float, odds: float) -> float:
    """
    decimal odds前提
    b = odds - 1
    kelly = (p*odds - 1) / (odds - 1)
    """
    if pd.isna(win_prob) or pd.isna(odds) or odds <= 1:
        return 0.0

    b = odds - 1.0
    raw = (win_prob * odds - 1.0) / b
    return max(raw, 0.0)


def main():
    df = pd.read_csv(EV_PATH).copy()

    df["win_prob"] = pd.to_numeric(df["win_prob"], errors="coerce")
    df["win_odds"] = pd.to_numeric(df["win_odds"], errors="coerce")
    df["win_ev"] = pd.to_numeric(df["win_ev"], errors="coerce")

    # オッズありだけ
    df = df[df["win_odds"].notna()].copy()

    # ケリー計算
    df["kelly_raw"] = df.apply(
        lambda r: compute_kelly_fraction(r["win_prob"], r["win_odds"]),
        axis=1,
    )
    df["kelly_half"] = df["kelly_raw"] * KELLY_FRACTION
    df["bet_ratio"] = df["kelly_half"].clip(upper=MAX_BET_RATIO)
    df["bet_amount"] = (df["bet_ratio"] * BANKROLL).round(-1)

    # 実務向けコメント
    def grade_comment(row) -> str:
        if pd.isna(row["win_ev"]):
            return "オッズ未入力"
        if row["win_ev"] < 1.0:
            return "期待値不足"
        if row["bet_amount"] <= 0:
            return "買わない"
        if row["bet_amount"] <= 200:
            return "少額"
        if row["bet_amount"] <= 500:
            return "標準"
        return "強気"

    df["bet_grade"] = df.apply(grade_comment, axis=1)

    out_df = df[
        [
            "race_id",
            "race_name",
            "horse_id",
            "horse_name",
            "signal",
            "confidence_label",
            "win_prob",
            "win_odds",
            "win_ev",
            "kelly_raw",
            "kelly_half",
            "bet_ratio",
            "bet_amount",
            "bet_grade",
        ]
    ].copy()

    out_df["win_prob"] = out_df["win_prob"].round(4)
    out_df["win_odds"] = out_df["win_odds"].round(2)
    out_df["win_ev"] = out_df["win_ev"].round(4)
    out_df["kelly_raw"] = out_df["kelly_raw"].round(4)
    out_df["kelly_half"] = out_df["kelly_half"].round(4)
    out_df["bet_ratio"] = (out_df["bet_ratio"] * 100).round(2)

    out_df = out_df.sort_values(
        ["bet_amount", "win_ev", "signal"],
        ascending=[False, False, True],
    )

    out_df.to_csv(OUT_PATH, index=False)

    print("saved:", OUT_PATH)
    print("rows:", len(out_df))


if __name__ == "__main__":
    main()