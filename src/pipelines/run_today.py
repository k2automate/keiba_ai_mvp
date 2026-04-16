from __future__ import annotations

from pathlib import Path
import argparse
import joblib
import pandas as pd

from src.inference.postprocess import add_ranks, add_confidence, add_signal, build_race_predictions

PROCESSED_DIR = Path("data/processed")
PREDICTIONS_DIR = Path("data/predictions")
MODELS_DIR = Path("models")


def load_bundle(name: str):
    return joblib.load(MODELS_DIR / name)


def prepare_inference_frame(target_date: str) -> pd.DataFrame:
    df = pd.read_csv(PROCESSED_DIR / "features.csv")
    df["race_date"] = pd.to_datetime(df["race_date"]).dt.strftime("%Y-%m-%d")
    return df[df["race_date"] == target_date].copy()


def predict_with_bundle(df: pd.DataFrame, bundle_path: str, proba: bool = True) -> pd.Series:
    bundle = load_bundle(bundle_path)
    model = bundle["model"]
    feature_cols = bundle["feature_cols"]
    cat_cols = bundle["cat_cols"]

    X = df[feature_cols + cat_cols].copy()
    for col in cat_cols:
        X[col] = X[col].astype("category")

    if proba:
        return pd.Series(model.predict_proba(X)[:, 1], index=df.index)
    return pd.Series(model.predict(X), index=df.index)


def smooth_probs_by_race(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    df["win_prob"] = df["win_prob"].clip(0.02, 0.95)
    df["top2_prob"] = df["top2_prob"].clip(0.03, 0.97)
    df["top3_prob"] = df["top3_prob"].clip(0.05, 0.98)

    df["win_prob"] = df.groupby("race_id")["win_prob"].transform(
        lambda s: s / s.sum() if s.sum() > 0 else s
    )

    df["top2_prob"] = df[["top2_prob", "win_prob"]].max(axis=1)
    df["top3_prob"] = df[["top3_prob", "top2_prob"]].max(axis=1)

    df["top2_prob"] = df["top2_prob"].clip(upper=0.97)
    df["top3_prob"] = df["top3_prob"].clip(upper=0.98)

    return df


def build_summary_tables(horse_out: pd.DataFrame, race_out: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    merged = horse_out.merge(
        race_out[["race_id", "chaos_score", "chaos_band"]],
        on="race_id",
        how="left",
    )

    summary_signal = merged.sort_values(
        ["race_date", "venue", "race_no", "signal_priority", "confidence_raw", "win_prob"],
        ascending=[True, True, True, True, False, False],
    ).copy()

    summary_ability = merged.sort_values(
        ["race_date", "venue", "race_no", "ability_score", "win_prob"],
        ascending=[True, True, True, False, False],
    ).copy()

    summary_confidence = merged.sort_values(
        ["race_date", "venue", "race_no", "confidence_raw", "win_prob"],
        ascending=[True, True, True, False, False],
    ).copy()

    return summary_signal, summary_ability, summary_confidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    args = parser.parse_args()

    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)

    df = prepare_inference_frame(args.date)
    if df.empty:
        raise ValueError(f"No rows found for date={args.date}. Check features.csv.")

    df["win_prob"] = predict_with_bundle(df, "win_model.pkl", proba=True)
    df["top2_prob"] = predict_with_bundle(df, "top2_model.pkl", proba=True)
    df["top3_prob"] = predict_with_bundle(df, "top3_model.pkl", proba=True)
    df["ability_score"] = predict_with_bundle(df, "ability_model.pkl", proba=False)

    df = smooth_probs_by_race(df)
    df = add_ranks(df)
    df = add_confidence(df)
    df = add_signal(df)

    horse_out = df[
        [
            "race_id",
            "race_date",
            "venue",
            "race_no",
            "race_name",
            "horse_id",
            "horse_name",
            "jockey_name",
            "gate_no",
            "horse_no",
            "win_prob",
            "top2_prob",
            "top3_prob",
            "ability_score",
            "win_rank",
            "top2_rank",
            "top3_rank",
            "ability_rank",
            "confidence_raw",
            "confidence_label",
            "signal",
            "signal_priority",
        ]
    ].copy()

    horse_out["win_prob"] = horse_out["win_prob"].round(4)
    horse_out["top2_prob"] = horse_out["top2_prob"].round(4)
    horse_out["top3_prob"] = horse_out["top3_prob"].round(4)
    horse_out["ability_score"] = horse_out["ability_score"].round(2)
    horse_out["confidence_raw"] = horse_out["confidence_raw"].round(2)

    race_out = build_race_predictions(df)

    summary_signal, summary_ability, summary_confidence = build_summary_tables(horse_out, race_out)

    horse_out.to_csv(PREDICTIONS_DIR / "horse_predictions.csv", index=False)
    race_out.to_csv(PREDICTIONS_DIR / "race_predictions.csv", index=False)
    summary_signal.to_csv(PREDICTIONS_DIR / "summary_signal.csv", index=False)
    summary_ability.to_csv(PREDICTIONS_DIR / "summary_ability.csv", index=False)
    summary_confidence.to_csv(PREDICTIONS_DIR / "summary_confidence.csv", index=False)

    print("saved:", PREDICTIONS_DIR / "horse_predictions.csv")
    print("saved:", PREDICTIONS_DIR / "race_predictions.csv")
    print("saved:", PREDICTIONS_DIR / "summary_signal.csv")
    print("saved:", PREDICTIONS_DIR / "summary_ability.csv")
    print("saved:", PREDICTIONS_DIR / "summary_confidence.csv")


if __name__ == "__main__":
    main()