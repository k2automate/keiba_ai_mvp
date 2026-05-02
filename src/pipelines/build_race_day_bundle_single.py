import os
import shutil
import warnings
import joblib
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

INPUT_PATH     = "data/manual/race_day_input.csv"
HISTORY_PATH   = "data/manual/race_history_detail.csv"
MODEL_PATH     = "models/lgbm_expectation_model.pkl"
OUT_DETAIL     = "data/predictions/race_detail_view.csv"
OUT_LIST       = "data/predictions/race_list_view.csv"

N_PAST = 5
DECAY  = 0.7

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
    "レース番号": ["レース番号", "R", "race_number", "race_no"],
    "日付(yyyy.mm.dd)": ["日付(yyyy.mm.dd)", "日付", "date", "race_date"],
    "馬名":       ["馬名", "horse_name"],
}

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df_out = df.copy()
    for unified, candidates in COLUMN_MAP.items():
        if unified not in df_out.columns:
            for cand in candidates:
                if cand in df_out.columns:
                    df_out[unified] = df_out[cand]
                    break
    return df_out

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
    spurt = safe_num(past["上り3F"], 36.0) if "上り3F" in past.columns else pd.Series([36.0]*n)
    return {"multi_avg_rank": wavg("着順", 9.0), "multi_std_rank": wstd("着順", 3.0), "multi_best_rank": float(ranks.min()), "multi_win_rate": float((ranks == 1).mean()), "multi_top3_rate": float((ranks <= 3).mean()), "multi_avg_spurt": wavg("上り3F", 36.0), "multi_best_spurt": float(spurt.min()), "multi_avg_margin": wavg("着差タイム", 1.0), "multi_avg_pci": wavg("PCI", 50.0), "multi_avg_rpci": wavg("RPCI", 50.0), "multi_avg_pop": wavg("人気", 8.0), "multi_pop_rank_diff": wavg("人気", 8.0) - wavg("着順", 9.0)}

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

def calc_rest_days(past: pd.DataFrame, today_str: str) -> float:
    if len(past) == 0 or "日付(yyyy.mm.dd)" not in past.columns: return 30.0
    try:
        last = pd.to_datetime(past["日付(yyyy.mm.dd)"].dropna().sort_values(ascending=False).iloc[0], format="%Y.%m.%d")
        return float((pd.to_datetime(today_str, format="%Y.%m.%d") - last).days)
    except: return 30.0

def read_csv_safe(path: str) -> pd.DataFrame | None:
    for enc in ["Shift_JIS", "utf-8-sig", "utf-8"]:
        try: return pd.read_csv(path, encoding=enc, low_memory=False)
        except: continue
    return None

def normalize_top3_prob(df: pd.DataFrame, race_key: pd.Series) -> pd.DataFrame:
    df = df.copy()
    field_size = pd.to_numeric(df.get("頭数", pd.Series([16]*len(df), index=df.index)), errors="coerce").fillna(16).astype(int)
    for rg, grp_idx in df.groupby(race_key).groups.items():
        grp = df.loc[grp_idx]
        n_horses = len(grp)
        n_places = min(3, int(field_size.loc[grp_idx].iloc[0]))
        raw_sum = grp["top3_prob"].sum()
        if raw_sum <= 0:
            df.loc[grp_idx, "top3_prob"] = n_places / n_horses
        else:
            df.loc[grp_idx, "top3_prob"] = grp["top3_prob"] * (n_places / raw_sum)
        df.loc[grp_idx, "top3_prob"] = df.loc[grp_idx, "top3_prob"].clip(0.0, 1.0)
    return df

# 🌟修正2：印は完全に「確率順」で打ち、ペナルティ馬は最高で△（かつ最大3つまで）にする
def assign_signals_improved(df: pd.DataFrame, race_key: pd.Series) -> pd.DataFrame:
    df = df.copy()
    df["signal"] = "様子見"
    df["印"] = "×"
    df["mark"] = "cancel"
    df["recommendation"] = "様子見"

    for rg, grp_idx in df.groupby(race_key).groups.items():
        grp = df.loc[grp_idx]
        if len(grp) == 0: continue

        # 完全な確率順（3着内率の高さで並べ、同点なら勝率で並べる）
        sorted_idx = grp.sort_values(by=["top3_prob", "win_prob"], ascending=[False, False]).index
        
        # 使える印の在庫（合計6個）
        upper_marks = [
            ("軸", "◎", "honmei", "最有力"),
            ("対抗", "○", "taikou", "対抗"),
            ("単穴", "▲", "ana", "単穴")
        ]
        renka_marks = [
            ("連下", "△", "renka", "連下"),
            ("連下", "△", "renka", "連下"),
            ("連下", "△", "renka", "連下")
        ]
        
        for idx in sorted_idx:
            row = df.loc[idx]
            is_penalized = (row.get("is_new", 0) == 1) or (row.get("is_first_dirt", 0) == 1) or (row.get("is_first_turf", 0) == 1)
            
            if is_penalized:
                # ペナルティ馬は△の在庫からしか印をもらえない
                if len(renka_marks) > 0:
                    df.loc[idx, ["signal","印","mark","recommendation"]] = renka_marks.pop(0)
            else:
                # 通常の馬は上の印から順にもらっていく
                if len(upper_marks) > 0:
                    df.loc[idx, ["signal","印","mark","recommendation"]] = upper_marks.pop(0)
                elif len(renka_marks) > 0:
                    df.loc[idx, ["signal","印","mark","recommendation"]] = renka_marks.pop(0)
            
    return df

def recalc_ability_score(df: pd.DataFrame, race_key: pd.Series) -> pd.DataFrame:
    df = df.copy()
    SCORE_MAX = 92.0
    SCORE_MIN = 20.0

    for rg, grp_idx in df.groupby(race_key).groups.items():
        grp = df.loc[grp_idx]
        n = len(grp)
        if n == 0: continue

        wp_raw = grp["raw_win_prob"].clip(lower=1e-6)
        odds = safe_num(grp["win_odds"], 10.0).clip(lower=1.1)
        mkt = (1.0 / odds) / (1.0 / odds).sum()

        alpha = (wp_raw / mkt).clip(lower=0.1, upper=10.0)
        capped_odds = odds.clip(upper=10.0)

        raw_score = wp_raw * capped_odds * np.sqrt(alpha)
        log_raw = np.log1p(raw_score)

        s_min, s_max = log_raw.min(), log_raw.max()
        if s_max > s_min + 1e-6:
            normalized = (log_raw - s_min) / (s_max - s_min)
        else:
            normalized = pd.Series([0.5] * n, index=grp_idx)

        ability = normalized * (SCORE_MAX - SCORE_MIN) + SCORE_MIN
        
        is_local = grp.get("所属", pd.Series([""]*n, index=grp.index)).astype(str).str.contains(r"地|地方") | \
                   grp.get("馬名", pd.Series([""]*n, index=grp.index)).astype(str).str.contains(r"\(地\)|（地）|\[地\]")
        if is_local.any():
            ability[is_local] = ability[is_local] * 0.7 
            
        df.loc[grp_idx, "ability_score"] = ability.round(1)

    return df

def calc_confidence_rank(df: pd.DataFrame, race_key: pd.Series) -> pd.DataFrame:
    RANK_THRESHOLDS = {"SS": 0.40, "S": 0.25, "A": 0.15, "B": 0.07, "C": 0.00}
    RANK_LABELS   = ["SS", "S", "A", "B", "C"]
    RANK_MEANINGS = {"SS": "鉄板", "S": "本命", "A": "有力", "B": "混戦", "C": "難解"}
    df = df.copy()
    df["confidence_rank"]  = "C"
    df["confidence_label"] = "難解"

    for rg, grp_idx in df.groupby(race_key).groups.items():
        grp = df.loc[grp_idx]
        scores = pd.to_numeric(grp["ability_score"], errors="coerce").fillna(20.0).sort_values(ascending=False)
        if len(scores) < 2: rank = "C"
        else:
            s1, s2 = scores.iloc[0], scores.iloc[1]
            gap_ratio = float((s1 - s2) / (s1 + 1e-6))
            rank = "C"
            for label in RANK_LABELS:
                if gap_ratio >= RANK_THRESHOLDS[label]:
                    rank = label
                    break
        df.loc[grp_idx, "confidence_rank"]  = rank
        df.loc[grp_idx, "confidence_label"] = RANK_MEANINGS[rank]
    return df

def run_pipeline():
    if not os.path.exists(MODEL_PATH): return
    saved = joblib.load(MODEL_PATH)
    model_win, model_top3 = saved["model_win"], saved["model_top3"]
    required_feats, mappings = saved["features"], saved["mappings"]
    jockey_stats, trainer_stats = saved.get("jockey_stats", pd.DataFrame()), saved.get("trainer_stats", pd.DataFrame())

    df = read_csv_safe(INPUT_PATH)
    if df is None: return
    df = normalize_columns(df) 
    
    if "race_id" not in df.columns: df["race_id"] = df.get("レース番号", df.get("race_no", 1))
    race_key = df["race_id"]

    hist_df = pd.DataFrame()
    if os.path.exists(HISTORY_PATH):
        raw_hist = read_csv_safe(HISTORY_PATH)
        if raw_hist is not None:
            hist_df = normalize_columns(raw_hist)
            if "日付(yyyy.mm.dd)" in hist_df.columns: hist_df = hist_df.sort_values("日付(yyyy.mm.dd)", ascending=False)

    horse_past = {str(h): g.head(N_PAST).reset_index(drop=True) for h, g in hist_df.groupby("馬名")} if not hist_df.empty else {}
    today_str = pd.Timestamp.today().strftime("%Y.%m.%d")

    jk_dict = jockey_stats.set_index("騎手")[["騎手_win_rate", "騎手_top3_rate"]].to_dict("index") if not jockey_stats.empty else {}
    tr_dict = trainer_stats.set_index("調教師")[["調教師_win_rate", "調教師_top3_rate"]].to_dict("index") if not trainer_stats.empty else {}
    jk_def = {"騎手_win_rate": jockey_stats["騎手_win_rate"].mean(), "騎手_top3_rate": jockey_stats["騎手_top3_rate"].mean()} if not jockey_stats.empty else {"騎手_win_rate": 0.1, "騎手_top3_rate": 0.3}
    tr_def = {"調教師_win_rate": trainer_stats["調教師_win_rate"].mean(), "調教師_top3_rate": trainer_stats["調教師_top3_rate"].mean()} if not trainer_stats.empty else {"調教師_win_rate": 0.08, "調教師_top3_rate": 0.25}

    feat_records = []
    
    # 馬場状態検知用の安全なカラム
    safe_track_cols = ["距離", "distance", "馬場", "馬場状態", "track_cond", "コース", "トラック", "種別", "条件"]

    for idx, row in df.iterrows():
        h, v = str(row.get("馬名", "")), str(row.get("開催", ""))
        d = scalar_safe(row.get("距離", 1600), 1600.0)
        past = horse_past.get(h, pd.DataFrame())
        feat = {}
        feat["age"], feat["weight_carried"] = scalar_safe(row.get("年齢", 4), 4.0), scalar_safe(row.get("斤量", 55), 55.0)
        feat["gate_no"], feat["horse_no"] = scalar_safe(row.get("枠番", row.get("馬番", 0)), 0.0), scalar_safe(row.get("馬番", 0), 0.0)
        feat["field_size"], feat["distance"] = scalar_safe(row.get("頭数", 16), 16.0), d
        feat["horse_weight"], feat["weight_change"] = scalar_safe(row.get("馬体重", 480), 480.0), scalar_safe(row.get("馬体重増減", 0), 0.0)
        feat["weight_ratio"] = feat["weight_change"] / (feat["horse_weight"] + 1)
        
        odds_val = row.get("単勝オッズ", 10.0)
        odds_raw = max(scalar_safe(odds_val, 10.0), 1.1)
        feat["log_odds"], feat["is_longshot"] = float(np.log(odds_raw)), int(odds_raw >= 20.0)
        
        jk_info, tr_info = jk_dict.get(str(row.get("騎手", "")), jk_def), tr_dict.get(str(row.get("調教師", "")), tr_def)
        feat["jockey_win_rate"], feat["jockey_top3_rate"] = jk_info["騎手_win_rate"], jk_info["騎手_top3_rate"]
        feat["trainer_win_rate"], feat["trainer_top3_rate"] = tr_info["調教師_win_rate"], tr_info["調教師_top3_rate"]
        feat.update(build_multi_race_feats(past)); feat.update(build_course_feats(past, v, d))
        feat["rest_days"] = calc_rest_days(past, today_str)
        
        # 🌟修正1：馬場状態の安全な検知（「ダリア賞」などの誤爆を防止）
        cur_track_str = "".join([str(row.get(c, "")) for c in safe_track_cols])
        cur_is_dirt = "ダ" in cur_track_str or "ダート" in cur_track_str
        cur_is_turf = "芝" in cur_track_str
        
        past_track_str = ""
        if not past.empty:
            past_safe_cols = [c for c in safe_track_cols if c in past.columns]
            if past_safe_cols:
                past_track_str = past[past_safe_cols].astype(str).agg(''.join, axis=1).str.cat()
        
        past_has_dirt = "ダ" in past_track_str or "ダート" in past_track_str
        past_has_turf = "芝" in past_track_str
        
        feat["is_new"] = int(past.empty)
        feat["is_first_dirt"] = int(not past.empty and cur_is_dirt and not past_has_dirt)
        feat["is_first_turf"] = int(not past.empty and cur_is_turf and not past_has_turf)

        if not past.empty:
            pr = past.iloc[0]
            feat["prev_rank"], feat["prev_margin"] = scalar_safe(pr.get("着順", 9), 9.0), scalar_safe(pr.get("着差タイム", 1), 1.0)
            feat["prev_pop"], feat["prev_spurt"] = scalar_safe(pr.get("人気", 8), 8.0), scalar_safe(pr.get("上り3F", 36), 36.0)
            feat["prev_pci"], feat["prev_rpci"], feat["prev_corner_4"] = scalar_safe(pr.get("PCI", 50), 50.0), scalar_safe(pr.get("RPCI", 50), 50.0), scalar_safe(pr.get("4角", 8), 8.0)
        else:
            feat.update({"prev_rank": 9.0, "prev_margin": 1.0, "prev_pop": 8.0, "prev_spurt": 36.0, "prev_pci": 50.0, "prev_rpci": 50.0, "prev_corner_4": 8.0})
        feat["prev_pci_diff"] = feat["prev_pci"] - feat["prev_rpci"]
        m_safe = feat["prev_margin"] + 0.1
        feat["hidden_strength"] = feat["prev_rank"] / m_safe if m_safe != 0 else 0.0
        feat["running_style"] = feat["prev_corner_4"] / (feat["field_size"] + 1)
        for c in ["開催", "性別", "馬場状態", "所属", "騎手", "調教師"]:
            feat[f"cat_{c}"] = mappings.get(c, {}).get(str(row.get(c, "")), -1)
        
        feat["_idx"] = idx
        feat_records.append(feat)

    feat_df = pd.DataFrame(feat_records).set_index("_idx")
    feat_df["_rg"] = race_key.values
    
    # 判定フラグをメインDataFrameに渡す
    df["is_new"] = feat_df["is_new"]
    df["is_first_dirt"] = feat_df["is_first_dirt"]
    df["is_first_turf"] = feat_df["is_first_turf"]

    df_for_mprob = pd.DataFrame({"log_odds": feat_df["log_odds"], "_rg": feat_df["_rg"]})
    for rg, grp in df_for_mprob.groupby("_rg"):
        o_exp = np.exp(grp["log_odds"])
        mp_r = 1.0 / o_exp
        feat_df.loc[grp.index, "market_prob"] = (mp_r / mp_r.sum()).values
        feat_df.loc[grp.index, "odds_rank"] = o_exp.rank(method="min").values
        feat_df.loc[grp.index, "is_favorite"] = 0
        feat_df.at[o_exp.idxmin(), "is_favorite"] = 1

    feat_df.drop(columns=["_rg"], inplace=True)
    X = feat_df.reindex(columns=required_feats, fill_value=0)
    
    df["raw_win_prob"] = model_win.predict(X)
    df["top3_prob"] = np.maximum(model_top3.predict(X), df["raw_win_prob"])
    df["win_odds"] = safe_num(df.get("単勝オッズ", df.get("win_odds", 10.0)), 10.0)

    # 🌟ペナルティ処理（ラベル付けと確率半減）
    mask_new = df["is_new"] == 1
    mask_first_dirt = df["is_first_dirt"] == 1
    mask_first_turf = df["is_first_turf"] == 1

    df.loc[mask_new, "raw_win_prob"] *= 0.5 
    df.loc[mask_new, "top3_prob"] *= 0.5
    df.loc[mask_new, "馬名"] = df.loc[mask_new, "馬名"].astype(str) + " (新馬)"

    df.loc[mask_first_dirt, "raw_win_prob"] *= 0.5 
    df.loc[mask_first_dirt, "top3_prob"] *= 0.5
    df.loc[mask_first_dirt, "馬名"] = df.loc[mask_first_dirt, "馬名"].astype(str) + " (初ダ)"

    df.loc[mask_first_turf, "raw_win_prob"] *= 0.5 
    df.loc[mask_first_turf, "top3_prob"] *= 0.5
    df.loc[mask_first_turf, "馬名"] = df.loc[mask_first_turf, "馬名"].astype(str) + " (初芝)"

    is_local = df.get("所属", pd.Series([""]*len(df), index=df.index)).astype(str).str.contains(r"地|地方") | \
               df.get("馬名", pd.Series([""]*len(df), index=df.index)).astype(str).str.contains(r"\(地\)|（地）|\[地\]")
    df.loc[is_local, "raw_win_prob"] *= 0.5
    df.loc[is_local, "top3_prob"] *= 0.5

    df["win_prob"] = df["raw_win_prob"] / df.groupby(race_key)["raw_win_prob"].transform("sum")
    _m_prob = 1.0 / df["win_odds"].clip(lower=1.1)
    m_prob_norm = _m_prob / df.groupby(race_key)[_m_prob.name].transform("sum")
    df["market_prob"] = m_prob_norm 
    
    df["win_prob"] = np.minimum(df["win_prob"], m_prob_norm * 4.0) 
    df["win_prob"] = df["win_prob"] / df.groupby(race_key)["win_prob"].transform("sum")
    
    df["win_ev"] = df["win_prob"] * df["win_odds"]

    df = normalize_top3_prob(df, race_key)
    df = assign_signals_improved(df, race_key)
    df = recalc_ability_score(df, race_key)  
    df = calc_confidence_rank(df, race_key)  

    ui_mapping = {
        "馬名": "horse_name", "馬番": "horse_no", "レース番号": "race_no", "開催": "venue", "日付(yyyy.mm.dd)": "race_date"
    }
    for jp_col, en_col in ui_mapping.items():
        if jp_col in df.columns and en_col not in df.columns:
            df[en_col] = df[jp_col]

    os.makedirs(os.path.dirname(OUT_DETAIL), exist_ok=True)
    df.to_csv(OUT_DETAIL, index=False, encoding="utf-8-sig")

    list_group_cols = [c for c in ["race_id", "race_no", "race_date", "venue", "日付(yyyy.mm.dd)", "開催", "レース番号", "距離", "馬場状態"] if c in df.columns]
    if not list_group_cols: list_group_cols = ["race_id"]
        
    race_list = (
        df.groupby(list_group_cols)
          .agg(
              top_horse    =("win_ev", lambda x: df.loc[x.idxmax(), "馬名"] if "馬名" in df.columns else ""),
              top_signal  =("win_ev", lambda x: df.loc[x.idxmax(), "signal"] if "signal" in df.columns else ""),
              top_win_prob=("win_prob", "max"),
              top_top3prob=("top3_prob", "max"),
              top_win_ev  =("win_ev", "max"),
              field_size  =("win_prob", "count"),
              confidence_rank=("confidence_rank", "first"),
              confidence_label=("confidence_label", "first"),
          )
          .reset_index()
    )
    race_list.to_csv(OUT_LIST, index=False, encoding="utf-8-sig")

    ui_data_dir = "ui/public/data/"
    os.makedirs(ui_data_dir, exist_ok=True)
    for f in [OUT_DETAIL, OUT_LIST]:
        if os.path.exists(f): shutil.copy(f, os.path.join(ui_data_dir, os.path.basename(f)))

    print(f"✅ 推論完了: (初ダ)(初芝)の厳密検知と、完全確率順のペナルティ印ロジックを適用しました！")

if __name__ == "__main__":
    run_pipeline()