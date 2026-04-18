import pandas as pd
import numpy as np
import os

def run_pipeline():
    # 1. 入力データの読み込み
    input_path = "data/manual/race_day_input.csv"
    if not os.path.exists(input_path):
        print(f"Error: {input_path} が見つかりません。")
        return

    df = pd.read_csv(input_path)

    # --- クオンツ・ロジック開始 ---

    # A. 市場確率（暗黙確率）の計算
    df["prob_market"] = 1 / df["win_odds"]
    # 控除率（テラ銭）を考慮したレース内正規化
    df["prob_market_norm"] = df.groupby("race_id")["prob_market"].transform(lambda x: x / x.sum())

    # B. 真の勝率 (win_prob) 
    # 本来はAIモデルの出力を入れる。未実装の場合は市場確率をベースにする
    if "win_prob" not in df.columns:
        df["win_prob"] = df["prob_market_norm"]

    # C. 複勝圏内確率 (top3_prob) の推定
    # 勝率が高い馬ほど複勝率は収束し、穴馬ほど複勝率の振れ幅が大きい性質を考慮
    # $P_{place} \approx P_{win} \times (2.2 + \frac{Odds}{20})$
    df["top3_prob"] = (df["win_prob"] * (2.2 + (df["win_odds"] / 20))).clip(upper=0.92)

    # D. 期待値 (EV) の算出
    # $EV = P_{true} \times Odds$
    df["win_ev"] = df["win_prob"] * df["win_odds"]

    # E. 異常検知：危険な人気馬のフィルタリング (Anomaly Detection)
    def calculate_anomaly_bias(row):
        bias = 1.0
        # 期待値が0.8以下の人気馬（4倍未満）は、統計的に「過剰人気」と判断
        if row["win_odds"] < 4.0 and row["win_ev"] < 0.85:
            bias = 0.80 # 20%の能力デバフ（評価減）
        return bias

    df["anomaly_bias"] = df.apply(calculate_anomaly_bias, axis=1)

    # F. 能力指数の再定義 (ability_score)
    # オッズ（価格）の影響を排除し、純粋な勝率と複勝率、異常検知のみで構成
    df["pure_ability"] = (df["win_prob"] * 0.7 + df["top3_prob"] * 0.3) * df["anomaly_bias"]
    
    # UI用の 35-85 スケール正規化
    group = df.groupby("race_id")["pure_ability"]
    min_a = group.transform("min")
    max_a = group.transform("max")
    df["ability_score"] = 35 + (df["pure_ability"] - min_a) / (max_a - min_a + 1e-6) * 50

    # G. 投資シグナルの生成
    def detect_signal(row):
        # 軸：高い勝率 × 高い期待値
        if row["win_prob"] > 0.22 and row["win_ev"] > 1.25:
            return "軸"
        # 能力注：勝率は低くても期待値が異常に高い（オッズの歪み）
        elif row["win_ev"] > 1.60:
            return "能力注"
        # 複勝圏：3着以内に入る確率が高く、期待値も1.0を超えている
        elif row["top3_prob"] > 0.40 and row["win_ev"] > 1.05:
            return "複勝圏"
        else:
            return "様子見"

    df["signal"] = df.apply(detect_signal, axis=1)

    # --- 保存セクション ---
    os.makedirs("data/predictions", exist_ok=True)
    df.to_csv("data/predictions/race_detail_view.csv", index=False)
    print("Successfully generated: race_detail_view.csv")

if __name__ == "__main__":
    run_pipeline()