import pandas as pd
import numpy as np
import os
import joblib

def fetch_past_data_for_today(today_df, history_path):
    if not os.path.exists(history_path):
        return today_df

    try:
        hist_df = pd.read_csv(history_path, encoding='utf-8-sig', low_memory=False)
    except:
        hist_df = pd.read_csv(history_path, encoding='Shift_JIS', low_memory=False)

    if '日付(yyyy.mm.dd)' in hist_df.columns:
        hist_df = hist_df.sort_values('日付(yyyy.mm.dd)', ascending=False)

    if '馬名' not in hist_df.columns and 'horse_name' in hist_df.columns:
        hist_df = hist_df.rename(columns={'horse_name': '馬名'})

    latest_past_df = hist_df.groupby('馬名').first().reset_index()

    past_cols = [
        '馬名',
        '前走人気',
        '前走着順',
        '前走着差タイム',
        '前走上り3F',
        '前PCI',
        '前走RPCI',
        '前4角'
    ]

    cols_to_merge = [c for c in past_cols if c in latest_past_df.columns]

    if '馬名' not in today_df.columns and 'horse_name' in today_df.columns:
        today_df['馬名'] = today_df['horse_name']

    return pd.merge(today_df, latest_past_df[cols_to_merge], on='馬名', how='left')


def run_pipeline():
    input_path = "data/manual/race_day_input.csv"
    history_path = "data/manual/race_history_detail.csv"
    model_path = "models/lgbm_expectation_model.pkl"
    output_path = "data/predictions/race_detail_view.csv"

    if not os.path.exists(model_path):
        print("モデルファイルが見つかりません。")
        return

    saved_data = joblib.load(model_path)
    model_win = saved_data['model_win']
    model_top3 = saved_data['model_top3']
    required_features = saved_data['features']
    mappings = saved_data['mappings']

    try:
        df = pd.read_csv(input_path, encoding='Shift_JIS', low_memory=False)
    except:
        df = pd.read_csv(input_path, encoding='utf-8-sig', low_memory=False)

    df = fetch_past_data_for_today(df, history_path)

    feature_df = pd.DataFrame(index=df.index)

    def get_safe_num(col_jp, col_en, default_val):
        target = col_jp if col_jp in df.columns else (col_en if col_en in df.columns else None)

        if target:
            s = (
                df[target]
                .fillna(str(default_val))
                .astype(str)
                .str.replace(r'[^\d.-]', '', regex=True)
            )
            return pd.to_numeric(s, errors='coerce').fillna(default_val)

        return pd.Series(default_val, index=df.index)

    feature_df['age'] = get_safe_num('年齢', 'age', 4.0)
    feature_df['weight_carried'] = get_safe_num('斤量', None, 55.0)
    feature_df['gate_no'] = get_safe_num('馬番', 'horse_no', 0.0)
    feature_df['field_size'] = get_safe_num('頭数', None, 16.0)
    feature_df['distance'] = get_safe_num('距離', 'distance', 1600.0)
    feature_df['horse_weight'] = get_safe_num('馬体重', None, 480.0)
    feature_df['weight_ratio'] = get_safe_num('馬体重増減', None, 0.0) / (feature_df['horse_weight'] + 1)

    feature_df['prev_rank'] = get_safe_num('前走着順', None, 9.0)
    feature_df['prev_margin'] = get_safe_num('前走着差タイム', None, 1.0)
    feature_df['prev_pop'] = get_safe_num('前走人気', None, 8.0)

    feature_df['hidden_strength'] = feature_df['prev_rank'] / (feature_df['prev_margin'] + 0.1)

    feature_df['prev_spurt'] = get_safe_num('前走上り3F', None, 35.0)
    feature_df['prev_pci'] = get_safe_num('前PCI', None, 50.0)
    feature_df['prev_rpci'] = get_safe_num('前走RPCI', None, 50.0)
    feature_df['prev_pci_diff'] = feature_df['prev_pci'] - feature_df['prev_rpci']

    feature_df['prev_corner_4'] = get_safe_num('前4角', None, 8.0)
    feature_df['running_style'] = feature_df['prev_corner_4'] / (feature_df['field_size'] + 1)

    cat_keys = {
        '開催': 'venue',
        '性別': 'sex',
        '馬場状態': 'track_cond',
        '所属': 'affiliation',
        '騎手': 'jockey_name',
        '調教師': 'trainer'
    }

    for jp_key, en_key in cat_keys.items():
        col_name = jp_key if jp_key in df.columns else (en_key if en_key in df.columns else None)

        if col_name and jp_key in mappings:
            feature_df[f'cat_{jp_key}'] = (
                df[col_name]
                .astype(str)
                .map(mappings[jp_key])
                .fillna(-1)
            )
        else:
            feature_df[f'cat_{jp_key}'] = -1

    X = pd.DataFrame(index=df.index)

    for col in required_features:
        X[col] = feature_df[col] if col in feature_df.columns else 0

    df['raw_win_prob'] = model_win.predict(X)
    df['top3_prob'] = model_top3.predict(X)
    df['win_odds'] = get_safe_num('単勝オッズ', 'win_odds', 10.0)

    if 'race_id' not in df.columns:
        df['race_id'] = 'race_01'

    race_groups = df.groupby('race_id')

    df['win_prob'] = df['raw_win_prob'] / race_groups['raw_win_prob'].transform('sum')
    df['win_ev'] = df['win_prob'] * df['win_odds']

    df['ability_score'] = (df['win_prob'] * 200) + 20
    df['ability_score'] = df['ability_score'].clip(20, 98)

    def assign_signals(g):
        g = g.sort_values('win_prob', ascending=False).copy()
        g['rank_in_race'] = range(1, len(g) + 1)

        top1_p = g.iloc[0]['win_prob']
        top2_p = g.iloc[1]['win_prob'] if len(g) > 1 else 0

        if top1_p >= 0.25 and (top1_p - top2_p) >= 0.05:
            race_rank = " 【勝負S:鉄板】"
        elif top1_p >= 0.18:
            race_rank = " 【狙い目A:本命】"
        elif top1_p >= 0.12:
            race_rank = " 【波乱B:ヒモ荒れ】"
        else:
            race_rank = " 【見送りC:大混戦】"

        if 'レース名' in g.columns:
            g['レース名'] = g['レース名'].astype(str).str.replace(
                r' 【.*?】',
                '',
                regex=True
            ) + race_rank
        elif 'race_name' in g.columns:
            g['race_name'] = g['race_name'].astype(str).str.replace(
                r' 【.*?】',
                '',
                regex=True
            ) + race_rank

        signal_map = {
            1: "軸",
            2: "対抗",
            3: "穴",
            4: "連下",
            5: "連下"
        }

        g['signal'] = g['rank_in_race'].map(signal_map).fillna("様子見")

        # UI側がどの列名を見ても表示できるように保険で複数列を作成
        g['印'] = g['signal']
        g['mark'] = g['signal']
        g['recommendation'] = g['signal']

        return g

    df = df.groupby('race_id', group_keys=False).apply(assign_signals)

    output_df = df.rename(columns={
        '馬番': 'horse_no',
        '馬名': 'horse_name',
        '単勝オッズ': 'win_odds',
        '枠番': 'gate_no',
        '騎手': 'jockey_name',
        'レース名': 'race_name'
    })

    output_df = output_df.loc[:, ~output_df.columns.duplicated()]

    cols = [
        'race_id',
        'race_name',
        'horse_no',
        'gate_no',
        'horse_name',
        'jockey_name',
        'rank_in_race',
        'signal',
        '印',
        'mark',
        'recommendation',
        'ability_score',
        'win_prob',
        'top3_prob',
        'win_ev',
        'win_odds'
    ]

    output_df = output_df[[c for c in cols if c in output_df.columns]]

    os.makedirs("data/predictions", exist_ok=True)

    output_df.to_csv(output_path, index=False, encoding='utf-8-sig')

    if 'race_id' in df.columns:
        list_df = df.drop_duplicates(subset=['race_id']).rename(columns={'レース名': 'race_name'})
        list_df.to_csv(
            "data/predictions/race_list_view.csv",
            index=False,
            encoding='utf-8-sig'
        )

    output_df.to_csv("data/predictions/horse_predictions.csv", index=False, encoding='utf-8-sig')
    output_df.to_csv("data/predictions/summary_ability.csv", index=False, encoding='utf-8-sig')
    output_df.to_csv("data/predictions/summary_confidence.csv", index=False, encoding='utf-8-sig')
    output_df.to_csv("data/predictions/summary_signal.csv", index=False, encoding='utf-8-sig')

    print("予測完了：上位5頭に 軸・対抗・穴・連下・連下 を必ず付与しました。")


if __name__ == "__main__":
    run_pipeline()