import os, shutil
from itertools import combinations
import numpy as np
import pandas as pd

INPUT_PATH  = "data/predictions/race_detail_view.csv"
OUTPUT_PATH = "data/predictions/combination_ev_ranking.csv"
UI_DATA_DIR = "ui/public/data/"
TOP_N       = 10   # 1レースあたり上位何点

def sf(v, d=0.0):
    try:
        r = float(str(v).replace(",", ""))
        return r if not np.isnan(r) else d
    except Exception:
        return d

def _race_key(df):
    for c in ["race_id", "レース番号", "レース名"]:
        if c in df.columns: return df[c].astype(str)
    return pd.Series(["__all__"] * len(df), index=df.index)

def harville_umaren(p1, p2):
    eps = 1e-9
    return p1*p2/(1-p1+eps) + p2*p1/(1-p2+eps)

def wide_prob(p1_top3, p2_top3):
    return p1_top3 * p2_top3 * 0.55

def calc_race_combinations(race_df):
    rows = []
    horses = race_df.reset_index(drop=True)
    n = len(horses)
    if n < 2: return rows

    for i, j in combinations(range(n), 2):
        h1, h2 = horses.iloc[i], horses.iloc[j]
        p1_win  = max(sf(h1.get("win_prob",  0)), 1e-6)
        p2_win  = max(sf(h2.get("win_prob",  0)), 1e-6)
        p1_top3 = max(sf(h1.get("top3_prob", 0)), 1e-6)
        p2_top3 = max(sf(h2.get("top3_prob", 0)), 1e-6)

        no1   = int(sf(h1.get("馬番", h1.get("horse_no", 0))))
        no2   = int(sf(h2.get("馬番", h2.get("horse_no", 0))))
        name1 = str(h1.get("馬名", h1.get("horse_name", f"馬{no1}")))
        name2 = str(h2.get("馬名", h2.get("horse_name", f"馬{no2}")))
        mark1 = str(h1.get("印", h1.get("mark", "×")))
        mark2 = str(h2.get("印", h2.get("mark", "×")))

        if no1 > no2:
            no1, no2 = no2, no1
            name1, name2 = name2, name1
            mark1, mark2 = mark2, mark1

        p_umaren = harville_umaren(p1_win, p2_win)
        p_wide   = wide_prob(p1_top3, p2_top3)
        base = {"no1": no1, "no2": no2, "name1": name1, "name2": name2, "mark1": mark1, "mark2": mark2, "numbers": f"{no1}-{no2}"}

        rows.append({**base, "bet_type": "馬連",  "prob": round(p_umaren * 100, 2)})
        rows.append({**base, "bet_type": "ワイド", "prob": round(p_wide   * 100, 2)})
    return rows

def generate_combination_ranking():
    if not os.path.exists(INPUT_PATH):
        print(f"[ERROR] {INPUT_PATH} が見つかりません。")
        return

    df = pd.read_csv(INPUT_PATH, encoding="utf-8-sig")
    if "win_prob" in df.columns and df["win_prob"].max() > 1.5:
        df["win_prob"]  = df["win_prob"]  / 100
        df["top3_prob"] = df["top3_prob"] / 100

    rk = _race_key(df)
    df["_rg"] = rk
    all_rows = []

    for rg, grp_idx in df.groupby("_rg").groups.items():
        combos = calc_race_combinations(df.loc[grp_idx])
        if not combos: continue
        combo_df = pd.DataFrame(combos)
        for bet_type in ["馬連", "ワイド"]:
            sub = combo_df[combo_df["bet_type"] == bet_type].sort_values("prob", ascending=False).head(TOP_N).reset_index(drop=True)
            sub["rank"]    = sub.index + 1
            sub["race_id"] = rg
            all_rows.append(sub)

    if not all_rows: return
    out_df = pd.concat(all_rows, ignore_index=True)[["race_id", "bet_type", "rank", "numbers", "name1", "name2", "mark1", "mark2", "prob"]]
    
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    out_df.to_csv(OUTPUT_PATH, index=False, encoding="utf-8-sig")
    os.makedirs(UI_DATA_DIR, exist_ok=True)
    shutil.copy(OUTPUT_PATH, os.path.join(UI_DATA_DIR, "combination_ev_ranking.csv"))
    print(f"✅ 確率ランキング生成完了: {len(out_df)}行出力しました！")

if __name__ == "__main__":
    generate_combination_ranking()