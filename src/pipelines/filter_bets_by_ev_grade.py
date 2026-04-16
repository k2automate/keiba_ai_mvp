from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")
EV_PATH = PREDICTIONS_DIR / "ev_manual.csv"
CANDIDATES_PATH = PREDICTIONS_DIR / "ticket_candidates.csv"
OUT_PATH = PREDICTIONS_DIR / "bets_ev_grade.csv"


def parse_list(text: str) -> list[str]:
    if pd.isna(text) or str(text).strip() == "":
        return []
    return [x.strip() for x in str(text).split("/") if x.strip()]


def judge_grade(axis_ev: float, partner_count: int, high_ev_count: int) -> tuple[str, str]:
    if pd.isna(axis_ev):
        return "オッズ待ち", "手動オッズ未入力"

    if axis_ev < 0.9 and high_ev_count == 0:
        return "見送り", "軸も相手も期待値不足"

    if axis_ev < 1.0:
        if high_ev_count >= 1:
            return "少額", "軸妙味は薄いが相手妙味あり"
        return "見送り", "軸妙味が薄く買いづらい"

    if axis_ev >= 1.2 and partner_count >= 2:
        return "強気", "軸EV良好かつ相手も揃う"

    if axis_ev >= 1.0 and partner_count >= 1:
        return "通常", "軸EV良好で相手も確保"

    return "少額", "買えるが条件はやや弱い"


def main():
    ev_df = pd.read_csv(EV_PATH)
    cand_df = pd.read_csv(CANDIDATES_PATH)

    rows = []

    for race_id, sub in ev_df.groupby("race_id"):
        sub = sub.copy()

        cand = cand_df[cand_df["race_id"] == race_id]
        if cand.empty:
            continue
        cand = cand.iloc[0]

        axis = cand["axis_horse"]
        partners = parse_list(cand["partner_candidates"])
        ana = parse_list(cand["ana_candidates"])

        axis_row = sub[sub["horse_name"] == axis]
        if axis_row.empty:
            rows.append(
                {
                    "race_id": race_id,
                    "race_name": cand["race_name"],
                    "chaos_band": cand["chaos_band"],
                    "axis_horse": axis,
                    "axis_signal": "",
                    "axis_ev": None,
                    "good_partners": "",
                    "good_ana": "",
                    "grade": "オッズ待ち",
                    "grade_comment": "軸馬がEVテーブルに見つからない",
                    "wide_bets": "",
                    "umaren_bets": "",
                    "trifuku_bets": "",
                }
            )
            continue

        axis_ev = axis_row.iloc[0]["win_ev"]
        axis_signal = axis_row.iloc[0]["signal"]
        chaos_band = cand["chaos_band"]

        good_partners = []
        high_ev_partners = []
        for p in partners:
            row = sub[sub["horse_name"] == p]
            if row.empty:
                continue
            ev = row.iloc[0]["win_ev"]
            if pd.notna(ev) and ev >= 1.0:
                good_partners.append(p)
            if pd.notna(ev) and ev >= 1.2:
                high_ev_partners.append(p)

        good_ana = []
        for a in ana:
            row = sub[sub["horse_name"] == a]
            if row.empty:
                continue
            ev = row.iloc[0]["win_ev"]
            if pd.notna(ev) and ev >= 1.2:
                good_ana.append(a)

        grade, grade_comment = judge_grade(
            axis_ev=axis_ev,
            partner_count=len(good_partners),
            high_ev_count=len(high_ev_partners) + len(good_ana),
        )

        # 荒れレース補正
        if chaos_band in ["やや荒れ", "荒れ"] and grade == "強気":
            grade = "通常"
            grade_comment = "荒れ判定のため強気から1段階下げ"

        wide_bets = []
        umaren_bets = []
        trifuku_bets = []

        if len(good_partners) >= 1:
            wide_bets = [f"{axis}-{p}" for p in good_partners[:3]]

        if pd.notna(axis_ev) and axis_ev >= 1.0 and len(good_partners) >= 1:
            umaren_bets = [f"{axis}-{p}" for p in good_partners[:3]]

        if len(good_partners) >= 2:
            for i in range(len(good_partners)):
                for j in range(i + 1, len(good_partners)):
                    trifuku_bets.append(f"{axis}-{good_partners[i]}-{good_partners[j]}")

        rows.append(
            {
                "race_id": race_id,
                "race_name": cand["race_name"],
                "chaos_band": chaos_band,
                "axis_horse": axis,
                "axis_signal": axis_signal,
                "axis_ev": round(float(axis_ev), 4) if pd.notna(axis_ev) else None,
                "good_partners": " / ".join(good_partners),
                "good_ana": " / ".join(good_ana),
                "grade": grade,
                "grade_comment": grade_comment,
                "wide_bets": " / ".join(wide_bets),
                "umaren_bets": " / ".join(umaren_bets),
                "trifuku_bets": " / ".join(trifuku_bets),
            }
        )

    out_df = pd.DataFrame(rows)
    out_df.to_csv(OUT_PATH, index=False)

    print("saved:", OUT_PATH)
    print("rows:", len(out_df))


if __name__ == "__main__":
    main()