import pandas as pd
import itertools
import os

def build_final_multi_bets():
    input_path = "data/predictions/race_detail_view.csv"
    output_path = "data/predictions/final_multi_bets.csv"
    
    if not os.path.exists(input_path):
        print(f"Error: {input_path} が見つかりません。")
        return
        
    df = pd.read_csv(input_path)
    results = []
    
    for race_id, group in df.groupby("race_id"):
        race_name = group["race_name"].iloc[0] if "race_name" in group.columns else ""
        
        # 1. 軸馬を1頭選ぶ（一番AI指数が高い馬）
        axis_candidates = group[group["signal"].isin(["軸", "複勝圏"])].sort_values("ability_score", ascending=False)
        if axis_candidates.empty:
            axis_candidates = group.sort_values("ability_score", ascending=False)
        
        axis = axis_candidates.iloc[0]
        axis_no = axis["horse_no"]
        axis_name = f"{axis_no} {axis['horse_name']}"
        
        # 2. 相手を5頭選ぶ（軸以外のAI指数上位5頭）
        targets = group[group["horse_no"] != axis_no].sort_values("ability_score", ascending=False).head(5)
        target_list = [f"{row['horse_no']} {row['horse_name']}" for _, row in targets.iterrows()]
        
        if len(target_list) < 2:
            continue
            
        # --- 買い目の生成 ---
        
        # ① ワイド (軸1頭 - 相手上位2頭 = 2点)
        wide_targets = target_list[:2]
        wide_bets = " / ".join([f"{axis_name} - {t}" for t in wide_targets])
        results.append({
            "race_id": race_id, "race_name": race_name, "bet_type": "ワイド",
            "axis_horse": axis_name, "bets": wide_bets, "comment": "軸1頭・相手上位2頭（2点）"
        })
        
        # ② 馬連 (軸1頭 - 相手5頭 = 5点)
        umaren_bets = " / ".join([f"{axis_name} - {t}" for t in target_list])
        results.append({
            "race_id": race_id, "race_name": race_name, "bet_type": "馬連",
            "axis_horse": axis_name, "bets": umaren_bets, "comment": "軸1頭・相手5頭（5点）"
        })
        
        # ③ 3連複 (軸1頭固定 - 相手5頭フォーメーション = 10点)
        sanren_bets = []
        for combo in itertools.combinations(target_list, 2):
            sanren_bets.append(f"{axis_name} - {combo[0]} - {combo[1]}")
        
        results.append({
            "race_id": race_id, "race_name": race_name, "bet_type": "3連複",
            "axis_horse": axis_name, "bets": " / ".join(sanren_bets), "comment": "軸1頭・相手5頭（10点）"
        })

        # ④ 3連単 (1着固定: 軸1頭 → 2・3着: 相手5頭 = 20点)
        sanrentan_bets = []
        # itertools.permutationsで順列（A→BとB→Aの両方）を生成
        for perm in itertools.permutations(target_list, 2):
            sanrentan_bets.append(f"{axis_name} → {perm[0]} → {perm[1]}")
        
        results.append({
            "race_id": race_id, "race_name": race_name, "bet_type": "3連単",
            "axis_horse": axis_name, "bets": " / ".join(sanrentan_bets), "comment": "1着固定・相手5頭（20点）"
        })
        
    out_df = pd.DataFrame(results)
    out_df.to_csv(output_path, index=False)
    print("Successfully updated final_multi_bets.csv (ワイド2点・馬連5点・3連複10点・3連単20点)")

if __name__ == "__main__":
    build_final_multi_bets()