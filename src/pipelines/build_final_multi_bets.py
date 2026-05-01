import os
import shutil
import pandas as pd
import itertools

INPUT_PATH = "data/predictions/race_detail_view.csv"
OUTPUT_PATH = "data/predictions/final_multi_bets.csv"

def build_final_multi_bets():
    if not os.path.exists(INPUT_PATH): return
    df = pd.read_csv(INPUT_PATH, encoding="utf-8-sig")
    final_bets = []
    race_col = "race_id" if "race_id" in df.columns else "レース番号"
    horse_no_col = "horse_no" if "horse_no" in df.columns else "馬番"

    for race_id, grp in df.groupby(race_col):
        # AI指数上位5頭を取得（上から順に ◎, ○, ▲, △, (星) に該当）
        top_picks = grp.sort_values("ability_score", ascending=False).head(5)
        if len(top_picks) < 3: continue
        p1, p2, p3 = top_picks.iloc[0], top_picks.iloc[1], top_picks.iloc[2]
        p4 = top_picks.iloc[3] if len(top_picks) > 3 else None
        p5 = top_picks.iloc[4] if len(top_picks) > 4 else None

        # ワイド
        final_bets.append({"race_id": race_id, "bet_type": "ワイド", "numbers": f"{int(p1[horse_no_col])}-{int(p2[horse_no_col])}", "recommendation": "本線"})
        final_bets.append({"race_id": race_id, "bet_type": "ワイド", "numbers": f"{int(p1[horse_no_col])}-{int(p3[horse_no_col])}", "recommendation": "抑え"})

        # 馬連
        for target in [p2, p3, p4, p5]:
            if target is not None: final_bets.append({"race_id": race_id, "bet_type": "馬連", "numbers": f"{int(p1[horse_no_col])}-{int(target[horse_no_col])}", "recommendation": "流し"})

        # 3連複
        others = [str(int(p[horse_no_col])) for p in [p2, p3, p4, p5] if p is not None]
        if len(others) >= 2:
            for combo in itertools.combinations(others, 2):
                final_bets.append({"race_id": race_id, "bet_type": "3連複", "numbers": f"{int(p1[horse_no_col])}-{'-'.join(combo)}", "recommendation": "軸1頭流し"})

        # 🌟 3連単（ご要望のフォーメーションに変更！）
        if p4 is not None:
            n1 = str(int(p1[horse_no_col])) # ◎ (1位)
            n2 = str(int(p2[horse_no_col])) # ○ (2位)
            n3 = str(int(p3[horse_no_col])) # ▲ (3位)
            n4 = str(int(p4[horse_no_col])) # △ (4位)
            
            # ◎○ → ◎○▲△ → ◎○▲△ の文字列を作成
            formation_str = f"{n1},{n2} → {n1},{n2},{n3},{n4} → {n1},{n2},{n3},{n4}"
            
            final_bets.append({
                "race_id": race_id, 
                "bet_type": "3連単", 
                "numbers": formation_str, 
                "recommendation": "フォーメーション"
            })

    out_df = pd.DataFrame(final_bets)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    out_df.to_csv(OUTPUT_PATH, index=False, encoding="utf-8-sig")
    
    ui_data_dir = "ui/public/data/"
    os.makedirs(ui_data_dir, exist_ok=True)
    shutil.copy(OUTPUT_PATH, os.path.join(ui_data_dir, os.path.basename(OUTPUT_PATH)))
    print(f"✅ 買い目構築完了: 3連単をフォーメーションに変更してUIへ転送しました！")

if __name__ == "__main__": build_final_multi_bets()