from pathlib import Path
import joblib
import pandas as pd
from lightgbm import LGBMClassifier

PROCESSED_DIR = Path("data/processed")
MODELS_DIR = Path("models")

FEATURE_COLS = [
    "gate_no",
    "horse_no",
    "age",
    "assigned_weight",
    "horse_weight",
    "horse_weight_diff",
    "popularity",
    "morning_line_odds",
    "prev_finish_position",
    "prev_popularity",
    "prev_final_odds",
    "prev_distance",
    "avg_finish_last3",
    "avg_popularity_last3",
    "avg_odds_last3",
    "past_race_count",
    "past_win_count",
    "past_top2_count",
    "past_top3_count",
    "past_win_rate",
    "past_top2_rate",
    "past_top3_rate",
    "popularity_rank_in_race",
    "morning_odds_rank_in_race",
    "horse_weight_diff_from_race_mean",
    "assigned_weight_diff_from_race_mean",
    "past_win_rate_rank_in_race",
    "past_top2_rate_rank_in_race",
    "past_top3_rate_rank_in_race",
    "distance",
    "field_size",
]

CAT_COLS = ["surface", "venue", "jockey_name"]


def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(PROCESSED_DIR / "features.csv")
    train_df = df[df["target_top3"].notna()].copy()

    X = train_df[FEATURE_COLS + CAT_COLS].copy()
    y = train_df["target_top3"].astype(int)

    for col in CAT_COLS:
        X[col] = X[col].astype("category")

    model = LGBMClassifier(
        n_estimators=200,
        learning_rate=0.05,
        num_leaves=15,
        random_state=42,
        objective="binary",
        class_weight="balanced",
    )

    model.fit(X, y, categorical_feature=CAT_COLS)

    joblib.dump(
        {
            "model": model,
            "feature_cols": FEATURE_COLS,
            "cat_cols": CAT_COLS,
        },
        MODELS_DIR / "top3_model.pkl",
    )

    print("saved:", MODELS_DIR / "top3_model.pkl")


if __name__ == "__main__":
    main()