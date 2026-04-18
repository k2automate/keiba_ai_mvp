from __future__ import annotations

from pathlib import Path
import pandas as pd


ROOT = Path(".")
DETAIL_PATH = ROOT / "data/predictions/race_detail_view.csv"
OUT_PATH = ROOT / "data/predictions/final_bet_plan.csv"


SIGNAL_PRIORITY = {
    "軸": 4,
    "複勝圏": 3,
    "能力注": 2,
    "様子見": 1,
}

CONF_PRIORITY = {
    "S": 5,
    "A": 4,
    "B": 3,
    "C": 2,
    "D": 1,
}


def safe_num(v, fallback=0.0) -> float:
    try:
        return float(v)
    except Exception:
        return fallback


def pick_axis_row(group: pd.DataFrame) -> pd.Series:
    """
    本命の選び方
    1. signal を最優先（軸 > 複勝圏 > 能力注 > 様子見）
    2. その中で信頼度
    3. その中で win_prob
    4. その中で EV
    5. 同点なら win_rank
    """
    g = group.copy()

    g["signal_priority"] = g["signal"].map(SIGNAL_PRIORITY).fillna(0)
    g["conf_priority"] = g["confidence_label"].map(CONF_PRIORITY).fillna(0)

    g = g.sort_values(
        [
            "signal_priority",
            "conf_priority",
            "win_prob",
            "win_ev",
            "ability_score",
            "win_rank",
        ],
        ascending=[False, False, False, False, False, True],
    )

    return g.iloc[0]


def decide_action_and_grade(row: pd.Series) -> tuple[str, str]:
    """
    実戦用に少し厳しめ
    """
    signal = str(row["signal"])
    conf = str(row["confidence_label"])
    ev = safe_num(row["win_ev"])
    win_prob = safe_num(row["win_prob"])

    # 最優先は軸
    if signal == "軸":
        if ev >= 1.12 and conf in {"S", "A"} and win_prob >= 0.18:
            return "買い", "標準"
        if ev >= 1.00 and win_prob >= 0.14:
            return "少額買い", "少額"
        return "様子見", "見送り"

    # 次点は複勝圏
    if signal == "複勝圏":
        if ev >= 1.10 and conf in {"A", "B"} and win_prob >= 0.13:
            return "少額買い", "少額"
        return "様子見", "見送り"

    # 能力注はかなり絞る
    if signal == "能力注":
        if ev >= 1.18 and conf in {"A", "B"} and win_prob >= 0.10:
            return "少額買い", "穴少額"
        return "様子見", "見送り"

    # 様子見は基本買わない
    return "様子見", "見送り"


def build_reason(row: pd.Series) -> str:
    return (
        f"signal={row['signal']} / "
        f"信頼度={row['confidence_label']} / "
        f"勝率={safe_num(row['win_prob']) * 100:.1f}% / "
        f"期待値={safe_num(row['win_ev']):.3f}"
    )


def main():
    if not DETAIL_PATH.exists():
        raise FileNotFoundError(f"{DETAIL_PATH} がありません")

    df = pd.read_csv(DETAIL_PATH)

    required = {
        "race_id",
        "race_name",
        "horse_name",
        "horse_no",
        "signal",
        "confidence_label",
        "win_prob",
        "ability_score",
        "win_rank",
    }
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"race_detail_view.csv missing columns: {missing}")

    # win_odds がない場合は仮値0
    if "win_odds" not in df.columns:
        df["win_odds"] = 0.0

    # win_ev がない場合は作る
    if "win_ev" not in df.columns:
        df["win_ev"] = df.apply(
            lambda r: safe_num(r.get("win_prob")) * safe_num(r.get("win_odds")),
            axis=1,
        )

    rows = []

    for race_id, group in df.groupby("race_id"):
        g = group.copy()

        # 念のため数値化
        for col in ["horse_no", "win_prob", "ability_score", "win_rank", "win_odds", "win_ev"]:
            if col in g.columns:
                g[col] = g[col].apply(safe_num)

        axis_row = pick_axis_row(g)
        action, grade = decide_action_and_grade(axis_row)

        rows.append(
            {
                "race_id": axis_row["race_id"],
                "race_name": axis_row["race_name"],
                "horse_name": axis_row["horse_name"],
                "horse_no": int(safe_num(axis_row["horse_no"])),
                "signal": axis_row["signal"],
                "confidence_label": axis_row["confidence_label"],
                "win_prob": round(safe_num(axis_row["win_prob"]), 4),
                "win_odds": round(safe_num(axis_row.get("win_odds", 0)), 2),
                "win_ev": round(safe_num(axis_row.get("win_ev", 0)), 4),
                "bet_percent": 0,
                "bet_grade": grade,
                "action": action,
                "reason": build_reason(axis_row),
            }
        )

    out = pd.DataFrame(rows)

    # 見送りも含めて保存
    out = out.sort_values(["race_id", "horse_no"])
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT_PATH, index=False)

    print(f"saved: {OUT_PATH}")
    print(f"rows: {len(out)}")


if __name__ == "__main__":
    main()