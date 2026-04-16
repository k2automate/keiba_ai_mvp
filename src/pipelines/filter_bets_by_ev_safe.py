from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")
EV_PATH = PREDICTIONS_DIR / "ev_manual.csv"
CANDIDATES_PATH = PREDICTIONS_DIR / "ticket_candidates.csv"
OUT_PATH = PREDICTIONS_DIR / "bets_ev_safe.csv"


def parse_list(text: str) -> list[str]:
    if pd.isna(text) or str(text).strip() == "":
        return []
    return [x.strip() for x in str(text).split("/") if x.strip()]


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

        # --- 軸EV確認 ---
        axis_row = sub[sub["horse_name"] == axis]
        if axis_row.empty:
            continue

        axis_ev = axis_row.iloc[0]["win_ev"]

        # --- 相手をEVで絞る ---
        good_partners = []
        for p in partners:
            row = sub[sub["horse_name"] == p]
            if not row.empty:
                ev = row.iloc[0]["win_ev"]
                if ev >= 1.0:
                    good_partners.append(p)

        # --- 穴 ---
        good_ana = []
        for a in ana:
            row = sub[sub["horse_name"] == a]
            if not row.empty:
                ev = row.iloc[0]["win_ev"]
                if ev >= 1.2:
                    good_ana.append(a)

        # --- レース判定 ---
        if axis_ev < 1.0:
            race_comment = "軸の期待値が低いため基本見送り（相手妙味狙い）"
        else:
            race_comment = "軸信頼OK"

        # --- ワイド ---
        if len(good_partners) >= 1:
            wide = [f"{axis}-{p}" for p in good_partners[:3]]
            rows.append({
                "race_id": race_id,
                "race_name": cand["race_name"],
                "bet_type": "ワイド",
                "bets": " / ".join(wide),
                "comment": race_comment
            })

        # --- 馬連（軸が強いときだけ） ---
        if axis_ev >= 1.0 and len(good_partners) >= 1:
            umaren = [f"{axis}-{p}" for p in good_partners[:3]]
            rows.append({
                "race_id": race_id,
                "race_name": cand["race_name"],
                "bet_type": "馬連",
                "bets": " / ".join(umaren),
                "comment": "軸EV良好"
            })

        # --- 三連複 ---
        if len(good_partners) >= 2:
            combos = []
            for i in range(len(good_partners)):
                for j in range(i + 1, len(good_partners)):
                    combos.append(f"{axis}-{good_partners[i]}-{good_partners[j]}")
            rows.append({
                "race_id": race_id,
                "race_name": cand["race_name"],
                "bet_type": "三連複",
                "bets": " / ".join(combos),
                "comment": "EV良い相手のみ"
            })

        # --- 穴メモ ---
        if len(good_ana) > 0:
            rows.append({
                "race_id": race_id,
                "race_name": cand["race_name"],
                "bet_type": "穴候補",
                "bets": " / ".join(good_ana),
                "comment": "EV1.2以上の穴"
            })

    out_df = pd.DataFrame(rows)
    out_df.to_csv(OUT_PATH, index=False)

    print("saved:", OUT_PATH)
    print("rows:", len(out_df))


if __name__ == "__main__":
    main()