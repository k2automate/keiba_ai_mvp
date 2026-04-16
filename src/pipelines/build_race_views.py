from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")

HORSE_PATH = PREDICTIONS_DIR / "horse_predictions.csv"
RACE_PATH = PREDICTIONS_DIR / "race_predictions.csv"

OUT_LIST = PREDICTIONS_DIR / "race_list_view.csv"
OUT_SUMMARY = PREDICTIONS_DIR / "race_summary_view.csv"
OUT_DETAIL = PREDICTIONS_DIR / "race_detail_view.csv"


def main():
    horse_df = pd.read_csv(HORSE_PATH)
    race_df = pd.read_csv(RACE_PATH)

    # -----------------------------
    # ① レース一覧（1レース1行）
    # -----------------------------
    race_list_rows = []

    for race_id, sub in horse_df.groupby("race_id"):
        sub = sub.copy()

        race_info = race_df[race_df["race_id"] == race_id]
        if race_info.empty:
            continue
        race_info = race_info.iloc[0]

        top = sub.sort_values("win_prob", ascending=False).iloc[0]

        race_list_rows.append({
            "race_id": race_id,
            "race_name": race_info["race_name"],
            "race_date": race_info["race_date"],
            "venue": race_info["venue"],
            "race_no": race_info["race_no"],
            "field_size": len(sub),
            "chaos_score": race_info["chaos_score"],
            "chaos_band": race_info["chaos_band"],
            "pred_top_horse": top["horse_name"],
            "pred_top_signal": top["signal"],
            "pred_top_confidence": top["confidence_label"],
            "pred_top_ability": top["ability_score"],
        })

    race_list_df = pd.DataFrame(race_list_rows)
    race_list_df.to_csv(OUT_LIST, index=False)

    # -----------------------------
    # ② まとめ（能力値順など）
    # -----------------------------
    summary_rows = []

    for race_id, sub in horse_df.groupby("race_id"):
        sub = sub.copy()

        # 能力値順
        ability_sorted = sub.sort_values("ability_score", ascending=False).head(5)
        for i, (_, row) in enumerate(ability_sorted.iterrows(), start=1):
            summary_rows.append({
                "race_id": race_id,
                "sort_type": "能力値順",
                "rank": i,
                "horse_name": row["horse_name"],
                "value": row["ability_score"],
            })

        # 信頼度順
        conf_sorted = sub.sort_values("confidence_raw", ascending=False).head(5)
        for i, (_, row) in enumerate(conf_sorted.iterrows(), start=1):
            summary_rows.append({
                "race_id": race_id,
                "sort_type": "信頼度順",
                "rank": i,
                "horse_name": row["horse_name"],
                "value": row["confidence_raw"],
            })

        # シグナル順（優先度）
        sig_sorted = sub.sort_values("signal_priority", ascending=True).head(5)
        for i, (_, row) in enumerate(sig_sorted.iterrows(), start=1):
            summary_rows.append({
                "race_id": race_id,
                "sort_type": "シグナル順",
                "rank": i,
                "horse_name": row["horse_name"],
                "value": row["signal"],
            })

    summary_df = pd.DataFrame(summary_rows)
    summary_df.to_csv(OUT_SUMMARY, index=False)

    # -----------------------------
    # ③ レース詳細（全馬）
    # -----------------------------
    detail_df = horse_df.copy()

    # 表示用並び
    detail_df = detail_df.sort_values(["race_id", "win_rank"])

    # 必要カラムだけ
    detail_df = detail_df[
        [
            "race_id",
            "race_date",
            "venue",
            "race_no",
            "race_name",
            "win_rank",
            "gate_no",
            "horse_no",
            "horse_name",
            "jockey_name",
            "signal",
            "confidence_label",
            "ability_score",
            "win_prob",
            "top2_prob",
            "top3_prob",
        ]
    ]

    detail_df.to_csv(OUT_DETAIL, index=False)

    print("saved:", OUT_LIST)
    print("saved:", OUT_SUMMARY)
    print("saved:", OUT_DETAIL)


if __name__ == "__main__":
    main()