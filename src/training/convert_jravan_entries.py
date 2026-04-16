from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd

from src.ingestion.normalize_common import (
    OUTPUT_ENTRIES,
    build_race_id,
    normalize_date_str,
    normalize_venue,
    parse_float,
    parse_int,
    parse_odds,
    pick_series,
    save_csv,
    debug_columns,
)


def convert_entries(input_csv: Path, output_csv: Path) -> None:
    df = pd.read_csv(input_csv)

    race_date_s = pick_series(df, ["race_date", "開催日", "年月日", "データ年月日", "月日"])
    venue_s = pick_series(df, ["venue", "競馬場", "場名", "場コード", "場"])
    race_no_s = pick_series(df, ["race_no", "R", "レース番号", "レースNo"])

    horse_id_s = pick_series(df, ["horse_id", "競走馬コード", "馬コード"])
    horse_name_s = pick_series(df, ["horse_name", "馬名"])
    jockey_name_s = pick_series(df, ["jockey_name", "騎手名", "騎手"])
    gate_no_s = pick_series(df, ["gate_no", "枠番", "枠"])
    horse_no_s = pick_series(df, ["horse_no", "馬番"])
    age_s = pick_series(df, ["age", "年齢", "齢"])
    assigned_weight_s = pick_series(df, ["assigned_weight", "斤量"])
    horse_weight_s = pick_series(df, ["horse_weight", "馬体重"])
    horse_weight_diff_s = pick_series(df, ["horse_weight_diff", "馬体重増減", "増減"])
    popularity_s = pick_series(df, ["popularity", "人気", "人気順"])
    odds_s = pick_series(df, ["morning_line_odds", "単勝オッズ", "単オッズ", "TanOdds"])

    out_rows = []

    for i in range(len(df)):
        race_date = normalize_date_str(race_date_s.iloc[i])
        venue = normalize_venue(venue_s.iloc[i])
        race_no = parse_int(race_no_s.iloc[i], 0)
        race_id = build_race_id(race_date, venue, race_no)

        out_rows.append(
            {
                "race_id": race_id,
                "horse_id": str(horse_id_s.iloc[i]).strip(),
                "horse_name": str(horse_name_s.iloc[i]).strip(),
                "jockey_name": str(jockey_name_s.iloc[i]).strip(),
                "gate_no": parse_int(gate_no_s.iloc[i]),
                "horse_no": parse_int(horse_no_s.iloc[i]),
                "age": parse_int(age_s.iloc[i]),
                "assigned_weight": parse_float(assigned_weight_s.iloc[i]),
                "horse_weight": parse_int(horse_weight_s.iloc[i]),
                "horse_weight_diff": parse_int(horse_weight_diff_s.iloc[i]),
                "popularity": parse_int(popularity_s.iloc[i]),
                "morning_line_odds": parse_odds(odds_s.iloc[i]),
            }
        )

    out_df = pd.DataFrame(out_rows).sort_values(["race_id", "horse_no"])
    save_csv(out_df, output_csv)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="元の出馬表CSV")
    parser.add_argument("--output", default=str(OUTPUT_ENTRIES), help="出力先")
    parser.add_argument("--debug-columns", action="store_true")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    df = pd.read_csv(input_path)
    if args.debug_columns:
        debug_columns(df, "entries_input")
        return

    convert_entries(input_path, output_path)


if __name__ == "__main__":
    main()