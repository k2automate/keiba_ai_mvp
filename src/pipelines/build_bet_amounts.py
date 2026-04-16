from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")

FINAL_BET_PATH = PREDICTIONS_DIR / "final_bet_plan.csv"
FINAL_MULTI_BETS_PATH = PREDICTIONS_DIR / "final_multi_bets.csv"
OUT_PATH = PREDICTIONS_DIR / "bet_amounts.csv"

# 総予算
TOTAL_BUDGET = 1000

# 券種ごとの配分比率
BET_TYPE_WEIGHTS = {
    "ワイド": 0.5,
    "馬連": 0.3,
    "3連複": 0.2,
}

# 最低購入金額
MIN_UNIT = 100


def round_to_100(x: float) -> int:
    return int(round(x / 100.0) * 100)


def floor_to_100(x: float) -> int:
    return int(x // 100 * 100)


def main():
    final_df = pd.read_csv(FINAL_BET_PATH).copy()
    multi_df = pd.read_csv(FINAL_MULTI_BETS_PATH).copy()

    if final_df.empty or multi_df.empty:
        out_df = pd.DataFrame(
            columns=[
                "race_id",
                "race_name",
                "bet_type",
                "axis_horse",
                "bet",
                "amount",
                "comment",
            ]
        )
        out_df.to_csv(OUT_PATH, index=False)
        print("saved:", OUT_PATH)
        print("rows: 0")
        return

    rows = []

    # race単位で配分
    for race_id, race_bets in multi_df.groupby("race_id"):
        race_bets = race_bets.copy()

        race_name = race_bets["race_name"].iloc[0]

        final_row = final_df[final_df["race_id"] == race_id]
        if final_row.empty:
            continue
        final_row = final_row.iloc[0]

        axis_horse = final_row["horse_name"]
        axis_bet_amount = pd.to_numeric(final_row["bet_amount"], errors="coerce")
        if pd.isna(axis_bet_amount) or axis_bet_amount <= 0:
            axis_bet_amount = TOTAL_BUDGET

        # 単勝推奨額があるならそれを基準にしつつ、最低でもTOTAL_BUDGET使う
        race_budget = max(TOTAL_BUDGET, int(axis_bet_amount) * 3)

        for _, row in race_bets.iterrows():
            bet_type = row["bet_type"]
            bets_text = row["bets"]

            if bet_type not in BET_TYPE_WEIGHTS:
                continue

            bet_list = [x.strip() for x in str(bets_text).split("/") if x.strip()]
            if len(bet_list) == 0:
                continue

            type_budget = floor_to_100(race_budget * BET_TYPE_WEIGHTS[bet_type])

            # 1点あたり
            per_bet = floor_to_100(type_budget / len(bet_list))

            if per_bet < MIN_UNIT:
                per_bet = MIN_UNIT

            for bet in bet_list:
                rows.append(
                    {
                        "race_id": race_id,
                        "race_name": race_name,
                        "bet_type": bet_type,
                        "axis_horse": axis_horse,
                        "bet": bet,
                        "amount": per_bet,
                        "comment": f"{bet_type}配分 / race_budget={race_budget}",
                    }
                )

    out_df = pd.DataFrame(rows)

    if not out_df.empty:
        out_df = out_df.sort_values(
            ["race_id", "bet_type", "amount", "bet"],
            ascending=[True, True, False, True],
        )

    out_df.to_csv(OUT_PATH, index=False)

    print("saved:", OUT_PATH)
    print("rows:", len(out_df))


if __name__ == "__main__":
    main()