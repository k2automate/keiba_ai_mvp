import os
import shutil
import numpy as np
import pandas as pd

# パス設定
DETAIL_PATH = "data/predictions/race_detail_view.csv"
LIST_PATH   = "data/predictions/race_list_view.csv"
UI_DATA_DIR = "ui/public/data/"

# 指数の出力範囲
SCORE_MAX = 92.0
SCORE_MIN = 20.0

# 信頼度ランクの閾値（1位と2位の勝率の差：ポイント）
RANK_THRESHOLDS = {"SS": 0.20, "S": 0.12, "A": 0.07, "B": 0.03, "C": 0.00}
RANK_LABELS     = ["SS", "S", "A", "B", "C"]
RANK_MEANINGS   = {"SS": "鉄板", "S": "本命", "A": "有力", "B": "混戦", "C": "難解"}

def _race_key(df):
    for c in ["race_id", "レース番号", "race_no"]:
        if c in df.columns: return df[c].astype(str)
    return pd.Series(["__all__"] * len(df), index=df.index)

def recalc_ability_score(df):
    """
    【重要】勝率(win_prob)のみをベースに指数を計算する。
    これにより、勝率が高い馬が必ず高い指数を持つ（矛盾解消）。
    """
    df = df.copy()
    rk = _race_key(df)
    for rg, idx in df.groupby(rk).groups.items():
        # 勝率を対数スケールで正規化（実力差を視覚的に強調）
        wp = df.loc[idx, "win_prob"].clip(lower=1e-8)
        lw = np.log(wp)
        mn, mx = lw.min(), lw.max()
        # 0.0〜1.0に正規化
        norm = (lw - mn) / (mx - mn) if mx > mn else pd.Series(0.5, index=idx)
        # 20〜92の範囲にスケール
        df.loc[idx, "ability_score"] = (norm * (SCORE_MAX - SCORE_MIN) + SCORE_MIN).round(1)
    return df

def calc_confidence_rank(df):
    """
    1位と2位の勝率の「差（pp）」で信頼度を決定する。
    """
    df = df.copy()
    df["confidence_rank"] = "C"
    df["confidence_label"] = RANK_MEANINGS["C"]
    df["confidence_gap"] = 0.0
    rk = _race_key(df)
    for rg, idx in df.groupby(rk).groups.items():
        sw = df.loc[idx, "win_prob"].sort_values(ascending=False)
        # 1位と2位の勝率の差を計算（例：0.35 - 0.10 = 0.25）
        gap = float(sw.iloc[0] - sw.iloc[1]) if len(sw) > 1 else 0.0
        # 閾値に基づいてランク決定
        rank = next((l for l in RANK_LABELS if gap >= RANK_THRESHOLDS[l]), "C")
        df.loc[idx, "confidence_rank"] = rank
        df.loc[idx, "confidence_label"] = RANK_MEANINGS[rank]
        df.loc[idx, "confidence_gap"] = round(gap, 4)
    return df

def post_process():
    if not os.path.exists(DETAIL_PATH):
        print(f"[ERROR] {DETAIL_PATH} が見つかりません。"); return
    
    df = pd.read_csv(DETAIL_PATH, encoding="utf-8-sig")
    
    # 1. 指数の再計算
    df = recalc_ability_score(df)
    # 2. 信頼度の判定
    df = calc_confidence_rank(df)
    
    # 詳細ビューを保存
    df.to_csv(DETAIL_PATH, index=False, encoding="utf-8-sig")
    
    # リストビュー（レース一覧用）の作成
    rk = _race_key(df)
    rows = []
    for rg, idx in df.groupby(rk).groups.items():
        grp = df.loc[idx]
        top = grp.loc[grp["ability_score"].idxmax()]
        row = {"race_id": rg}
        for c in ["開催", "距離", "馬場状態", "race_no"]:
            if c in grp.columns: row[c] = grp[c].iloc[0]
        row.update({
            "top_horse": top.get("馬名", ""),
            "top_signal": top.get("signal", ""),
            "top_ability_score": top["ability_score"],
            "top_win_prob": round(float(top["win_prob"]), 4),
            "field_size": len(grp),
            "confidence_rank": grp["confidence_rank"].iloc[0],
            "confidence_label": grp["confidence_label"].iloc[0]
        })
        rows.append(row)
    pd.DataFrame(rows).to_csv(LIST_PATH, index=False, encoding="utf-8-sig")
    
    # UIフォルダへ転送
    os.makedirs(UI_DATA_DIR, exist_ok=True)
    for src in [DETAIL_PATH, LIST_PATH]:
        if os.path.exists(src): shutil.copy(src, os.path.join(UI_DATA_DIR, os.path.basename(src)))
    
    print("✅ スコア矛盾修正 & 信頼度ランク付与が完了しました")

if __name__ == "__main__":
    post_process()