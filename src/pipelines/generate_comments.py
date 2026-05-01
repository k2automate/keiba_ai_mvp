import json
import os
import shutil
import numpy as np
import pandas as pd

INPUT_PATH  = "data/predictions/race_detail_view.csv"
OUTPUT_PATH = "data/predictions/horse_comments.csv"
UI_DATA_DIR = "ui/public/data/"

# ============================================================
# ユーティリティ
# ============================================================
def sf(v, default=0.0):
    if pd.isna(v) or str(v).strip() == "":
        return default
    try:
        r = float(str(v).replace(",", ""))
        return r if not np.isnan(r) else default
    except Exception:
        return default

def _race_key(df):
    for c in ["race_id", "レース番号", "レース名"]:
        if c in df.columns:
            return df[c].astype(str)
    return pd.Series(["**all**"] * len(df), index=df.index)

# ============================================================
# タグ生成ロジック（確実にあるデータのみを使用）
# ============================================================
def build_tags(row: dict, rank: int, total_horses: int) -> list[dict]:
    tags = []
    
    win_prob  = sf(row.get("win_prob", row.get("勝率")), 0)
    top3_prob = sf(row.get("top3_prob", row.get("複勝率")), 0)
    odds      = sf(row.get("win_odds", row.get("単勝オッズ")), 0)
    gate      = int(sf(row.get("枠番", row.get("gate_no")), 0))
    signal    = str(row.get("signal", "様子見"))

    if rank == 1: tags.append({"label": "AI本命◎", "type": "good"})
    elif rank == 2: tags.append({"label": "対抗○", "type": "good"})
    elif signal == "穴": tags.append({"label": "AI穴▲", "type": "good"})

    if top3_prob > 50: tags.append({"label": "複勝圏鉄板", "type": "good"})
    elif top3_prob > 35: tags.append({"label": "馬券内有望", "type": "good"})

    if odds > 0:
        expected_value = (win_prob / 100) * odds
        if expected_value >= 1.5: tags.append({"label": "超お宝馬", "type": "good"})
        elif expected_value >= 1.2: tags.append({"label": "妙味あり", "type": "good"})
        elif odds < 3.0 and win_prob < 20.0: tags.append({"label": "過剰人気", "type": "bad"})
        elif odds >= 20.0 and top3_prob >= 15.0: tags.append({"label": "大穴警戒", "type": "good"})

    if total_horses >= 12 and gate > 0:
        if gate <= 2: tags.append({"label": "好枠(内)", "type": "neutral"})
        elif gate >= 7: tags.append({"label": "外枠", "type": "neutral"})

    return tags[:5]

# ============================================================
# コメント本文生成ロジック（指数と確率の深掘り分析）
# ============================================================
def build_comment(row: dict, race_df: pd.DataFrame, rank: int) -> str:
    lines = []
    
    total       = len(race_df)
    ability     = sf(row.get("ability_score"), 20.0)
    win_prob    = sf(row.get("win_prob", row.get("勝率")), 0)
    top3_prob   = sf(row.get("top3_prob", row.get("複勝率")), 0)
    odds        = sf(row.get("win_odds", row.get("単勝オッズ")), 0)
    gate        = int(sf(row.get("枠番", row.get("gate_no")), 0))
    jockey      = str(row.get("騎手", row.get("jockey_name", "")))
    signal      = str(row.get("signal", "様子見"))
    
    # トップ馬のスコアを取得
    top_ability = sf(race_df.iloc[0].get("ability_score"), 20.0)
    diff_from_top = top_ability - ability

    # ① 基本評価と能力スコアの解釈
    lines.append(f"{total}頭立て中、AIによる総合指数は{rank}位（スコア: {ability:.1f}）。")
    
    if rank == 1:
        lines.append("本モデルが算出した各種ファクターの中で最も高い評価を獲得しており、今回のレースにおける絶対的な中心候補だ。")
    elif rank == 2:
        lines.append(f"指数トップの馬とはわずか{diff_from_top:.1f}ポイント差に迫っており、展開の綾や枠順の利で十分に逆転可能な圏内にいる。")
    elif rank <= 4:
        lines.append("上位馬と遜色ない能力スコアをマークしており、連軸やフォーメーションの2列目として馬券内に食い込むポテンシャルは極めて高い。")
    else:
        lines.append(f"トップとの指数差が{diff_from_top:.1f}とやや開いており、能力だけでねじ伏せるには厳しい。上位進出には展開の助けや極端な馬場バイアスが必要になるだろう。")

    # ② 勝率・複勝率（モデルの自信度）の解釈
    if top3_prob > 50:
        lines.append(f"特筆すべきは{top3_prob:.1f}%という圧倒的な複勝圏内率。過去の膨大なデータから見ても、この条件で馬券から外れる確率は非常に低いとAIは判断している。")
    elif top3_prob > 30 and win_prob < 10:
        lines.append(f"勝率({win_prob:.1f}%)こそ抜けていないものの、複勝率({top3_prob:.1f}%)が高く算出されている点に注目。勝ち切れないが2〜3着に手堅く飛び込んでくる、いわゆる「紐荒れ」の使者になりやすいタイプだ。")
    elif win_prob > 20:
        lines.append(f"勝率{win_prob:.1f}%という数字は、モデルがこの馬の「勝ち切り」を強く想定している証拠。アタマ固定の馬券で強気に勝負したい場面だ。")

    # ③ 期待値（オッズとのギャップ）の解釈
    if odds > 0:
        expected_value = (win_prob / 100) * odds
        if expected_value >= 1.5:
            lines.append(f"想定オッズ{odds:.1f}倍に対してモデル勝率が{win_prob:.1f}%もあり、馬券的な「妙味（期待値）」はズバ抜けて高い。配当を跳ね上げるキーホースとして積極的に狙っていきたい一頭。")
        elif expected_value >= 1.0:
            lines.append(f"現在のオッズ（{odds:.1f}倍）とAI勝率のバランスは適正であり、購入して損のない適正な期待値を保っている。")
        elif odds < 3.0 and win_prob < 20:
            lines.append(f"単勝{odds:.1f}倍と世間の人気は一本被りしているが、AIの勝率評価は{win_prob:.1f}%と辛口。期待値の観点からは過剰人気気味であり、配当妙味を考えると少し疑ってかかりたい存在だ。")
        elif odds > 30 and top3_prob > 15:
            lines.append(f"オッズ{odds:.1f}倍と全くのノーマーク状態だが、3着内に突っ込んでくる確率は{top3_prob:.1f}%と意外なほど高い。大穴のヒモとして押さえておけば、特大万馬券の使者になるかもしれない。")

    # ④ 枠番と騎手の定性評価
    if gate > 0 and jockey and jockey != "nan":
        if gate <= 2:
            lines.append(f"内枠（{gate}枠）を引き当てたことでロスなく立ち回れるのは大きなプラス材料。鞍上の{jockey}騎手がいかに内を捌いて導くかが勝負の分かれ目になりそうだ。")
        elif gate >= 7 and total >= 12:
            lines.append(f"外枠（{gate}枠）に入ったことで距離ロスや展開の不利を受けるリスクがある。{jockey}騎手の手腕によるポジション取りがカギを握る。")
        else:
            lines.append(f"鞍上は{jockey}騎手が務める。極端な不利のない枠番から、馬の持ち味をどう引き出すか注目したい。")

    return "".join(lines)

# ============================================================
# メイン
# ============================================================
def generate_comments():
    if not os.path.exists(INPUT_PATH):
        print(f"[ERROR] {INPUT_PATH} が見つかりません。推論を先に実行してください。")
        return

    df = pd.read_csv(INPUT_PATH, encoding="utf-8-sig")
    rk = _race_key(df)
    df["_rg"] = rk

    rows = []
    for rg, grp_idx in df.groupby("_rg").groups.items():
        grp = df.loc[grp_idx].sort_values("ability_score", ascending=False).reset_index(drop=True)

        for rank_0, row in grp.iterrows():
            rank    = rank_0 + 1
            row_d   = row.to_dict()

            tags    = build_tags(row_d, rank, len(grp))
            comment = build_comment(row_d, grp, rank)

            rows.append({
                "race_id":  rg,
                "馬名":     row_d.get("馬名", row_d.get("horse_name", "")),
                "馬番":     row_d.get("馬番", row_d.get("horse_no", "")),
                "tags":     json.dumps(tags, ensure_ascii=False),
                "comment":  comment,
            })

    out_df = pd.DataFrame(rows)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    out_df.to_csv(OUTPUT_PATH, index=False, encoding="utf-8-sig")

    os.makedirs(UI_DATA_DIR, exist_ok=True)
    shutil.copy(OUTPUT_PATH, os.path.join(UI_DATA_DIR, "horse_comments.csv"))

    print(f"✅ コメント生成完了: {len(rows)}頭分")

if __name__ == "__main__":
    generate_comments()