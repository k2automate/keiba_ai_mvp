from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")

KELLY_PATH = PREDICTIONS_DIR / "kelly_bet_plan.csv"
OUT_PATH = PREDICTIONS_DIR / "final_bet_plan.csv"

# -----------------------------
# ルール設定
# -----------------------------
MIN_EV = 1.10
MIN_BET_AMOUNT = 100
ALLOWED_SIGNALS = {"軸", "複勝圏", "能力注"}
ALLOWED_GRADES = {"少額", "標準", "強気"}


def decide_reason(row: pd.Series) -> str:
    reasons = []

    if row["win_ev"] >= 1.5:
        reasons.append("EV高")
    elif row["win_ev"] >= 1.2:
        reasons.append("EV良")
    else:
        reasons.append("EV可")

    reasons.append(f"signal={row['signal']}")
    reasons.append(f"grade={row['bet_grade']}")
    reasons.append(f"bet={int(row['bet_amount'])}円")

    return " / ".join(reasons)


def decide_action(row: pd.Series) -> str:
    if row["bet_amount"] >= 300:
        return "買い"
    if row["bet_amount"] >= 100:
        return "少額買い"
    return "見送り"


def main():
    df = pd.read_csv(KELLY_PATH).copy()

    # 数値型
    df["win_prob"] = pd.to_numeric(df["win_prob"], errors="coerce")
    df["win_odds"] = pd.to_numeric(df["win_odds"], errors="coerce")
    df["win_ev"] = pd.to_numeric(df["win_ev"], errors="coerce")
    df["kelly_raw"] = pd.to_numeric(df["kelly_raw"], errors="coerce")
    df["kelly_half"] = pd.to_numeric(df["kelly_half"], errors="coerce")
    df["bet_ratio"] = pd.to_numeric(df["bet_ratio"], errors="coerce")
    df["bet_amount"] = pd.to_numeric(df["bet_amount"], errors="coerce")

    # フィルター
    filtered = df[
        df["win_ev"].notna()
        & (df["win_ev"] >= MIN_EV)
        & (df["bet_amount"] >= MIN_BET_AMOUNT)
        & (df["signal"].isin(ALLOWED_SIGNALS))
        & (df["bet_grade"].isin(ALLOWED_GRADES))
    ].copy()

    if filtered.empty:
        out_df = pd.DataFrame(
            columns=[
                "race_id",
                "race_name",
                "horse_id",
                "horse_name",
                "signal",
                "confidence_label",
                "win_prob",
                "win_odds",
                "win_ev",
                "bet_amount",
                "bet_grade",
                "action",
                "reason",
            ]
        )
        out_df.to_csv(OUT_PATH, index=False)
        print("saved:", OUT_PATH)
        print("rows: 0")
        return

    # アクション判定
    filtered["action"] = filtered.apply(decide_action, axis=1)
    filtered["reason"] = filtered.apply(decide_reason, axis=1)

    # 並び順
    filtered = filtered.sort_values(
        ["action", "bet_amount", "win_ev", "win_prob"],
        ascending=[True, False, False, False],
    ).copy()

    out_df = filtered[
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
            "bet_amount",
            "bet_grade",
            "action",
            "reason",
        ]
    ].copy()

    out_df["win_prob"] = out_df["win_prob"].round(4)
    out_df["win_odds"] = out_df["win_odds"].round(2)
    out_df["win_ev"] = out_df["win_ev"].round(4)

    out_df.to_csv(OUT_PATH, index=False)

    print("saved:", OUT_PATH)
    print("rows:", len(out_df))


if __name__ == "__main__":
    main()