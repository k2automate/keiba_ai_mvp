from __future__ import annotations

import argparse
from pathlib import Path
import pandas as pd

from src.ingestion.normalize_common import (
    OUTPUT_RESULTS,
    build_race_id,
    normalize_date_str,
    normalize_venue,
    parse_int,
    parse_odds,
    pick_series,
    save_csv,
    debug_columns,
)


def convert_results(input_csv: Path, output_csv: Path) -> None:
    df = pd.read_csv(input_csv)

    race_date_s = pick_series(df, ["race_date", "開催日", "年月日", "データ年月日", "月日"])
    venue_s = pick_series(df, ["venue", "競馬場", "場名", "場コード", "場"])
    race_no_s = pick_series(df, ["race_no", "R", "レース番号", "レースNo"])

    horse_id_s = pick_series(df, ["horse_id", "競走馬コード", "馬コード"])
    finish_position_s = pick_series(df, ["finish_position", "着順"])
    final_odds_s = pick_series(df, ["final_odds", "確定単勝オッズ", "単勝", "単オッズ", "TanOdds"])
    final_popularity_s = pick_series(df, ["final_popularity", "確定人気", "人気", "人気順"])

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
                "finish_position": parse_int(finish_position_s.iloc[i]),
                "final_odds": parse_odds(final_odds_s.iloc[i]),
                "final_popularity": parse_int(final_popularity_s.iloc[i]),
            }
        )

    out_df = pd.DataFrame(out_rows).sort_values(["race_id", "finish_position", "horse_id"])
    save_csv(out_df, output_csv)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="元の成績CSV")
    parser.add_argument("--output", default=str(OUTPUT_RESULTS), help="出力先")
    parser.add_argument("--debug-columns", action="store_true")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    df = pd.read_csv(input_path)
    if args.debug_columns:
        debug_columns(df, "results_input")
        return

    convert_results(input_path, output_path)


if __name__ == "__main__":
    main()