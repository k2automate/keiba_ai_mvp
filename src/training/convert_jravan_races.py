from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd

from src.ingestion.normalize_common import (
    OUTPUT_RACES,
    build_race_id,
    normalize_date_str,
    normalize_surface,
    normalize_venue,
    parse_int,
    pick_series,
    save_csv,
    debug_columns,
)


def convert_races(input_csv: Path, output_csv: Path) -> None:
    df = pd.read_csv(input_csv)

    race_date_s = pick_series(df, ["race_date", "開催日", "年月日", "データ年月日", "月日"])
    venue_s = pick_series(df, ["venue", "競馬場", "場名", "場コード", "場"])
    race_no_s = pick_series(df, ["race_no", "R", "レース番号", "レースNo"])
    race_name_s = pick_series(df, ["race_name", "レース名", "競走名", "Hondai", "本題"])
    distance_s = pick_series(df, ["distance", "距離"])
    field_size_s = pick_series(df, ["field_size", "頭数", "出走頭数"])
    surface_s = pick_series(df, ["surface", "芝ダ障", "トラック種別", "種別"])

    out_rows = []
    seen = set()

    for i in range(len(df)):
        race_date = normalize_date_str(race_date_s.iloc[i])
        venue = normalize_venue(venue_s.iloc[i])
        race_no = parse_int(race_no_s.iloc[i], 0)
        race_id = build_race_id(race_date, venue, race_no)

        if race_id in seen:
            continue
        seen.add(race_id)

        out_rows.append(
            {
                "race_id": race_id,
                "race_date": race_date,
                "venue": venue,
                "race_no": race_no,
                "race_name": str(race_name_s.iloc[i]).strip(),
                "distance": parse_int(distance_s.iloc[i]),
                "field_size": parse_int(field_size_s.iloc[i]),
                "surface": normalize_surface(surface_s.iloc[i]),
            }
        )

    out_df = pd.DataFrame(out_rows).sort_values(["race_date", "venue", "race_no"])
    save_csv(out_df, output_csv)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="元のレースCSV")
    parser.add_argument("--output", default=str(OUTPUT_RACES), help="出力先")
    parser.add_argument("--debug-columns", action="store_true")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    df = pd.read_csv(input_path)
    if args.debug_columns:
        debug_columns(df, "races_input")
        return

    convert_races(input_path, output_path)


if __name__ == "__main__":
    main()