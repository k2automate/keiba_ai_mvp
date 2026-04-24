import { useEffect, useMemo, useState } from "react";

type RaceListRow = {
  race_id: string;
  race_name: string;
  race_date: string;
  venue: string;
  race_no: number;
  field_size: number;
  chaos_band: string;
  pred_top_horse: string;
  pred_top_signal: string;
  pred_top_confidence: string;
  pred_top_ability: number;
  distance?: string;
};

type RaceDetailRow = {
  race_id: string;
  race_name: string;
  win_rank: number;
  rank_in_race?: number;
  calculated_rank?: number;
  gate_no: number;
  horse_no: number;
  horse_name: string;
  jockey_name: string;
  signal: string;
  印?: string;
  mark?: string;
  recommendation?: string;
  confidence_label: string;
  ability_score: number;
  win_prob: number;
  top3_prob: number;
  win_odds?: number;
  win_ev?: number;
};

type FinalBetPlanRow = {
  race_id: string;
  race_name: string;
  horse_name: string;
  horse_no?: number;
  signal: string;
  confidence_label: string;
  win_prob: number;
  win_odds?: number;
  win_ev: number;
  bet_percent?: number;
  bet_grade?: string;
  action?: string;
  reason: string;
};

type FinalMultiBetsRow = {
  race_id: string;
  race_name: string;
  bet_type: string;
  axis_horse: string;
  bets: string;
  comment?: string;
};

type BetAmountsRow = {
  race_id: string;
  race_name?: string;
  bet_type: string;
  axis_horse?: string;
  bet: string;
  amount?: number;
  amount_percent?: number;
};

const ADMIN_PASSWORD = "keiba-admin";

function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function chaosLabel(c: string) {
  if ((c || "").includes("やや荒れ") || (c || "").includes("荒れ")) return "波乱含み";
  if ((c || "").includes("中間")) return "実力通り";
  return c || "実力通り";
}

function venueLabel(v: string) {
  if (v === "FUKUSHIMA") return "福島";
  if (v === "HANSHIN") return "阪神";
  if (v === "NAKAYAMA") return "中山";
  if (v === "TOKYO") return "東京";
  if (v === "KYOTO") return "京都";
  if (v === "CHUKYO") return "中京";
  if (v === "NIIGATA") return "新潟";
  if (v === "SAPPORO") return "札幌";
  if (v === "HAKODATE") return "函館";
  if (v === "KOKURA") return "小倉";
  return v;
}

function getWakuBgColor(gateNo: number) {
  const colors: Record<number, string> = {
    1: "#FFFFFF",
    2: "#111111",
    3: "#FF3B3B",
    4: "#3B3BFF",
    5: "#FFEB3B",
    6: "#4CAF50",
    7: "#FF9800",
    8: "#FF80AB",
  };
  return colors[gateNo] || "rgba(255,255,255,0.08)";
}

function getWakuTextColor(gateNo: number) {
  return gateNo === 1 || gateNo === 5 ? "#111111" : "#FFFFFF";
}

function cleanSignal(signal: string | undefined | null) {
  return String(signal || "").trim();
}

function signalColor(signal: string) {
  const s = cleanSignal(signal);

  if (s === "軸") return "#f4d84e";
  if (s === "対抗") return "#86f7f2";
  if (s === "穴") return "#ff9f43";
  if (s === "連下") return "#7dd3fc";

  if (s === "複勝圏") return "#86f7f2";
  if (s === "能力注") return "#d8b4fe";

  return "#bfd6ff";
}

function signalLabel(signal: string) {
  const s = cleanSignal(signal);

  if (s === "軸") return "◎ 軸";
  if (s === "対抗") return "○ 対抗";
  if (s === "穴") return "▲ 穴";
  if (s === "連下") return "△ 連下";

  if (s === "複勝圏") return "○ 複勝圏";
  if (s === "能力注") return "▲ 注目";

  return "△ 様子見";
}

function confidenceBg(conf: string) {
  if (conf === "S") return "rgba(244,216,78,0.18)";
  if (conf === "A") return "rgba(134,247,242,0.18)";
  if (conf === "B") return "rgba(216,180,254,0.18)";
  if (conf === "C") return "rgba(255,140,140,0.18)";
  return "rgba(191,214,255,0.16)";
}

function confidenceText(conf: string) {
  if (conf === "S") return "#f4d84e";
  if (conf === "A") return "#86f7f2";
  if (conf === "B") return "#d8b4fe";
  if (conf === "C") return "#ff8c8c";
  return "#fff";
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }

  out.push(cur);
  return out;
}

function parseCsvText(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((x) => x.trim() !== "");

  if (lines.length === 0) return [] as Record<string, string>[];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    return row;
  });
}

async function loadCsv<T>(path: string): Promise<T[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to fetch: ${path}`);
  const text = await res.text();
  return parseCsvText(text) as T[];
}

function FileLoader({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#aab4d6" }}>
      <span>{label}</span>
      <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

function SmallBadge({
  children,
  bg,
  color,
}: {
  children: React.ReactNode;
  bg: string;
  color: string;
}) {
  return (
    <span
      style={{
        background: bg,
        color,
        borderRadius: 999,
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 800,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </span>
  );
}

function readCsvFile<T>(file: File, onDone: (rows: T[]) => void) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    onDone(parseCsvText(text) as T[]);
  };
  reader.readAsText(file, "utf-8");
}

function StatBar({
  label,
  value,
  width,
  color,
  isMobile,
}: {
  label: string;
  value: string;
  width: string;
  color: string;
  isMobile: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: isMobile ? 11 : 12, color: "#aab4d6", marginBottom: 4 }}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: isMobile ? 13 : 14,
          color: "#eef2ff",
          marginBottom: 6,
          fontWeight: 800,
        }}
      >
        <span>{value}</span>
      </div>
      <div
        style={{
          height: isMobile ? 8 : 10,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width,
            height: "100%",
            borderRadius: 999,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function App() {
  const [raceListView, setRaceListView] = useState<RaceListRow[]>([]);
  const [raceDetailView, setRaceDetailView] = useState<RaceDetailRow[]>([]);
  const [finalBetPlan, setFinalBetPlan] = useState<FinalBetPlanRow[]>([]);
  const [finalMultiBets, setFinalMultiBets] = useState<FinalMultiBetsRow[]>([]);
  const [betAmounts, setBetAmounts] = useState<BetAmountsRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showTopOnly, setShowTopOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"rank" | "ability" | "win" | "top3" | "horse_no">("rank");
  const [mainTab, setMainTab] = useState<"list" | "summary" | "results">("list");
  const [detailTab, setDetailTab] = useState<"pred" | "bets">("pred");
  const [selectedVenue, setSelectedVenue] = useState<string>("");
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setLoadError("");

        const ts = Date.now();
        const raceListRows = await loadCsv<RaceListRow>(`/data/race_list_view.csv?t=${ts}`);
        const raceDetailRows = await loadCsv<RaceDetailRow>(`/data/race_detail_view.csv?t=${ts}`);
        const finalBetRows = await loadCsv<FinalBetPlanRow>(`/data/final_bet_plan.csv?t=${ts}`);
        const finalMultiRows = await loadCsv<FinalMultiBetsRow>(`/data/final_multi_bets.csv?t=${ts}`);
        const betAmountRows = await loadCsv<BetAmountsRow>(`/data/bet_amounts.csv?t=${ts}`);

        const normalizedRaceList = raceListRows.map((r: any) => ({
          ...r,
          race_no: toNum(r.race_no),
          field_size: toNum(r.field_size),
          pred_top_ability: toNum(r.pred_top_ability),
        }));

        const normalizedRaceDetail = raceDetailRows.map((r: any) => ({
          ...r,
          win_rank: toNum(r.win_rank),
          rank_in_race: toNum(r.rank_in_race),
          gate_no: toNum(r.gate_no),
          horse_no: toNum(r.horse_no),
          signal: cleanSignal(r.signal || r.印 || r.mark || r.recommendation),
          ability_score: toNum(r.ability_score),
          win_prob: toNum(r.win_prob),
          top3_prob: toNum(r.top3_prob),
          win_odds: toNum(r.win_odds),
          win_ev: toNum(r.win_ev),
        }));

        const normalizedFinalBet = finalBetRows.map((r: any) => ({
          ...r,
          horse_no: toNum(r.horse_no),
          signal: cleanSignal(r.signal || r.印 || r.mark || r.recommendation),
          win_prob: toNum(r.win_prob),
          win_odds: toNum(r.win_odds),
          win_ev: toNum(r.win_ev),
          bet_percent: toNum(r.bet_percent || r.bet_ratio),
        }));

        const normalizedBetAmounts = betAmountRows.map((r: any) => ({
          ...r,
          amount: toNum(r.amount),
          amount_percent: toNum(r.amount_percent || r.bet_percent),
        }));

        setRaceListView(normalizedRaceList);
        setRaceDetailView(normalizedRaceDetail);
        setFinalBetPlan(normalizedFinalBet);
        setFinalMultiBets(finalMultiRows);
        setBetAmounts(normalizedBetAmounts);

        if (normalizedRaceList.length > 0) {
          setSelectedVenue(normalizedRaceList[0].venue);
          setSelectedRaceId(normalizedRaceList[0].race_id);
        }
      } catch (e) {
        console.error(e);
        setLoadError("CSVの読込に失敗しました。ui/public/data にCSVがあるか確認してください。");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  const venues = Array.from(new Set(raceListView.map((r) => r.venue)));

  const venueRaces = useMemo(() => {
    return raceListView
      .filter((r) => r.venue === selectedVenue)
      .sort((a, b) => toNum(a.race_no) - toNum(b.race_no));
  }, [raceListView, selectedVenue]);

  const selectedRace = useMemo(() => {
    return venueRaces.find((r) => r.race_id === selectedRaceId) ?? venueRaces[0];
  }, [venueRaces, selectedRaceId]);

  const selectedRaceIndex = useMemo(() => {
    return venueRaces.findIndex((r) => r.race_id === selectedRace?.race_id);
  }, [venueRaces, selectedRace]);

  const nextRace = useMemo(() => {
    if (selectedRaceIndex < 0) return undefined;
    return venueRaces[selectedRaceIndex + 1];
  }, [venueRaces, selectedRaceIndex]);

  const details = useMemo(() => {
    const rows = raceDetailView.filter((x) => x.race_id === selectedRace?.race_id);

    const rankedRows = [...rows]
      .sort((a, b) => {
        const ar = toNum(a.rank_in_race);
        const br = toNum(b.rank_in_race);

        if (ar > 0 && br > 0) return ar - br;
        return toNum(b.ability_score) - toNum(a.ability_score);
      })
      .map((r, i) => ({
        ...r,
        calculated_rank: toNum(r.rank_in_race) > 0 ? toNum(r.rank_in_race) : i + 1,
      }));

    const sorted = [...rankedRows].sort((a, b) => {
      if (sortMode === "ability") return toNum(b.ability_score) - toNum(a.ability_score);
      if (sortMode === "win") return toNum(b.win_prob) - toNum(a.win_prob);
      if (sortMode === "top3") return toNum(b.top3_prob) - toNum(a.top3_prob);
      if (sortMode === "horse_no") return toNum(a.horse_no) - toNum(b.horse_no);
      return toNum(a.calculated_rank) - toNum(b.calculated_rank);
    });

    return sorted;
  }, [raceDetailView, selectedRace, sortMode]);

  const betPlan = finalBetPlan.filter((x) => x.race_id === selectedRace?.race_id);
  const multiBets = finalMultiBets.filter((x) => x.race_id === selectedRace?.race_id);
  const amounts = betAmounts.filter((x) => x.race_id === selectedRace?.race_id);

  const adminSubmit = () => {
    if (password === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setPasswordError("");
    } else {
      setPasswordError("パスワードが違います");
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #11152d 0%, #161b38 100%)",
          color: "#fff",
          padding: 24,
        }}
      >
        データ読込中...
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #11152d 0%, #161b38 100%)",
          color: "#fff",
          padding: 24,
        }}
      >
        {loadError}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #11152d 0%, #161b38 100%)",
        color: "#eef2ff",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #0f1f67 0%, #5b1c74 100%)",
          color: "#fff",
          padding: isMobile ? "18px 14px 16px" : "28px 20px 22px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800 }}>競馬AI</div>
          <div style={{ fontSize: isMobile ? 10 : 12, letterSpacing: 2, marginTop: 4, color: "#d7ddff" }}>
            HORSE RACING PREDICTOR
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            {[
              ["list", "レース一覧"],
              ["summary", "詳細予想"],
              ["results", "結果"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMainTab(key as "list" | "summary" | "results")}
                style={{
                  flex: 1,
                  border: mainTab === key ? "1px solid rgba(244,216,78,0.8)" : "1px solid rgba(255,255,255,0.15)",
                  background: mainTab === key ? "rgba(244,216,78,0.10)" : "rgba(255,255,255,0.04)",
                  color: "#fff",
                  borderRadius: 16,
                  padding: isMobile ? "12px 8px" : "14px 12px",
                  fontWeight: 800,
                  fontSize: isMobile ? 14 : 16,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? 12 : 20, display: "grid", gap: 16 }}>
        <div
          style={{
            background: "rgba(18,24,52,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {venues.map((venue) => (
              <button
                key={venue}
                onClick={() => {
                  setSelectedVenue(venue);
                  setSelectedRaceId("");
                }}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: selectedVenue === venue ? "rgba(87,183,255,0.18)" : "rgba(255,255,255,0.04)",
                  color: "#fff",
                  borderRadius: 14,
                  padding: isMobile ? "10px 14px" : "12px 18px",
                  fontWeight: 800,
                  fontSize: isMobile ? 14 : 15,
                  cursor: "pointer",
                }}
              >
                {venueLabel(venue)}
              </button>
            ))}

            {mainTab === "summary" && nextRace && (
              <button
                onClick={() => setSelectedRaceId(nextRace.race_id)}
                style={{
                  marginLeft: isMobile ? 0 : "auto",
                  border: "1px solid rgba(244,216,78,0.35)",
                  background: "rgba(244,216,78,0.10)",
                  color: "#fff3a6",
                  borderRadius: 14,
                  padding: isMobile ? "10px 14px" : "12px 18px",
                  fontWeight: 800,
                  fontSize: isMobile ? 14 : 15,
                  cursor: "pointer",
                }}
              >
                次R ▶︎ {nextRace.race_no}R
              </button>
            )}
          </div>
        </div>

        {mainTab === "list" && (
          <div style={{ display: "grid", gap: 16 }}>
            {venueRaces.map((race) => {
              const listRows = raceDetailView
                .filter((x) => x.race_id === race.race_id)
                .sort((a, b) => {
                  const ar = toNum(a.rank_in_race);
                  const br = toNum(b.rank_in_race);
                  if (ar > 0 && br > 0) return ar - br;
                  return toNum(b.ability_score) - toNum(a.ability_score);
                })
                .slice(0, 5);

              return (
                <button
                  key={race.race_id}
                  onClick={() => {
                    setSelectedRaceId(race.race_id);
                    setMainTab("summary");
                    setDetailTab("pred");
                  }}
                  style={{
                    width: "100%",
                    background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)",
                    border:
                      race.race_id === selectedRace?.race_id
                        ? "1px solid rgba(244,216,78,0.8)"
                        : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 24,
                    overflow: "hidden",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "stretch" }}>
                    <div
                      style={{
                        width: isMobile ? 72 : 88,
                        background: "linear-gradient(180deg, #101d67 0%, #0d1749 100%)",
                        color: "#fff",
                        padding: isMobile ? "14px 8px" : "18px 10px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <div style={{ fontSize: isMobile ? 26 : 34, fontWeight: 800, lineHeight: 1 }}>
                        {race.race_no}R
                      </div>
                      <div style={{ fontSize: isMobile ? 12 : 13, opacity: 0.9 }}>{race.field_size}頭</div>
                    </div>

                    <div style={{ flex: 1, padding: isMobile ? 14 : 18 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: isMobile ? 12 : 13, color: "#9aa7cf" }}>
                            {venueLabel(race.venue)} / {race.distance || "-"} / {race.field_size}頭
                          </div>
                          <div style={{ marginTop: 4, fontSize: isMobile ? 18 : 20, fontWeight: 900, color: "#ffffff" }}>
                            {venueLabel(race.venue)}
                            {race.race_no}R {race.race_name}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <SmallBadge bg={confidenceBg(race.pred_top_confidence)} color={confidenceText(race.pred_top_confidence)}>
                            信頼度 {race.pred_top_confidence}
                          </SmallBadge>
                          <SmallBadge bg="rgba(255,255,255,0.08)" color="#fff">
                            {chaosLabel(race.chaos_band)}
                          </SmallBadge>
                        </div>
                      </div>

                      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                        {listRows.map((row) => (
                          <div
                            key={`${row.race_id}-${row.horse_no}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: isMobile
                                ? "32px minmax(0, 1.8fr) 70px 56px minmax(90px, 1fr)"
                                : "40px minmax(0, 2fr) 90px 74px minmax(140px, 1fr)",
                              alignItems: "center",
                              gap: isMobile ? 8 : 12,
                            }}
                          >
                            <div
                              style={{
                                width: isMobile ? 28 : 32,
                                height: isMobile ? 28 : 32,
                                borderRadius: 999,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: getWakuBgColor(row.gate_no),
                                color: getWakuTextColor(row.gate_no),
                                border: row.gate_no === 1 ? "1px solid #ccc" : "none",
                                fontWeight: 800,
                                fontSize: isMobile ? 12 : 14,
                              }}
                            >
                              {row.horse_no}
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: isMobile ? 14 : 16,
                                  fontWeight: 800,
                                  color: "#eef2ff",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {row.horse_name}
                              </div>
                            </div>

                            <SmallBadge bg="rgba(255,255,255,0.08)" color={signalColor(row.signal)}>
                              {signalLabel(row.signal)}
                            </SmallBadge>

                            <div
                              style={{
                                fontSize: isMobile ? 14 : 16,
                                fontWeight: 900,
                                color: row.ability_score >= 80 ? "#FFD700" : signalColor(row.signal),
                                textShadow: row.ability_score >= 80 ? "0 0 10px rgba(255, 215, 0, 0.5)" : "none",
                                textAlign: "right",
                              }}
                            >
                              {row.ability_score.toFixed(1)}
                            </div>

                            <div
                              style={{
                                height: isMobile ? 10 : 12,
                                background: "rgba(255,255,255,0.08)",
                                borderRadius: 999,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(row.ability_score, 100)}%`,
                                  height: "100%",
                                  borderRadius: 999,
                                  background: row.ability_score >= 80 ? "#FFD700" : signalColor(row.signal),
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {mainTab === "summary" && selectedRace && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {[
                ["pred", "評価"],
                ["bets", "推奨馬券"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDetailTab(key as "pred" | "bets")}
                  style={{
                    border: detailTab === key ? "1px solid rgba(244,216,78,0.8)" : "1px solid rgba(255,255,255,0.12)",
                    background: detailTab === key ? "rgba(244,216,78,0.12)" : "rgba(255,255,255,0.04)",
                    color: detailTab === key ? "#fff3a6" : "#d7ddff",
                    borderRadius: 999,
                    padding: isMobile ? "10px 14px" : "12px 18px",
                    fontWeight: 800,
                    fontSize: isMobile ? 14 : 15,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}

              {detailTab === "pred" && (
                <>
                  {[
                    ["rank", "予測順"],
                    ["ability", "AI指数順"],
                    ["win", "勝率順"],
                    ["top3", "3着内率順"],
                    ["horse_no", "馬番順"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSortMode(key as "rank" | "ability" | "win" | "top3" | "horse_no")}
                      style={{
                        border: sortMode === key ? "1px solid rgba(244,216,78,0.8)" : "1px solid rgba(255,255,255,0.12)",
                        background: sortMode === key ? "rgba(244,216,78,0.12)" : "rgba(255,255,255,0.04)",
                        color: sortMode === key ? "#fff3a6" : "#d7ddff",
                        borderRadius: 999,
                        padding: isMobile ? "8px 12px" : "10px 14px",
                        fontWeight: 700,
                        fontSize: isMobile ? 12 : 13,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}

                  <button
                    onClick={() => setShowTopOnly((v) => !v)}
                    style={{
                      marginLeft: "auto",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#d7ddff",
                      borderRadius: 999,
                      padding: isMobile ? "8px 12px" : "10px 14px",
                      fontWeight: 700,
                      fontSize: isMobile ? 12 : 13,
                      cursor: "pointer",
                    }}
                  >
                    {showTopOnly ? "全頭表示" : "上位5頭だけ表示"}
                  </button>
                </>
              )}
            </div>

            {detailTab === "pred" && (
              <div
                style={{
                  background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 24,
                  padding: isMobile ? 14 : 20,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: isMobile ? 28 : 34, fontWeight: 900, color: "#ffffff" }}>
                      {venueLabel(selectedRace.venue)}
                      {selectedRace.race_no}R {selectedRace.race_name}
                    </div>
                    <div style={{ marginTop: 6, color: "#aab4d6", fontSize: isMobile ? 14 : 16 }}>
                      {selectedRace.distance || "-"} / {selectedRace.field_size}頭 / 傾向 : {chaosLabel(selectedRace.chaos_band)}
                    </div>
                  </div>
                  <SmallBadge bg={confidenceBg(selectedRace.pred_top_confidence)} color={confidenceText(selectedRace.pred_top_confidence)}>
                    信頼度 {selectedRace.pred_top_confidence}
                  </SmallBadge>
                </div>

                <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
                  {(showTopOnly ? details.slice(0, 5) : details).map((h) => (
                    <div
                      key={`${h.race_id}-${h.horse_no}`}
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        borderRadius: 18,
                        padding: isMobile ? 14 : 16,
                        display: "grid",
                        gridTemplateColumns: isMobile
                          ? "52px minmax(0, 1.7fr) 78px 1fr"
                          : "70px minmax(0, 2fr) 120px 280px",
                        gap: isMobile ? 10 : 14,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: isMobile ? 46 : 54,
                          height: isMobile ? 46 : 54,
                          borderRadius: 999,
                          background: getWakuBgColor(h.gate_no),
                          color: getWakuTextColor(h.gate_no),
                          border: h.gate_no === 1 ? "1px solid #ccc" : "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          fontSize: isMobile ? 18 : 20,
                        }}
                      >
                        {h.horse_no}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: isMobile ? 15 : 22,
                            fontWeight: 900,
                            color: "#ffffff",
                            lineHeight: 1.3,
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {h.horse_name}
                        </div>

                        <div style={{ color: "#aab4d6", marginTop: 6, fontSize: isMobile ? 12 : 14 }}>
                          {h.jockey_name} / 枠{h.gate_no} / 予測{h.calculated_rank}位
                        </div>

                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {h.confidence_label && (
                            <SmallBadge bg={confidenceBg(h.confidence_label)} color={confidenceText(h.confidence_label)}>
                              信頼度 {h.confidence_label}
                            </SmallBadge>
                          )}
                          <SmallBadge bg="rgba(255,255,255,0.08)" color={signalColor(h.signal)}>
                            {signalLabel(h.signal)}
                          </SmallBadge>
                        </div>
                      </div>

                      <div style={{ display: "grid", justifyItems: "center", gap: 2 }}>
                        <div
                          style={{
                            fontSize: isMobile ? 24 : 40,
                            fontWeight: 900,
                            color: h.ability_score >= 80 ? "#FFD700" : signalColor(h.signal),
                            textShadow: h.ability_score >= 80 ? "0 0 12px rgba(255, 215, 0, 0.5)" : "none",
                            lineHeight: 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h.ability_score.toFixed(1)}
                        </div>
                        <div style={{ fontSize: isMobile ? 11 : 12, color: "#aab4d6" }}>AI指数</div>
                      </div>

                      <div style={{ display: "grid", gap: 12 }}>
                        <StatBar
                          label="勝率"
                          value={pct(h.win_prob)}
                          width={`${Math.min(h.win_prob * 100, 100)}%`}
                          color={h.ability_score >= 80 ? "#FFD700" : signalColor(h.signal)}
                          isMobile={isMobile}
                        />
                        <StatBar
                          label="3着内率"
                          value={pct(h.top3_prob)}
                          width={`${Math.min(h.top3_prob * 100, 100)}%`}
                          color="#bfd6ff"
                          isMobile={isMobile}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailTab === "bets" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 0.9fr) minmax(0, 1.3fr)",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 24,
                    padding: isMobile ? 16 : 20,
                  }}
                >
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "#ffe98c" }}>期待値推奨馬</div>
                  <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                    {betPlan.length === 0 && <div style={{ color: "#aab4d6" }}>該当なし</div>}

                    {betPlan.map((b) => (
                      <div
                        key={b.horse_name}
                        style={{
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                          borderRadius: 18,
                          padding: isMobile ? 14 : 16,
                        }}
                      >
                        <div
                          style={{
                            fontSize: isMobile ? 18 : 22,
                            fontWeight: 900,
                            color: "#fff",
                            lineHeight: 1.3,
                            wordBreak: "break-word",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {b.horse_no ? `${b.horse_no} ${b.horse_name}` : b.horse_name}
                        </div>

                        <div style={{ color: "#aab4d6", marginTop: 4, fontSize: isMobile ? 13 : 14 }}>{b.race_name}</div>

                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <SmallBadge bg="rgba(255,255,255,0.08)" color={signalColor(b.signal)}>
                            {signalLabel(b.signal)}
                          </SmallBadge>
                          <SmallBadge bg={confidenceBg(b.confidence_label)} color={confidenceText(b.confidence_label)}>
                            信頼度 {b.confidence_label}
                          </SmallBadge>
                          <SmallBadge bg="rgba(134,247,242,0.14)" color="#86f7f2">
                            期待値 {b.win_ev}
                          </SmallBadge>
                        </div>

                        <div style={{ marginTop: 12, fontSize: isMobile ? 13 : 14, color: "#d7ddff", lineHeight: 1.8 }}>
                          <div>
                            勝率: <b>{pct(b.win_prob)}</b>
                          </div>
                          <div style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                            理由: <b>{b.reason}</b>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 24,
                    padding: isMobile ? 16 : 20,
                  }}
                >
                  <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: "#ffe98c" }}>推奨馬券</div>

                  <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                    {multiBets.length === 0 && <div style={{ color: "#aab4d6" }}>該当なし</div>}

                    {multiBets.map((bet) => {
                      const amountRows = amounts.filter((x) => x.bet_type === bet.bet_type);
                      const typeBg =
                        bet.bet_type === "ワイド"
                          ? "rgba(134,247,242,0.10)"
                          : bet.bet_type === "馬連"
                            ? "rgba(244,216,78,0.10)"
                            : "rgba(216,180,254,0.10)";
                      const typeColor =
                        bet.bet_type === "ワイド"
                          ? "#86f7f2"
                          : bet.bet_type === "馬連"
                            ? "#f4d84e"
                            : "#d8b4fe";

                      return (
                        <div
                          key={bet.bet_type}
                          style={{
                            border: `1px solid ${typeColor}33`,
                            background: typeBg,
                            borderRadius: 18,
                            padding: isMobile ? 14 : 16,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: isMobile ? 16 : 18,
                              color: typeColor,
                              lineHeight: 1.35,
                              wordBreak: "break-word",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {bet.bet_type} / 軸: {bet.axis_horse}
                          </div>

                          {bet.comment && (
                            <div style={{ marginTop: 8, fontSize: isMobile ? 12 : 13, color: "#d7ddff" }}>{bet.comment}</div>
                          )}

                          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                            {bet.bets.split(" / ").map((b, idx) => {
                              const row = amountRows.find((x) => x.bet.trim() === b.trim());
                              return (
                                <div
                                  key={idx}
                                  style={{
                                    background: "rgba(255,255,255,0.04)",
                                    borderRadius: 12,
                                    padding: isMobile ? "10px 12px" : "12px 14px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: 12,
                                    fontSize: isMobile ? 13 : 14,
                                    color: "#eef2ff",
                                  }}
                                >
                                  <span
                                    style={{
                                      flex: 1,
                                      wordBreak: "break-word",
                                      overflowWrap: "anywhere",
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    {b.trim()}
                                  </span>
                                  <b style={{ color: typeColor, whiteSpace: "nowrap" }}>
                                    {row?.amount_percent ? `${row.amount_percent}%` : row?.amount ? `${row.amount}円` : "-"}
                                  </b>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {mainTab === "results" && (
          <div
            style={{
              background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: 24,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>結果</div>
            <div style={{ color: "#aab4d6", marginTop: 8 }}>
              ここは後で daily_result_view.csv と race_result_view.csv をつないで表示。
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <button
            onClick={() => setAdminOpen((v) => !v)}
            style={{
              justifySelf: "start",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              color: "#d7ddff",
              borderRadius: 14,
              padding: "10px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            管理人専用
          </button>

          {adminOpen && (
            <div
              style={{
                background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 20,
                padding: 16,
                display: "grid",
                gap: 14,
              }}
            >
              {!adminUnlocked ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#eef2ff" }}>パスワード入力</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type="password"
                      placeholder="管理人パスワード"
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#fff",
                        borderRadius: 12,
                        padding: "10px 12px",
                        minWidth: 260,
                      }}
                    />
                    <button
                      onClick={adminSubmit}
                      style={{
                        border: "none",
                        background: "#0f1f67",
                        color: "#fff",
                        borderRadius: 12,
                        padding: "10px 16px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      開く
                    </button>
                  </div>
                  {passwordError && <div style={{ color: "#ff8c8c", fontSize: 13 }}>{passwordError}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#eef2ff" }}>CSVアップロード</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))", gap: 12 }}>
                    <FileLoader
                      label="race_list_view.csv"
                      onFile={(file) =>
                        readCsvFile<RaceListRow>(file, (rows) =>
                          setRaceListView(
                            rows.map((r: any) => ({
                              ...r,
                              race_no: toNum(r.race_no),
                              field_size: toNum(r.field_size),
                              pred_top_ability: toNum(r.pred_top_ability),
                            })),
                          ),
                        )
                      }
                    />
                    <FileLoader
                      label="race_detail_view.csv"
                      onFile={(file) =>
                        readCsvFile<RaceDetailRow>(file, (rows) =>
                          setRaceDetailView(
                            rows.map((r: any) => ({
                              ...r,
                              win_rank: toNum(r.win_rank),
                              rank_in_race: toNum(r.rank_in_race),
                              gate_no: toNum(r.gate_no),
                              horse_no: toNum(r.horse_no),
                              signal: cleanSignal(r.signal || r.印 || r.mark || r.recommendation),
                              ability_score: toNum(r.ability_score),
                              win_prob: toNum(r.win_prob),
                              top3_prob: toNum(r.top3_prob),
                              win_odds: toNum(r.win_odds),
                              win_ev: toNum(r.win_ev),
                            })),
                          ),
                        )
                      }
                    />
                    <FileLoader
                      label="final_bet_plan.csv"
                      onFile={(file) =>
                        readCsvFile<FinalBetPlanRow>(file, (rows) =>
                          setFinalBetPlan(
                            rows.map((r: any) => ({
                              ...r,
                              horse_no: toNum(r.horse_no),
                              signal: cleanSignal(r.signal || r.印 || r.mark || r.recommendation),
                              win_prob: toNum(r.win_prob),
                              win_odds: toNum(r.win_odds),
                              win_ev: toNum(r.win_ev),
                              bet_percent: toNum(r.bet_percent || r.bet_ratio),
                            })),
                          ),
                        )
                      }
                    />
                    <FileLoader
                      label="final_multi_bets.csv"
                      onFile={(file) => readCsvFile<FinalMultiBetsRow>(file, (rows) => setFinalMultiBets(rows))}
                    />
                    <FileLoader
                      label="bet_amounts.csv"
                      onFile={(file) =>
                        readCsvFile<BetAmountsRow>(file, (rows) =>
                          setBetAmounts(
                            rows.map((r: any) => ({
                              ...r,
                              amount: toNum(r.amount),
                              amount_percent: toNum(r.amount_percent || r.bet_percent),
                            })),
                          ),
                        )
                      }
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;