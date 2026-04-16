from __future__ import annotations

from pathlib import Path
import csv
import pandas as pd


SOURCE_PATH = Path("keiba_utf8.csv")
RAW_DIR = Path("data/raw")


EXPECTED_COLUMNS = [
    "年", "月", "日", "回次", "場所", "日次", "レース番号", "レース名", "クラスコード",
    "芝・ダ", "コースコード", "距離", "馬場状態", "馬名", "性別", "年齢", "騎手名", "斤量",
    "頭数", "馬番", "確定着順", "入線着順", "異常コード", "着差タイム", "人気順",
    "走破タイム", "走破時計", "通過順1", "通過順2", "通過順3", "通過順4", "上がり3Fタイム",
    "馬体重", "調教師", "所属地", "賞金", "血統登録番号", "騎手コード", "調教師コード",
    "レースID", "現馬主名", "生産者名", "父馬名", "母馬名", "母の父馬名", "毛色",
    "生年月日", "単勝オッズ", "馬印1", "レース印1", "PCI"
]


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


def read_source_csv(path: Path) -> pd.DataFrame:
    encodings = ["utf-8-sig", "cp932", "shift_jis", "utf-8"]
    seps = [None, "\t", ","]

    last_error = None
    for enc in encodings:
        for sep in seps:
            try:
                df = pd.read_csv(
                    path,
                    sep=sep,
                    engine="python",
                    encoding=enc,
                    quoting=csv.QUOTE_MINIMAL,
                )
                if len(df.columns) >= 10:
                    return df
            except Exception as e:
                last_error = e

    raise last_error


def strip_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df


def validate_columns(df: pd.DataFrame) -> None:
    missing = [c for c in EXPECTED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            "必要列が足りません。\n"
            f"missing={missing}\n"
            f"actual_columns={list(df.columns)}"
        )


def to_int(v, default=None):
    if pd.isna(v):
        return default
    s = str(v).strip()
    if s == "":
        return default
    try:
        return int(float(s))
    except Exception:
        return default


def to_float(v, default=None):
    if pd.isna(v):
        return default
    s = str(v).strip()
    if s == "":
        return default
    try:
        return float(s)
    except Exception:
        return default


def normalize_year(v) -> int:
    """
    2桁年に対応:
    17 -> 2017
    99 -> 1999
    2024 -> 2024
    """
    y = to_int(v, 0)
    if y < 100:
        if y <= 50:
            return 2000 + y
        return 1900 + y
    return y


def normalize_venue(v) -> str:
    s = str(v).strip()
    return VENUE_MAP.get(s, s)


def venue_to_en(v: str) -> str:
    return VENUE_EN_MAP.get(v, v.upper())


def normalize_surface(v) -> str:
    s = str(v).strip()
    if "芝" in s:
        return "芝"
    if "ダ" in s:
        return "ダート"
    if "障" in s:
        return "障害"
    return s


def parse_weight_and_diff(value):
    if pd.isna(value):
        return None, 0

    s = str(value).strip()
    if s == "":
        return None, 0

    if "(" in s and ")" in s:
        try:
            base = s.split("(")[0].strip()
            diff = s.split("(")[1].split(")")[0].strip()
            return to_int(base), to_int(diff, 0)
        except Exception:
            return to_int(s), 0

    return to_int(s), 0


def build_race_id(year, month, day, venue, race_no) -> str:
    y = normalize_year(year)
    m = to_int(month, 0)
    d = to_int(day, 0)
    rr = to_int(race_no, 0)

    venue_ja = normalize_venue(venue)
    venue_en = venue_to_en(venue_ja)

    return f"{y:04d}{m:02d}{d:02d}_{venue_en}_{rr:02d}"


def build_race_date(year, month, day) -> str:
    y = normalize_year(year)
    m = to_int(month, 0)
    d = to_int(day, 0)
    return f"{y:04d}-{m:02d}-{d:02d}"


def build_races(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    seen = set()

    for _, row in df.iterrows():
        race_id = build_race_id(row["年"], row["月"], row["日"], row["場所"], row["レース番号"])
        if race_id in seen:
            continue
        seen.add(race_id)

        rows.append(
            {
                "race_id": race_id,
                "race_date": build_race_date(row["年"], row["月"], row["日"]),
                "venue": normalize_venue(row["場所"]),
                "race_no": to_int(row["レース番号"]),
                "race_name": str(row["レース名"]).strip(),
                "distance": to_int(row["距離"]),
                "field_size": to_int(row["頭数"]),
                "surface": normalize_surface(row["芝・ダ"]),
            }
        )

    out = pd.DataFrame(rows)
    out = out.sort_values(["race_date", "venue", "race_no"]).reset_index(drop=True)
    return out


def build_entries(df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for _, row in df.iterrows():
        race_id = build_race_id(row["年"], row["月"], row["日"], row["場所"], row["レース番号"])
        horse_weight, horse_weight_diff = parse_weight_and_diff(row["馬体重"])

        horse_id = str(row["血統登録番号"]).strip()
        if horse_id == "" or horse_id.lower() == "nan":
            horse_id = f"{race_id}_{str(row['馬名']).strip()}"

        rows.append(
            {
                "race_id": race_id,
                "horse_id": horse_id,
                "horse_name": str(row["馬名"]).strip(),
                "jockey_name": str(row["騎手名"]).strip(),
                "gate_no": to_int(row["馬番"]),
                "horse_no": to_int(row["馬番"]),
                "age": to_int(row["年齢"]),
                "assigned_weight": to_float(row["斤量"]),
                "horse_weight": horse_weight,
                "horse_weight_diff": horse_weight_diff,
                "popularity": to_int(row["人気順"]),
                "morning_line_odds": to_float(row["単勝オッズ"]),
            }
        )

    out = pd.DataFrame(rows)
    out = out.sort_values(["race_id", "horse_no"]).reset_index(drop=True)
    return out


def build_results(df: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for _, row in df.iterrows():
        race_id = build_race_id(row["年"], row["月"], row["日"], row["場所"], row["レース番号"])

        horse_id = str(row["血統登録番号"]).strip()
        if horse_id == "" or horse_id.lower() == "nan":
            horse_id = f"{race_id}_{str(row['馬名']).strip()}"

        rows.append(
            {
                "race_id": race_id,
                "horse_id": horse_id,
                "finish_position": to_int(row["確定着順"]),
                "final_odds": to_float(row["単勝オッズ"]),
                "final_popularity": to_int(row["人気順"]),
            }
        )

    out = pd.DataFrame(rows)
    out = out.sort_values(["race_id", "finish_position", "horse_id"]).reset_index(drop=True)
    return out


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    if not SOURCE_PATH.exists():
        raise FileNotFoundError(f"{SOURCE_PATH} が見つかりません")

    df = read_source_csv(SOURCE_PATH)
    df = strip_columns(df)
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
    print("source rows:", len(df))
    print("races rows:", len(races))
    print("entries rows:", len(entries))
    print("results rows:", len(results))


if __name__ == "__main__":
    main()