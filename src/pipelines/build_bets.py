from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")


def load_candidates() -> pd.DataFrame:
    return pd.read_csv(PREDICTIONS_DIR / "ticket_candidates.csv")


def parse_list(text: str) -> list[str]:
    if pd.isna(text) or text == "":
        return []
    return [x.strip() for x in str(text).split("/")]


def build_bets(df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for _, row in df.iterrows():
        race_id = row["race_id"]
        axis = row["axis_horse"]
        partners = parse_list(row["partner_candidates"])

        wide_bets = []
        for p in partners:
            if axis and p:
                wide_bets.append(f"{axis}-{p}")

        if wide_bets:
            rows.append(
                {
                    "race_id": race_id,
                    "bet_type": "ワイド",
                    "bets": " / ".join(wide_bets),
                    "comment": "軸から相手へ",
                }
            )

        umaren_bets = []
        for p in partners:
            if axis and p:
                umaren_bets.append(f"{axis}-{p}")

        if umaren_bets:
            rows.append(
                {
                    "race_id": race_id,
                    "bet_type": "馬連",
                    "bets": " / ".join(umaren_bets),
                    "comment": "軸から流し",
                }
            )

        if len(partners) >= 2 and axis:
            for i in range(len(partners)):
                for j in range(i + 1, len(partners)):
                    p1 = partners[i]
                    p2 = partners[j]
                    rows.append(
                        {
                            "race_id": race_id,
                            "bet_type": "三連複",
                            "bets": f"{axis}-{p1}-{p2}",
                            "comment": "軸1頭 + 相手2頭",
                        }
                    )

    return pd.DataFrame(rows)


def main():
    df = load_candidates()
    bets_df = build_bets(df)

    output_path = PREDICTIONS_DIR / "bets.csv"
    bets_df.to_csv(output_path, index=False)

    print("saved:", output_path)


if __name__ == "__main__":
    main()