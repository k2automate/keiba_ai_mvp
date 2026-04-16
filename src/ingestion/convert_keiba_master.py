from __future__ import annotations

from pathlib import Path
import pandas as pd


SOURCE_PATH = Path("競馬マスタ.csv")
RAW_DIR = Path("data/raw")


VENUE_MAP = {
    "札幌": "札幌",
    "函館": "函館",
    "福島": "福島",
    "新潟": "新潟",
    "東京": "東京",
    "中山": "中山",
    "中京": "中京",
    "京都": "京都",
    "阪神": "阪神",
    "小倉": "小倉",
}

VENUE_EN_MAP = {
    "札幌": "SAPPORO",
    "函館": "HAKODATE",
    "福島": "FUKUSHIMA",
    "新潟": "NIIGATA",
    "東京": "TOKYO",
    "中山": "NAKAYAMA",
    "中京": "CHUKYO",
    "京都": "KYOTO",
    "阪神": "HANSHIN",
    "小倉": "KOKURA",
}


def normalize_venue(v) -> str:
    s = str(v).strip()
    return VENUE_MAP.get(s, s)


def venue_to_en(v: str) -> str:
    return VENUE_EN_MAP.get(v, v.upper())


def normalize_surface(v) -> str:
    s = str(v).strip()
    if "芝" in s:
        return "芝"
    if "ダ" in s or "ダート" in s:
        return "ダート"
    if "障" in s:
        return "障害"
    return s


def to_int(v, default=None):
    if pd.isna(v) or str(v).strip() == "":
        return default
    try:
        return int(float(v))
    except Exception:
        return default


def to_float(v, default=None):
    if pd.isna(v) or str(v).strip() == "":
        return default
    try:
        return float(v)
    except Exception:
        return default


def build_race_id(year, month, day, venue, race_no) -> str:
    y = to_int(year, 0)
    m = to_int(month, 0)
    d = to_int(day, 0)
    rr = to_int(race_no, 0)

    venue_ja = normalize_venue(venue)
    venue_en = venue_to_en(venue_ja)

    return f"{y:04d}{m:02d}{d:02d}_{venue_en}_{rr:02d}"


# ★ ここが今回の修正ポイント（文字コード対応）
def read_source_csv(path: Path) -> pd.DataFrame:
    encodings = ["utf-8-sig", "cp932", "shift_jis", "utf-8"]

    last_error = None
    for enc in encodings:
        try:
            return pd.read_csv(path, sep=None, engine="python", encoding=enc)
        except Exception as e:
            last_error = e

    raise last_error


def validate_columns(df: pd.DataFrame) -> None:
    required = [
        "年", "月", "日", "場所", "レース番号", "レース名",
        "芝・ダ", "距離", "頭数",
        "馬名", "年齢", "騎手名", "斤量", "馬番",
        "確定着順", "人気順", "馬体重",
        "血統登録番号", "単勝オッズ"
    ]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"必要列が足りません: {missing}")


def build_races(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    seen = set()

    for _, row in df.iterrows():
        race_id = build_race_id(
            row["年"], row["月"], row["日"], row["場所"], row["レース番号"]
        )

        if race_id in seen:
            continue
        seen.add(race_id)

        race_date = f"{to_int(row['年']):04d}-{to_int(row['月']):02d}-{to_int(row['日']):02d}"

        rows.append(
            {
                "race_id": race_id,
                "race_date": race_date,
                "venue": normalize_venue(row["場所"]),
                "race_no": to_int(row["レース番号"]),
                "race_name": str(row["レース名"]).strip(),
                "distance": to_int(row["距離"]),
                "field_size": to_int(row["頭数"]),
                "surface": normalize_surface(row["芝・ダ"]),
            }
        )

    return pd.DataFrame(rows)


def build_entries(df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for _, row in df.iterrows():
        race_id = build_race_id(
            row["年"], row["月"], row["日"], row["場所"], row["レース番号"]
        )

        rows.append(
            {
                "race_id": race_id,
                "horse_id": str(row["血統登録番号"]).strip(),
                "horse_name": str(row["馬名"]).strip(),
                "jockey_name": str(row["騎手名"]).strip(),
                "gate_no": to_int(row["馬番"]),
                "horse_no": to_int(row["馬番"]),
                "age": to_int(row["年齢"]),
                "assigned_weight": to_float(row["斤量"]),
                "horse_weight": to_int(row["馬体重"]),
                "horse_weight_diff": 0,
                "popularity": to_int(row["人気順"]),
                "morning_line_odds": to_float(row["単勝オッズ"]),
            }
        )

    return pd.DataFrame(rows)


def build_results(df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for _, row in df.iterrows():
        race_id = build_race_id(
            row["年"], row["月"], row["日"], row["場所"], row["レース番号"]
        )

        rows.append(
            {
                "race_id": race_id,
                "horse_id": str(row["血統登録番号"]).strip(),
                "finish_position": to_int(row["確定着順"]),
                "final_odds": to_float(row["単勝オッズ"]),
                "final_popularity": to_int(row["人気順"]),
            }
        )

    return pd.DataFrame(rows)


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if not SOURCE_PATH.exists():
        raise FileNotFoundError(f"{SOURCE_PATH} が見つかりません")

    df = read_source_csv(SOURCE_PATH)
    validate_columns(df)

    races = build_races(df)
    entries = build_entries(df)
    results = build_results(df)

    races.to_csv(RAW_DIR / "races.csv", index=False)
    entries.to_csv(RAW_DIR / "race_entries.csv", index=False)
    results.to_csv(RAW_DIR / "race_results.csv", index=False)

    print("saved:", RAW_DIR / "races.csv")
    print("saved:", RAW_DIR / "race_entries.csv")
    print("saved:", RAW_DIR / "race_results.csv")
    print("rows:", len(df))


if __name__ == "__main__":
    main()