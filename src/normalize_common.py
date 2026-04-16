from __future__ import annotations

from pathlib import Path
from typing import Iterable
import math
import pandas as pd


RAW_DIR = Path("data/raw")
OUTPUT_RACES = RAW_DIR / "races.csv"
OUTPUT_ENTRIES = RAW_DIR / "race_entries.csv"
OUTPUT_RESULTS = RAW_DIR / "race_results.csv"


VENUE_CODE_MAP = {
    "01": "札幌",
    "02": "函館",
    "03": "福島",
    "04": "新潟",
    "05": "東京",
    "06": "中山",
    "07": "中京",
    "08": "京都",
    "09": "阪神",
    "10": "小倉",
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

SURFACE_MAP = {
    "1": "芝",
    "2": "ダート",
    "3": "障害",
    "芝": "芝",
    "ダート": "ダート",
    "障害": "障害",
    "TURF": "芝",
    "DIRT": "ダート",
    "JUMP": "障害",
}


def first_existing_column(df: pd.DataFrame, candidates: Iterable[str]) -> str:
    for col in candidates:
        if col in df.columns:
            return col
    raise KeyError(f"None of these columns were found: {list(candidates)}")


def pick_series(df: pd.DataFrame, candidates: Iterable[str]) -> pd.Series:
    col = first_existing_column(df, candidates)
    return df[col]


def normalize_venue(value) -> str:
    if pd.isna(value):
        return "UNKNOWN"
    s = str(value).strip()
    return VENUE_CODE_MAP.get(s, s)


def venue_to_en(venue_ja: str) -> str:
    return VENUE_EN_MAP.get(venue_ja, venue_ja.upper())


def normalize_surface(value) -> str:
    if pd.isna(value):
        return "UNKNOWN"
    s = str(value).strip()
    return SURFACE_MAP.get(s, s)


def normalize_date_str(value) -> str:
    if pd.isna(value):
        raise ValueError("race_date is missing")
    dt = pd.to_datetime(value)
    return dt.strftime("%Y-%m-%d")


def normalize_date_compact(value) -> str:
    if pd.isna(value):
        raise ValueError("race_date is missing")
    dt = pd.to_datetime(value)
    return dt.strftime("%Y%m%d")


def parse_int(value, default=None):
    if pd.isna(value) or value == "":
        return default
    try:
        return int(float(value))
    except Exception:
        return default


def parse_float(value, default=None):
    if pd.isna(value) or value == "":
        return default
    try:
        return float(value)
    except Exception:
        return default


def parse_odds(value):
    """
    柔らかいオッズ変換:
    - すでに 3.8 のような値ならそのまま float
    - '038' -> 3.8
    - '0038' -> 3.8
    - '125' -> 12.5
    - 空や 0 は None
    """
    if pd.isna(value):
        return None

    s = str(value).strip()
    if s == "":
        return None

    try:
        f = float(s)
        if f == 0:
            return None
        # すでに小数を含むならそのまま
        if "." in s:
            return f
    except Exception:
        pass

    # 数字だけのケース
    digits = "".join(ch for ch in s if ch.isdigit())
    if digits == "":
        return None

    num = int(digits)
    if num == 0:
        return None

    # TARGET/JRA-VAN系の雑対応
    # 例: 38 -> 3.8, 125 -> 12.5, 0038 -> 3.8
    if num >= 10:
        return num / 10.0

    return float(num)


def build_race_id(race_date, venue, race_no) -> str:
    ymd = normalize_date_compact(race_date)
    venue_ja = normalize_venue(venue)
    venue_en = venue_to_en(venue_ja)
    rr = f"{parse_int(race_no, 0):02d}"
    return f"{ymd}_{venue_en}_{rr}"


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def save_csv(df: pd.DataFrame, path: Path) -> None:
    ensure_parent(path)
    df.to_csv(path, index=False)
    print(f"saved: {path}")


def debug_columns(df: pd.DataFrame, name: str) -> None:
    print(f"[{name}] columns:")
    for c in df.columns:
        print(" -", c)