from pathlib import Path
import numpy as np
import pandas as pd

RAW_DIR = Path("data/raw")
PROCESSED_DIR = Path("data/processed")


def add_past_performance_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["horse_id", "race_date"]).copy()

    df["prev_finish_position"] = df.groupby("horse_id")["finish_position"].shift(1)
    df["prev_popularity"] = df.groupby("horse_id")["final_popularity"].shift(1)
    df["prev_final_odds"] = df.groupby("horse_id")["final_odds"].shift(1)
    df["prev_distance"] = df.groupby("horse_id")["distance"].shift(1)

    df["avg_finish_last3"] = (
        df.groupby("horse_id")["finish_position"]
        .transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    )
    df["avg_popularity_last3"] = (
        df.groupby("horse_id")["final_popularity"]
        .transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    )
    df["avg_odds_last3"] = (
        df.groupby("horse_id")["final_odds"]
        .transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    )

    df["past_race_count"] = df.groupby("horse_id").cumcount()

    df["is_win_hist"] = (df["finish_position"] == 1).astype(int)
    df["past_win_count"] = (
        df.groupby("horse_id")["is_win_hist"]
        .transform(lambda s: s.shift(1).fillna(0).cumsum())
    )

    df["is_top2_hist"] = (df["finish_position"] <= 2).astype(int)
    df["past_top2_count"] = (
        df.groupby("horse_id")["is_top2_hist"]
        .transform(lambda s: s.shift(1).fillna(0).cumsum())
    )

    df["is_top3_hist"] = (df["finish_position"] <= 3).astype(int)
    df["past_top3_count"] = (
        df.groupby("horse_id")["is_top3_hist"]
        .transform(lambda s: s.shift(1).fillna(0).cumsum())
    )

    df["past_win_rate"] = np.where(
        df["past_race_count"] > 0,
        df["past_win_count"] / df["past_race_count"],
        0.0,
    )

    df["past_top2_rate"] = np.where(
        df["past_race_count"] > 0,
        df["past_top2_count"] / df["past_race_count"],
        0.0,
    )

    df["past_top3_rate"] = np.where(
        df["past_race_count"] > 0,
        df["past_top3_count"] / df["past_race_count"],
        0.0,
    )

    return df


def add_race_relative_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["popularity_rank_in_race"] = (
        df.groupby("race_id")["popularity"].rank(method="min", ascending=True)
    )
    df["morning_odds_rank_in_race"] = (
        df.groupby("race_id")["morning_line_odds"].rank(method="min", ascending=True)
    )
    df["horse_weight_diff_from_race_mean"] = (
        df["horse_weight"] - df.groupby("race_id")["horse_weight"].transform("mean")
    )
    df["assigned_weight_diff_from_race_mean"] = (
        df["assigned_weight"] - df.groupby("race_id")["assigned_weight"].transform("mean")
    )

    df["past_win_rate_rank_in_race"] = (
        df.groupby("race_id")["past_win_rate"].rank(method="min", ascending=False)
    )
    df["past_top2_rate_rank_in_race"] = (
        df.groupby("race_id")["past_top2_rate"].rank(method="min", ascending=False)
    )
    df["past_top3_rate_rank_in_race"] = (
        df.groupby("race_id")["past_top3_rate"].rank(method="min", ascending=False)
    )

    return df


def add_targets(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["target_win"] = (df["finish_position"] == 1).astype(int)
    df["target_top2"] = (df["finish_position"] <= 2).astype(int)
    df["target_top3"] = (df["finish_position"] <= 3).astype(int)

    def to_ability_score(pos):
        if pd.isna(pos):
            return np.nan
        pos = int(pos)
        if pos == 1:
            return 100.0
        if pos == 2:
            return 80.0
        if pos == 3:
            return 65.0
        if pos == 4:
            return 50.0
        if pos == 5:
            return 40.0
        return max(20.0, 35.0 - pos)

    df["target_ability"] = df["finish_position"].apply(to_ability_score)
    return df


def fill_missing(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    numeric_cols = [
        "gate_no", "horse_no", "age", "assigned_weight", "horse_weight",
        "horse_weight_diff", "popularity", "morning_line_odds",
        "prev_finish_position", "prev_popularity", "prev_final_odds",
        "prev_distance", "avg_finish_last3", "avg_popularity_last3",
        "avg_odds_last3", "past_race_count", "past_win_count",
        "past_top2_count", "past_top3_count", "past_win_rate",
        "past_top2_rate", "past_top3_rate", "popularity_rank_in_race",
        "morning_odds_rank_in_race", "horse_weight_diff_from_race_mean",
        "assigned_weight_diff_from_race_mean", "past_win_rate_rank_in_race",
        "past_top2_rate_rank_in_race", "past_top3_rate_rank_in_race",
        "distance", "field_size"
    ]

    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in numeric_cols:
        if col in df.columns:
            df[col] = df[col].fillna(-1)

    for col in ["surface", "venue", "jockey_name"]:
        if col in df.columns:
            df[col] = df[col].fillna("UNKNOWN").astype(str)

    return df


def main():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    races = pd.read_csv(RAW_DIR / "races.csv", dtype={"race_id": str})
    entries = pd.read_csv(
        RAW_DIR / "race_entries.csv",
        dtype={"race_id": str, "horse_id": str},
        low_memory=False,
    )
    results = pd.read_csv(
        RAW_DIR / "race_results.csv",
        dtype={"race_id": str, "horse_id": str},
        low_memory=False,
    )

    races["race_date"] = pd.to_datetime(
        races["race_date"],
        format="%Y-%m-%d",
        errors="coerce",
    )

    if races["race_date"].isna().any():
        bad = races[races["race_date"].isna()].head(10)
        raise ValueError(
            "races.csv の race_date に不正な日付があります。\n"
            f"{bad.to_string(index=False)}"
        )

    df = entries.merge(races, on="race_id", how="left")
    df = df.merge(results, on=["race_id", "horse_id"], how="left")

    df = add_past_performance_features(df)
    df = add_race_relative_features(df)
    df = add_targets(df)
    df = fill_missing(df)

    drop_cols = ["is_win_hist", "is_top2_hist", "is_top3_hist"]
    for col in drop_cols:
        if col in df.columns:
            df = df.drop(columns=col)

    df.to_csv(PROCESSED_DIR / "features.csv", index=False)
    print("saved:", PROCESSED_DIR / "features.csv")
    print("rows:", len(df))


if __name__ == "__main__":
    main()