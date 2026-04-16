from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")


def load_inputs() -> tuple[pd.DataFrame, pd.DataFrame]:
    horse_df = pd.read_csv(PREDICTIONS_DIR / "horse_predictions.csv")
    race_df = pd.read_csv(PREDICTIONS_DIR / "race_predictions.csv")
    return horse_df, race_df


def decide_ticket_strategy(chaos_band: str, axis_count: int, fukusho_count: int, ability_count: int) -> str:
    if chaos_band == "堅い":
        if axis_count >= 1:
            return "軸1頭固定で点数を絞る"
        return "上位人気中心に少点数"

    if chaos_band == "中間":
        if axis_count >= 1 and fukusho_count >= 2:
            return "軸から相手へ流す"
        if ability_count >= 1:
            return "能力注を相手に入れる"
        return "ワイド・馬連中心"

    if chaos_band == "やや荒れ":
        if ability_count >= 1:
            return "能力注を絡めて広め"
        return "ワイド・三連複寄り"

    return "穴候補を絡めて広め"


def build_candidates(horse_df: pd.DataFrame, race_df: pd.DataFrame) -> pd.DataFrame:
    merged = horse_df.merge(
        race_df[["race_id", "chaos_score", "chaos_band"]],
        on="race_id",
        how="left",
    )

    rows = []

    for race_id, sub in merged.groupby("race_id"):
        sub = sub.sort_values(["signal_priority", "confidence_raw", "win_prob"], ascending=[True, False, False]).copy()

        axis_df = sub[sub["signal"] == "軸"].copy()
        caution_df = sub[sub["signal"] == "注意"].copy()
        fukusho_df = sub[sub["signal"] == "複勝圏"].copy()
        ability_df = sub[sub["signal"] == "能力注"].copy()

        axis_horse = axis_df.iloc[0]["horse_name"] if len(axis_df) > 0 else ""
        caution_horse = caution_df.iloc[0]["horse_name"] if len(caution_df) > 0 else ""

        # 相手候補は複勝圏を優先、足りなければ能力注も加える
        partner_pool = pd.concat([fukusho_df, ability_df], axis=0).drop_duplicates(subset=["horse_id"])
        partner_pool = partner_pool.sort_values(["confidence_raw", "top2_prob", "top3_prob"], ascending=[False, False, False])

        partner_names = partner_pool["horse_name"].head(3).tolist()
        partner_text = " / ".join(partner_names)

        # 穴候補は能力注優先、なければ下位の複勝圏
        if len(ability_df) > 0:
            ana_names = ability_df.sort_values(["ability_score", "confidence_raw"], ascending=[False, False])["horse_name"].head(2).tolist()
        else:
            ana_names = (
                fukusho_df.sort_values(["confidence_raw"], ascending=False)["horse_name"].tail(2).tolist()
                if len(fukusho_df) > 0 else []
            )
        ana_text = " / ".join(ana_names)

        chaos_band = sub["chaos_band"].iloc[0]
        chaos_score = sub["chaos_score"].iloc[0]

        strategy = decide_ticket_strategy(
            chaos_band=chaos_band,
            axis_count=len(axis_df),
            fukusho_count=len(fukusho_df),
            ability_count=len(ability_df),
        )

        # 推奨券種
        if chaos_band == "堅い":
            ticket_type = "馬連 / ワイド"
        elif chaos_band == "中間":
            ticket_type = "ワイド / 馬連 / 三連複"
        elif chaos_band == "やや荒れ":
            ticket_type = "ワイド / 三連複"
        else:
            ticket_type = "三連複 / 三連単"

        rows.append(
            {
                "race_id": race_id,
                "race_date": sub["race_date"].iloc[0],
                "venue": sub["venue"].iloc[0],
                "race_no": sub["race_no"].iloc[0],
                "race_name": sub["race_name"].iloc[0],
                "chaos_score": round(float(chaos_score), 2),
                "chaos_band": chaos_band,
                "axis_horse": axis_horse,
                "caution_horse": caution_horse,
                "partner_candidates": partner_text,
                "ana_candidates": ana_text,
                "recommended_ticket_type": ticket_type,
                "strategy_comment": strategy,
            }
        )

    out_df = pd.DataFrame(rows).sort_values(["race_date", "venue", "race_no"])
    return out_df


def main() -> None:
    horse_df, race_df = load_inputs()
    out_df = build_candidates(horse_df, race_df)

    output_path = PREDICTIONS_DIR / "ticket_candidates.csv"
    out_df.to_csv(output_path, index=False)

    print("saved:", output_path)


if __name__ == "__main__":
    main()