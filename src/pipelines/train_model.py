import os
import warnings
import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
import time

warnings.filterwarnings("ignore")

HISTORY_PATH = "data/manual/race_history_detail.csv"
MODEL_OUTPUT  = "models/lgbm_expectation_model.pkl"

N_PAST    = 5
DECAY     = 0.7
MIN_RIDES = 30

FEATURE_COLS = [
    "age", "weight_carried", "gate_no", "horse_no",
    "field_size", "distance", "horse_weight", "weight_ratio", "weight_change",
    "log_odds", "market_prob", "odds_rank", "is_favorite", "is_longshot",
    "jockey_win_rate", "jockey_top3_rate",
    "trainer_win_rate", "trainer_top3_rate",
    "multi_avg_rank", "multi_std_rank", "multi_best_rank",
    "multi_win_rate", "multi_top3_rate",
    "multi_avg_spurt", "multi_best_spurt",
    "multi_avg_margin", "multi_avg_pci", "multi_avg_rpci",
    "multi_avg_pop", "multi_pop_rank_diff",
    "course_top3_rate", "course_n_races",
    "rest_days",
    "prev_rank", "prev_margin", "prev_pop", "prev_spurt",
    "prev_pci", "prev_rpci", "prev_pci_diff", "prev_corner_4",
    "hidden_strength", "running_style",
    "cat_開催", "cat_性別", "cat_馬場状態", "cat_所属", "cat_騎手", "cat_調教師",
]

CAT_COLS = ["cat_開催", "cat_性別", "cat_馬場状態", "cat_所属", "cat_騎手", "cat_調教師"]

# 🌟 推論側と完全に一致させた強化版マッピング（英語列名にも対応）
COLUMN_MAP = {
    "着順":       ["着順", "前走着順", "rank"],
    "人気":       ["人気", "前走人気", "pop"],
    "着差タイム": ["着差タイム", "前走着差タイム", "着差", "margin"],
    "上り3F":     ["上り3F", "前走上り3F", "上がり3F", "spurt"],
    "PCI":        ["PCI", "前PCI"],
    "RPCI":       ["RPCI", "前走RPCI"],
    "4角":        ["4角", "前4角", "4コーナー", "corner_4"],
    "距離":       ["距離", "distance"],
    "開催":       ["開催", "競馬場", "venue"],
    "馬場状態":   ["馬場状態", "馬場", "track_cond"],
    "単勝オッズ": ["単勝オッズ", "オッズ", "単勝", "win_odds", "odds"],
    "騎手":       ["騎手", "騎手名", "jockey", "jockey_name"],
    "調教師":     ["調教師", "調教師名", "trainer"],
    "性別":       ["性別", "sex"],
    "所属":       ["所属", "厩舎所属", "affiliation"],
    "馬体重":     ["馬体重", "horse_weight"],
    "馬体重増減": ["馬体重増減", "体重増減", "weight_change"],
    "斤量":       ["斤量", "weight_carried"],
    "年齢":       ["年齢", "馬齢", "age"],
    "頭数":       ["頭数", "出走頭数", "field_size"],
    "枠番":       ["枠番", "gate_no"],
    "馬番":       ["馬番", "馬号", "horse_no"],
    "レース番号": ["レース番号", "R", "race_number", "race_id", "race_no"],
    "日付(yyyy.mm.dd)": ["日付(yyyy.mm.dd)", "日付", "date", "race_date"],
    "馬名":       ["馬名", "horse_name"],
}

# 🌟 学習データは安全に上書き（rename）してOK
def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename = {}
    for unified, candidates in COLUMN_MAP.items():
        if unified not in df.columns:
            for cand in candidates:
                if cand in df.columns and cand != unified:
                    rename[cand] = unified; break
    return df.rename(columns=rename)

def safe_num(series: pd.Series, default) -> pd.Series:
    return pd.to_numeric(series.fillna(str(default)).astype(str).str.replace(r"[^\d.-]", "", regex=True), errors="coerce").fillna(default)

def scalar_safe(val, default: float) -> float:
    try: return float(str(val).replace(",", ""))
    except: return default

def _weights(n: int) -> np.ndarray:
    w = np.array([DECAY ** i for i in range(n)], dtype=float)
    return w / w.sum()

def build_multi_race_feats(past: pd.DataFrame) -> dict:
    n = len(past)
    _default = {"multi_avg_rank": 9.0, "multi_std_rank": 3.0, "multi_best_rank": 9.0, "multi_win_rate": 0.0, "multi_top3_rate": 0.0, "multi_avg_spurt": 36.0, "multi_best_spurt": 36.0, "multi_avg_margin": 1.0, "multi_avg_pci": 50.0, "multi_avg_rpci": 50.0, "multi_avg_pop": 8.0, "multi_pop_rank_diff": 0.0}
    if n == 0: return _default
    w = _weights(n)
    def wavg(col: str, default: float) -> float:
        if col not in past.columns: return default
        return float(np.dot(safe_num(past[col], default).values, w))
    def wstd(col: str, default: float = 0.0) -> float:
        if col not in past.columns or n < 2: return default
        vals = safe_num(past[col], 0).values
        mu = np.dot(vals, w)
        return float(np.sqrt(np.dot(w, (vals - mu) ** 2)))
    ranks = safe_num(past["着順"], 9.0) if "着順" in past.columns else pd.Series([9.0]*n)
    return {"multi_avg_rank": wavg("着順", 9.0), "multi_std_rank": wstd("着順", 3.0), "multi_best_rank": float(ranks.min()), "multi_win_rate": float((ranks == 1).mean()), "multi_top3_rate": float((ranks <= 3).mean()), "multi_avg_spurt": wavg("上り3F", 36.0), "multi_best_spurt": float(safe_num(past.get("上り3F", pd.Series([36]*n)), 36).min()), "multi_avg_margin": wavg("着差タイム", 1.0), "multi_avg_pci": wavg("PCI", 50.0), "multi_avg_rpci": wavg("RPCI", 50.0), "multi_avg_pop": wavg("人気", 8.0), "multi_pop_rank_diff": wavg("人気", 8.0) - wavg("着順", 9.0)}

def build_course_feats(past: pd.DataFrame, venue: str, distance: float) -> dict:
    _default = {"course_top3_rate": 0.3, "course_n_races": 0}
    if len(past) == 0: return _default
    mask = pd.Series([True] * len(past), index=past.index)
    if "開催" in past.columns: mask &= past["開催"].astype(str).str.contains(str(venue), na=False)
    if "距離" in past.columns: mask &= (safe_num(past["距離"], -9999) - distance).abs() <= 200
    h = past[mask]
    n = len(h)
    if n == 0: return _default
    ranks = safe_num(h["着順"], 9.0) if "着順" in h.columns else pd.Series([9.0]*n)
    return {"course_top3_rate": float((ranks <= 3).mean()), "course_n_races": n}

def calc_rest_days(past: pd.DataFrame, current_date_str: str) -> float:
    if len(past) == 0 or "日付(yyyy.mm.dd)" not in past.columns: return 30.0
    try:
        last = pd.to_datetime(past["日付(yyyy.mm.dd)"].dropna().sort_values(ascending=False).iloc[0], format="%Y.%m.%d")
        curr = pd.to_datetime(str(current_date_str), format="%Y.%m.%d")
        return float((curr - last).days)
    except: return 30.0

def calc_agent_stats(df: pd.DataFrame, col: str) -> pd.DataFrame:
    if col not in df.columns or "着順" not in df.columns: return pd.DataFrame(columns=[col, f"{col}_win_rate", f"{col}_top3_rate"])
    tmp = df[[col, "着順"]].copy()
    tmp["_rank"] = safe_num(tmp["着順"], 9)
    tmp["_win"], tmp["_top3"] = (tmp["_rank"] == 1).astype(int), (tmp["_rank"] <= 3).astype(int)
    agg = tmp.groupby(col).agg(rides=("_win", "count"), wins=("_win", "sum"), top3=("_top3", "sum")).reset_index()
    gwr, gt3r = agg["wins"].sum() / agg["rides"].sum(), agg["top3"].sum() / agg["rides"].sum()
    agg[f"{col}_win_rate"] = (agg["wins"] + MIN_RIDES * gwr) / (agg["rides"] + MIN_RIDES)
    agg[f"{col}_top3_rate"] = (agg["top3"] + MIN_RIDES * gt3r) / (agg["rides"] + MIN_RIDES)
    return agg[[col, f"{col}_win_rate", f"{col}_top3_rate"]]

def build_category_mappings(df: pd.DataFrame) -> dict:
    cat_cols = ["開催", "性別", "馬場状態", "所属", "騎手", "調教師"]
    return {col: {v: i for i, v in enumerate(sorted(df[col].dropna().astype(str).unique()))} for col in cat_cols if col in df.columns}

def build_training_matrix(df: pd.DataFrame, jockey_stats: pd.DataFrame, trainer_stats: pd.DataFrame, mappings: dict) -> pd.DataFrame:
    records, horse_history, total_rows = [], {}, len(df)
    jk_dict = jockey_stats.set_index("騎手")[["騎手_win_rate", "騎手_top3_rate"]].to_dict("index") if not jockey_stats.empty else {}
    tr_dict = trainer_stats.set_index("調教師")[["調教師_win_rate", "調教師_top3_rate"]].to_dict("index") if not trainer_stats.empty else {}
    jk_def = {"騎手_win_rate": jockey_stats["騎手_win_rate"].mean(), "騎手_top3_rate": jockey_stats["騎手_top3_rate"].mean()} if not jockey_stats.empty else {"騎手_win_rate": 0.1, "騎手_top3_rate": 0.3}
    tr_def = {"調教師_win_rate": trainer_stats["調教師_win_rate"].mean(), "調教師_top3_rate": trainer_stats["調教師_top3_rate"].mean()} if not trainer_stats.empty else {"調教師_win_rate": 0.08, "調教師_top3_rate": 0.25}
    
    start_time = time.time()
    print(f"\n  ... 全 {total_rows} 行の特徴量生成を開始します")
    
    for i, (idx, row) in enumerate(df.iterrows()):
        if (i+1)%1000 == 0: print(f"      進捗: {i+1} / {total_rows} ({((i+1)/total_rows)*100:.1f}%) - {time.time()-start_time:.1f}s")
        h, d_str, v = str(row.get("馬名", "")), str(row.get("日付(yyyy.mm.dd)", "")), str(row.get("開催", ""))
        dist = scalar_safe(row.get("距離", 1600), 1600.0)
        past_l = horse_history.get(h, [])
        past = pd.DataFrame(past_l[-N_PAST:]).iloc[::-1].reset_index(drop=True) if past_l else pd.DataFrame()
        feat = {"age": scalar_safe(row.get("年齢", 4), 4.0), "weight_carried": scalar_safe(row.get("斤量", 55), 55.0), "gate_no": scalar_safe(row.get("枠番", row.get("馬番", 0)), 0.0), "horse_no": scalar_safe(row.get("馬番", 0), 0.0), "field_size": scalar_safe(row.get("頭数", 16), 16.0), "distance": dist, "horse_weight": scalar_safe(row.get("馬体重", 480), 480.0), "weight_change": scalar_safe(row.get("馬体重増減", 0), 0.0)}
        feat["weight_ratio"] = feat["weight_change"] / (feat["horse_weight"] + 1)
        o_raw = max(scalar_safe(row.get("単勝オッズ", 10), 10.0), 1.1)
        feat["log_odds"], feat["is_longshot"], feat["market_prob"], feat["odds_rank"], feat["is_favorite"] = float(np.log(o_raw)), int(o_raw >= 20.0), 0.0, 0.0, 0
        jk_i, tr_i = jk_dict.get(str(row.get("騎手", "")), jk_def), tr_dict.get(str(row.get("調教師", "")), tr_def)
        feat["jockey_win_rate"], feat["jockey_top3_rate"], feat["trainer_win_rate"], feat["trainer_top3_rate"] = jk_i["騎手_win_rate"], jk_i["騎手_top3_rate"], tr_i["調教師_win_rate"], tr_i["調教師_top3_rate"]
        feat.update(build_multi_race_feats(past)); feat.update(build_course_feats(past, v, dist)); feat["rest_days"] = calc_rest_days(past, d_str)
        if not past.empty:
            pr = past.iloc[0]
            feat["prev_rank"], feat["prev_margin"], feat["prev_pop"], feat["prev_spurt"] = scalar_safe(pr.get("着順", 9), 9.0), scalar_safe(pr.get("着差タイム", 1), 1.0), scalar_safe(pr.get("人気", 8), 8.0), scalar_safe(pr.get("上り3F", 36), 36.0)
            feat["prev_pci"], feat["prev_rpci"], feat["prev_corner_4"] = scalar_safe(pr.get("PCI", 50), 50.0), scalar_safe(pr.get("RPCI", 50), 50.0), scalar_safe(pr.get("4角", 8), 8.0)
        else: feat.update({"prev_rank": 9.0, "prev_margin": 1.0, "prev_pop": 8.0, "prev_spurt": 36.0, "prev_pci": 50.0, "prev_rpci": 50.0, "prev_corner_4": 8.0})
        feat["prev_pci_diff"] = feat["prev_pci"] - feat["prev_rpci"]
        m_s = feat["prev_margin"] + 0.1
        feat["hidden_strength"] = feat["prev_rank"] / m_s if m_s != 0 else 0.0
        feat["running_style"] = feat["prev_corner_4"] / (feat["field_size"] + 1)
        for c in ["開催", "性別", "馬場状態", "所属", "騎手", "調教師"]: feat[f"cat_{c}"] = mappings.get(c, {}).get(str(row.get(c, "")), -1)
        feat["_idx"] = idx; records.append(feat); horse_history.setdefault(h, []).append(dict(row))
    
    res = pd.DataFrame(records).set_index("_idx")
    res["_rg"] = df["レース番号"].astype(str) if "レース番号" in df.columns else pd.Series(range(total_rows)).astype(str)
    
    for rg, grp in res.groupby("_rg"):
        o_e = np.exp(grp["log_odds"])
        mp_r = 1.0 / o_e
        res.loc[grp.index, "market_prob"] = (mp_r / mp_r.sum()).values
        res.loc[grp.index, "odds_rank"] = o_e.rank(method="min").values
        res.at[o_e.idxmin(), "is_favorite"] = 1
    return res.drop(columns=["_rg"])

def train_lgbm(X, y, cat_cols, race_groups, label=""):
    params = {"objective": "binary", "metric": "auc", "learning_rate": 0.05, "num_leaves": 63, "min_child_samples": 20, "feature_fraction": 0.8, "bagging_fraction": 0.8, "bagging_freq": 1, "verbose": -1}
    gkf = GroupKFold(n_splits=5)
    cv_aucs, best_iters = [], []
    print(f"  [{label}] モデルのトレーニングを開始します...")
    for fold, (tr_idx, va_idx) in enumerate(gkf.split(X, y, groups=race_groups)):
        ds_tr = lgb.Dataset(X.iloc[tr_idx], label=y.iloc[tr_idx], categorical_feature=cat_cols, free_raw_data=False)
        ds_va = lgb.Dataset(X.iloc[va_idx], label=y.iloc[va_idx], reference=ds_tr, categorical_feature=cat_cols)
        model = lgb.train(params, ds_tr, num_boost_round=2000, valid_sets=[ds_va], callbacks=[lgb.early_stopping(50, verbose=False)])
        auc = roc_auc_score(y.iloc[va_idx], model.predict(X.iloc[va_idx]))
        cv_aucs.append(auc)
        best_iters.append(model.best_iteration)
        print(f"      Fold {fold+1} 完了: AUC={auc:.4f} (ベスト学習回数: {model.best_iteration})")
    
    avg_iter = max(int(np.mean(best_iters)), 10)
    print(f"  [{label}] CV AUC平均: {np.mean(cv_aucs):.4f} → 全データで再学習 ({avg_iter}回)")
    
    # 🌟 categorical_featureエラーは修正済みです
    return lgb.train(params, lgb.Dataset(X, label=y, categorical_feature=cat_cols), num_boost_round=avg_iter)

def main():
    print("="*60 + "\n【Step 1】データ読み込み")
    df = None
    for enc in ["utf-8-sig", "Shift_JIS"]:
        try: df = pd.read_csv(HISTORY_PATH, encoding=enc); break
        except: pass
    
    if df is None:
        raise FileNotFoundError(f"ファイルを読み込めません: {HISTORY_PATH}")

    df = normalize_columns(df)
    if "日付(yyyy.mm.dd)" in df.columns:
        df["_dt"] = pd.to_datetime(df["日付(yyyy.mm.dd)"], format="%Y.%m.%d", errors="coerce")
        df = df.sort_values("_dt").reset_index(drop=True).drop(columns=["_dt"])
    
    y_rank = safe_num(df["着順"], 9)
    y_win, y_top3 = (y_rank == 1).astype(int), (y_rank <= 3).astype(int)
    
    print("\n【Step 2】特徴量行列の構築")
    mappings = build_category_mappings(df)
    j_stats, t_stats = calc_agent_stats(df, "騎手"), calc_agent_stats(df, "調教師")
    feat_df = build_training_matrix(df, j_stats, t_stats, mappings)
    X = feat_df.reindex(columns=FEATURE_COLS, fill_value=0)
    rg = df["レース番号"].astype(str) if "レース番号" in df.columns else pd.Series(range(len(df))).astype(str)
    
    print("\n【Step 3】勝率モデルの学習")
    m_win = train_lgbm(X, y_win, CAT_COLS, rg, "WIN")
    
    print("\n【Step 4】複勝率モデルの学習")
    m_top3 = train_lgbm(X, y_top3, CAT_COLS, rg, "TOP3")
    
    os.makedirs(os.path.dirname(MODEL_OUTPUT), exist_ok=True)
    joblib.dump({"model_win": m_win, "model_top3": m_top3, "features": FEATURE_COLS, "mappings": mappings, "jockey_stats": j_stats, "trainer_stats": t_stats}, MODEL_OUTPUT)
    print("=" * 60)
    print(f"✅ 最強AIモデルの保存が完了しました: {MODEL_OUTPUT}")
    print("=" * 60)

if __name__ == "__main__": 
    main()