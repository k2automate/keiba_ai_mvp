from __future__ import annotations

from pathlib import Path
import itertools
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")

FINAL_BET_PATH = PREDICTIONS_DIR / "final_bet_plan.csv"
CANDIDATES_PATH = PREDICTIONS_DIR / "ticket_candidates.csv"
HORSE_PRED_PATH = PREDICTIONS_DIR / "horse_predictions.csv"
OUT_PATH = PREDICTIONS_DIR / "final_multi_bets.csv"


MAX_PARTNERS = 3


def parse_list(text: str) -> list[str]:
    if pd.isna(text) or str(text).strip() == "":
        return []
    return [x.strip() for x in str(text).split("/") if x.strip()]


def main():
    final_df = pd.read_csv(FINAL_BET_PATH).copy()
    cand_df = pd.read_csv(CANDIDATES_PATH).copy()
    horse_df = pd.read_csv(HORSE_PRED_PATH).copy()

    if final_df.empty:
        out_df = pd.DataFrame(
            columns=[
                "race_id",
                "race_name",
                "bet_type",
                "axis_horse",
                "bets",
                "comment",
            ]
        )
        out_df.to_csv(OUT_PATH, index=False)
        print("saved:", OUT_PATH)
        print("rows: 0")
        return

    horse_df["signal_priority"] = pd.to_numeric(horse_df["signal_priority"], errors="coerce")
    horse_df["win_prob"] = pd.to_numeric(horse_df["win_prob"], errors="coerce")
    horse_df["top3_prob"] = pd.to_numeric(horse_df["top3_prob"], errors="coerce")
    horse_df["confidence_raw"] = pd.to_numeric(horse_df["confidence_raw"], errors="coerce")

    rows = []

    for _, pick in final_df.iterrows():
        race_id = pick["race_id"]
        race_name = pick["race_name"]
        axis_horse = pick["horse_name"]

        cand_row = cand_df[cand_df["race_id"] == race_id]
        race_sub = horse_df[horse_df["race_id"] == race_id].copy()

        if race_sub.empty:
            continue

        partner_candidates: list[str] = []
        ana_candidates: list[str] = []

        if not cand_row.empty:
            cand = cand_row.iloc[0]
            partner_candidates = parse_list(cand.get("partner_candidates", ""))
            ana_candidates = parse_list(cand.get("ana_candidates", ""))

        # 軸以外の候補馬を作る
        candidate_pool = []

        # 1. ticket_candidates の partner_candidates 優先
        for h in partner_candidates:
            if h != axis_horse and h not in candidate_pool:
                candidate_pool.append(h)

        # 2. ana_candidates を追加
        for h in ana_candidates:
            if h != axis_horse and h not in candidate_pool:
                candidate_pool.append(h)

        # 3. 足りなければ予測上位から補充
        fallback_df = race_sub[race_sub["horse_name"] != axis_horse].sort_values(
            ["signal_priority", "top3_prob", "win_prob", "confidence_raw"],
            ascending=[True, False, False, False],
        )

        for h in fallback_df["horse_name"].tolist():
            if h not in candidate_pool:
                candidate_pool.append(h)

        partners = candidate_pool[:MAX_PARTNERS]

        if len(partners) == 0:
            continue

        # ワイド
        wide_bets = [f"{axis_horse}-{p}" for p in partners]
        rows.append(
            {
                "race_id": race_id,
                "race_name": race_name,
                "bet_type": "ワイド",
                "axis_horse": axis_horse,
                "bets": " / ".join(wide_bets),
                "comment": "最終採用馬を軸に相手へ",
            }
        )

        # 馬連
        umaren_bets = [f"{axis_horse}-{p}" for p in partners]
        rows.append(
            {
                "race_id": race_id,
                "race_name": race_name,
                "bet_type": "馬連",
                "axis_horse": axis_horse,
                "bets": " / ".join(umaren_bets),
                "comment": "最終採用馬を軸に相手へ",
            }
        )

        # 3連複
        if len(partners) >= 2:
            trifuku_bets = []
            for p1, p2 in itertools.combinations(partners, 2):
                trifuku_bets.append(f"{axis_horse}-{p1}-{p2}")

            rows.append(
                {
                    "race_id": race_id,
                    "race_name": race_name,
                    "bet_type": "3連複",
                    "axis_horse": axis_horse,
                    "bets": " / ".join(trifuku_bets),
                    "comment": "軸1頭 + 相手2頭組み合わせ",
                }
            )

    out_df = pd.DataFrame(rows)
    out_df.to_csv(OUT_PATH, index=False)

    print("saved:", OUT_PATH)
    print("rows:", len(out_df))


if __name__ == "__main__":
    main()