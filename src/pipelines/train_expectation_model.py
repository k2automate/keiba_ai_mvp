import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.model_selection import train_test_split
import os
import joblib

def create_past_features(df):
    """
    CSV列名に対応した特徴量生成
    """
    num_cols = ['年齢', '斤量', '頭数', '馬番', '距離', '馬体重', '馬体重増減', 
                '前走人気', '前走着順', '前走着差タイム', '前走上り3F', '前PCI', '前走RPCI', '前4角']
    
    for col in num_cols:
        if col in df.columns:
             df[col] = pd.to_numeric(df[col].astype(str).str.replace(r'[^\d.-]', '', regex=True), errors='coerce')
    
    feature_df = pd.DataFrame(index=df.index)
    
    # 1. 基本スペック
    feature_df['age'] = df.get('年齢', 4.0).fillna(4.0)
    feature_df['weight_carried'] = df.get('斤量', 55.0).fillna(55.0)
    feature_df['gate_no'] = df.get('馬番', 0.0).fillna(0.0)
    feature_df['field_size'] = df.get('頭数', 16.0).fillna(16.0)
    feature_df['distance'] = df.get('距離', 1600.0).fillna(1600.0)
    feature_df['horse_weight'] = df.get('馬体重', 480.0).fillna(480.0)
    feature_df['weight_ratio'] = df.get('馬体重増減', 0.0) / (feature_df['horse_weight'] + 1)
    
    # 2. 前走の実力
    feature_df['prev_rank'] = df.get('前走着順', 9.0).fillna(9.0)
    feature_df['prev_margin'] = df.get('前走着差タイム', 1.0).fillna(1.0)
    feature_df['prev_pop'] = df.get('前走人気', 8.0).fillna(8.0)
    feature_df['hidden_strength'] = feature_df['prev_rank'] / (feature_df['prev_margin'] + 0.1)
    
    # 3. 前走の展開（ペース・上り・位置取り）
    feature_df['prev_spurt'] = df.get('前走上り3F', 35.0).fillna(35.0)
    feature_df['prev_pci'] = df.get('前PCI', 50.0).fillna(50.0)
    feature_df['prev_rpci'] = df.get('前走RPCI', 50.0).fillna(50.0)
    feature_df['prev_pci_diff'] = feature_df['prev_pci'] - feature_df['prev_rpci']
    feature_df['prev_corner_4'] = df.get('前4角', 8.0).fillna(8.0)
    feature_df['running_style'] = feature_df['prev_corner_4'] / (feature_df['field_size'] + 1)

    # 1着用の正解ラベルと、3着内用の正解ラベル
    df['着順'] = pd.to_numeric(df['着順'].astype(str).str.replace(r'[^\d.-]', '', regex=True), errors='coerce')
    feature_df['target_win'] = (df['着順'] == 1).astype(int)
    feature_df['target_top3'] = (df['着順'] <= 3).astype(int)
    
    return feature_df

def train_model():
    data_path = 'data/manual/race_history_detail.csv' 
    model_save_path = 'models/lgbm_expectation_model.pkl'

    print("データを読み込んでいます...")
    try:
        df_raw = pd.read_csv(data_path, encoding='utf-8-sig', low_memory=False)
    except UnicodeDecodeError:
        df_raw = pd.read_csv(data_path, encoding='Shift_JIS', low_memory=False)
        
    df_features = create_past_features(df_raw)

    cat_cols = ['開催', '性別', '馬場状態', '所属', '騎手', '調教師']
    mappings = {}
    for col in cat_cols:
        if col in df_raw.columns:
            mapping = {name: i for i, name in enumerate(df_raw[col].astype(str).unique())}
            df_features[f'cat_{col}'] = df_raw[col].astype(str).map(mapping).fillna(-1)
            mappings[col] = mapping
        else:
            df_features[f'cat_{col}'] = -1

    X = df_features.drop(columns=['target_win', 'target_top3'])
    use_features = X.columns.tolist()

    # 🌟 1着専用（攻撃型）: scale_pos_weightを高く設定
    params_win = {
        'objective': 'binary',
        'metric': 'binary_logloss',
        'learning_rate': 0.03,
        'num_leaves': 63,
        'feature_fraction': 0.8,
        'scale_pos_weight': 10.0, 
        'verbose': -1
    }

    print("【1/2】1着専用AIの学習中...")
    y_win = df_features['target_win']
    X_train_w, X_test_w, y_train_w, y_test_w = train_test_split(X, y_win, test_size=0.2, random_state=42)
    model_win = lgb.train(params_win, lgb.Dataset(X_train_w, label=y_train_w), num_boost_round=1000)

    # 3着内専用（守備型）
    params_top3 = {
        'objective': 'binary',
        'metric': 'binary_logloss',
        'learning_rate': 0.05,
        'num_leaves': 63,
        'feature_fraction': 0.8,
        'verbose': -1
    }

    print("【2/2】3着内専用AIの学習中...")
    y_top3 = df_features['target_top3']
    X_train_t, X_test_t, y_train_t, y_test_t = train_test_split(X, y_top3, test_size=0.2, random_state=42)
    model_top3 = lgb.train(params_top3, lgb.Dataset(X_train_t, label=y_train_t), num_boost_round=1000)

    os.makedirs('models', exist_ok=True)
    joblib.dump({'model_win': model_win, 'model_top3': model_top3, 'features': use_features, 'mappings': mappings}, model_save_path)
    print(f"モデル保存完了: {model_save_path}")

if __name__ == "__main__":
    train_model()