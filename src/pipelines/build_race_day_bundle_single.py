from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import pandas as pd


ROOT = Path(".")
INPUT_PATH = ROOT / "data/manual/race_day_input.csv"
OUT_DIR = ROOT / "data/predictions"
PUBLIC_DIR = ROOT / "ui/public/data"

RACE_LIST_PATH = OUT_DIR / "race_list_view.csv"
RACE_DETAIL_PATH = OUT_DIR / "race_detail_view.csv"
FINAL_BET_PLAN_PATH = OUT_DIR / "final_bet_plan.csv"
FINAL_MULTI_BETS_PATH = OUT_DIR / "final_multi_bets.csv"
BET_AMOUNTS_PATH = OUT_DIR / "bet_amounts.csv"


VENUE_MAP = {
    "FUKUSHIMA": "福島",
    "HANSHIN": "阪神",
    "NAKAYAMA": "中山",
    "TOKYO": "東京",
    "KYOTO": "京都",
    "CHUKYO": "中京",
    "SAPPORO": "札幌",
    "HAKODATE": "函館",
    "NIIGATA": "新潟",
    "KOKURA": "小倉",
}


def venue_label(v: str) -> str:
    if pd.isna(v):
        return ""
    s = str(v).strip()
    return VENUE_MAP.get(s, s)


def to_signal(rank: int) -> str:
    if rank == 1:
        return "軸"
    if rank == 2:
        return "複勝圏"
    if rank == 3:
        return "能力注"
    return "様子見"


def to_confidence(rank: int, win_prob: float, gap12: float, field_size: int) -> str:
    if rank == 1 and win_prob >= 0.28 and gap12 >= 0.08:
        return "S"
    if rank == 1 and win_prob >= 0.22 and gap12 >= 0.05:
        return "A"
    if rank <= 2 and win_prob >= 0.16:
        return "B"
    if rank <= 3 and win_prob >= 0.10:
        return "B"
    if rank <= min(5, field_size):
        return "C"
    return "D"


def chaos_band_from_probs(top1: float, top2: float, top3: float) -> str:
    gap12 = top1 - top2
    if top1 >= 0.30 and gap12 >= 0.08:
        return "実力通り"
    if top1 < 0.20 and top3 >= 0.10:
        return "波乱含み"
    return "実力通り"


def normalize_probs(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["win_odds"] = df["win_odds"].astype(float)

    # 単勝オッズ -> 暗黙確率
    df["raw_prob"] = 1.0 / df["win_odds"]
    df["win_prob"] = df.groupby("race_id")["raw_prob"].transform(lambda s: s / s.sum())

    # 簡易3着内率
    df["top3_prob"] = (df["win_prob"] * 2.8).clip(upper=0.95)

    # ベーススコア
    df["base_score"] = (df["win_prob"] * 260 + df["top3_prob"] * 35).round(2)

    # AI指数は 35〜85 に収める
    def scale_score(s: pd.Series) -> pd.Series:
        s_min = s.min()
        s_max = s.max()
        if s_max == s_min:
            return pd.Series([60.0] * len(s), index=s.index)
        return 35 + ((s - s_min) / (s_max - s_min)) * 50

    df["ability_score"] = df.groupby("race_id")["base_score"].transform(scale_score).round(1)

    return df


def build_race_detail_view(df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for race_id, g in df.groupby("race_id"):
        g = g.sort_values(["win_prob", "horse_no"], ascending=[False, True]).copy()
        g["win_rank"] = range(1, len(g) + 1)

        top1 = float(g.iloc[0]["win_prob"])
        top2 = float(g.iloc[1]["win_prob"]) if len(g) >= 2 else 0.0
        gap12 = top1 - top2
        field_size = len(g)

        for _, r in g.iterrows():
            rank = int(r["win_rank"])
            rows.append(
                {
                    "race_id": r["race_id"],
                    "race_date": r["race_date"],
                    "venue": venue_label(r["venue"]),
                    "race_no": int(r["race_no"]),
                    "race_name": r["race_name"],
                    "win_rank": rank,
                    "gate_no": int(r["gate_no"]),
                    "horse_no": int(r["horse_no"]),
                    "horse_name": r["horse_name"],
                    "jockey_name": r["jockey_name"],
                    "signal": to_signal(rank),
                    "confidence_label": to_confidence(rank, float(r["win_prob"]), gap12, field_size),
                    "ability_score": round(float(r["ability_score"]), 1),
                    "win_prob": round(float(r["win_prob"]), 4),
                    "top3_prob": round(float(r["top3_prob"]), 4),
                    "win_odds": round(float(r["win_odds"]), 2),
                    "win_ev": round(float(r["win_prob"]) * float(r["win_odds"]), 4),
                }
            )

    out = pd.DataFrame(rows)
    out = out.sort_values(["race_date", "venue", "race_no", "win_rank"])
    return out


def build_race_list_view(detail_df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for race_id, g in detail_df.groupby("race_id"):
        g = g.sort_values("win_rank").copy()

        top1 = float(g.iloc[0]["win_prob"])
        top2 = float(g.iloc[1]["win_prob"]) if len(g) >= 2 else 0.0
        top3 = float(g.iloc[2]["win_prob"]) if len(g) >= 3 else 0.0

        race_name = str(g.iloc[0]["race_name"]).strip()
        if not race_name:
            race_name = f"{g.iloc[0]['venue']}{int(g.iloc[0]['race_no'])}R"

        rows.append(
            {
                "race_id": race_id,
                "race_name": race_name,
                "race_date": g.iloc[0]["race_date"],
                "venue": g.iloc[0]["venue"],
                "race_no": int(g.iloc[0]["race_no"]),
                "field_size": len(g),
                "chaos_band": chaos_band_from_probs(top1, top2, top3),
                "pred_top_horse": g.iloc[0]["horse_name"],
                "pred_top_signal": g.iloc[0]["signal"],
                "pred_top_confidence": g.iloc[0]["confidence_label"],
                "pred_top_ability": round(float(g.iloc[0]["ability_score"]), 1),
                "distance": "",
            }
        )

    out = pd.DataFrame(rows)
    out = out.sort_values(["race_date", "venue", "race_no"])
    return out


def run_pipeline(module_name: str) -> None:
    cmd = [sys.executable, "-m", module_name]
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise RuntimeError(f"{module_name} の実行に失敗しました")


def copy_to_public():
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    for path in [
        RACE_LIST_PATH,
        RACE_DETAIL_PATH,
        FINAL_BET_PLAN_PATH,
        FINAL_MULTI_BETS_PATH,
        BET_AMOUNTS_PATH,
    ]:
        if path.exists():
            target = PUBLIC_DIR / path.name
            target.write_bytes(path.read_bytes())


def main():
    if not INPUT_PATH.exists():
        raise FileNotFoundError(f"{INPUT_PATH} がありません")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(INPUT_PATH)

    required = {
        "race_id",
        "race_date",
        "venue",
        "race_no",
        "horse_no",
        "gate_no",
        "horse_name",
        "jockey_name",
        "win_odds",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"race_day_input.csv missing columns: {missing}")

    if "race_name" not in df.columns:
        df["race_name"] = df.apply(lambda r: f"{venue_label(r['venue'])}{int(r['race_no'])}R", axis=1)

    df["venue"] = df["venue"].map(venue_label)
    df["race_no"] = df["race_no"].astype(int)
    df["horse_no"] = df["horse_no"].astype(int)
    df["gate_no"] = df["gate_no"].astype(int)
    df["win_odds"] = df["win_odds"].astype(float)

    base_df = normalize_probs(df)
    race_detail_view = build_race_detail_view(base_df)
    race_list_view = build_race_list_view(race_detail_view)

    race_list_view.to_csv(RACE_LIST_PATH, index=False)
    race_detail_view.to_csv(RACE_DETAIL_PATH, index=False)

    print(f"saved: {RACE_LIST_PATH}")
    print(f"saved: {RACE_DETAIL_PATH}")

    # ここで本命・馬券ロジックを別ファイルに任せる
    run_pipeline("src.pipelines.build_final_bet_plan")
    run_pipeline("src.pipelines.build_final_multi_bets")
    run_pipeline("src.pipelines.build_bet_amounts")

    copy_to_public()
    print(f"copied to: {PUBLIC_DIR}")


if __name__ == "__main__":
    main()