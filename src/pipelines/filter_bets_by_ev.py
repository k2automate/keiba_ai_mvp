from __future__ import annotations

from pathlib import Path
import pandas as pd

PREDICTIONS_DIR = Path("data/predictions")
EV_PATH = PREDICTIONS_DIR / "ev_manual.csv"
CANDIDATES_PATH = PREDICTIONS_DIR / "ticket_candidates.csv"
OUT_PATH = PREDICTIONS_DIR / "bets_ev_filtered.csv"


BUY_LABELS = {"買い", "相手まで"}


def parse_candidates(text: str) -> list[str]:
    if pd.isna(text) or str(text).strip() == "":
        return []
    return [x.strip() for x in str(text).split("/") if x.strip()]


def build_filtered_bets(ev_df: pd.DataFrame, cand_df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for race_id, sub in ev_df.groupby("race_id"):
        sub = sub.copy()

        # EVで使える馬だけ
        usable = sub[sub["ev_label"].isin(BUY_LABELS)].copy()
        usable = usable.sort_values(["win_ev", "win_prob", "confidence_raw"], ascending=[False, False, False])

        cand_row = cand_df[cand_df["race_id"] == race_id]
        if cand_row.empty:
            continue
        cand = cand_row.iloc[0]

        axis_name = str(cand["axis_horse"]).strip() if pd.notna(cand["axis_horse"]) else ""
        partner_names = parse_candidates(cand["partner_candidates"])
        ana_names = parse_candidates(cand["ana_candidates"])

        # 軸もEVで通っているか確認
        axis_ok = not usable[usable["horse_name"] == axis_name].empty

        # 相手候補のうちEVで通った馬だけ残す
        good_partners = [h for h in partner_names if not usable[usable["horse_name"] == h].empty]
        good_anas = [h for h in ana_names if not usable[usable["horse_name"] == h].empty]

        # 足りなければ usable 上位から補充
        if axis_ok:
            fallback = [
                h for h in usable["horse_name"].tolist()
                if h != axis_name and h not in good_partners
            ]
            while len(good_partners) < 2 and fallback:
                good_partners.append(fallback.pop(0))
        else:
            # 軸がEV的にダメなら、usable最上位を新軸候補にする
            usable_names = usable["horse_name"].tolist()
            if len(usable_names) == 0:
                continue
            axis_name = usable_names[0]
            axis_ok = True
            good_partners = [h for h in usable_names[1:] if h != axis_name][:3]

        # それでも相手がゼロならスキップ
        if not axis_ok or len(good_partners) == 0:
            continue

        # ワイド
        wide_bets = [f"{axis_name}-{p}" for p in good_partners[:3]]
        rows.append(
            {
                "race_id": race_id,
                "race_name": cand["race_name"],
                "bet_type": "ワイド",
                "bets": " / ".join(wide_bets),
                "comment": "EVで残した相手のみ",
            }
        )

        # 馬連
        umaren_bets = [f"{axis_name}-{p}" for p in good_partners[:3]]
        rows.append(
            {
                "race_id": race_id,
                "race_name": cand["race_name"],
                "bet_type": "馬連",
                "bets": " / ".join(umaren_bets),
                "comment": "EVで残した相手のみ",
            }
        )

        # 三連複
        tri_partners = good_partners[:3]
        if len(tri_partners) >= 2:
            trifuku = []
            for i in range(len(tri_partners)):
                for j in range(i + 1, len(tri_partners)):
                    trifuku.append(f"{axis_name}-{tri_partners[i]}-{tri_partners[j]}")
            rows.append(
                {
                    "race_id": race_id,
                    "race_name": cand["race_name"],
                    "bet_type": "三連複",
                    "bets": " / ".join(trifuku),
                    "comment": "EVで残した相手2頭組み合わせ",
                }
            )

        # 穴メモ
        if len(good_anas) > 0:
            rows.append(
                {
                    "race_id": race_id,
                    "race_name": cand["race_name"],
                    "bet_type": "穴候補メモ",
                    "bets": " / ".join(good_anas[:2]),
                    "comment": "能力注・穴でEVを満たした馬",
                }
            )

    return pd.DataFrame(rows)


def main() -> None:
    ev_df = pd.read_csv(EV_PATH)
    cand_df = pd.read_csv(CANDIDATES_PATH)

    out_df = build_filtered_bets(ev_df, cand_df)
    out_df.to_csv(OUT_PATH, index=False)

    print("saved:", OUT_PATH)
    print("rows:", len(out_df))


if __name__ == "__main__":
    main()