import { useMemo, useState } from "react";

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
  gate_no: number;
  horse_no: number;
  horse_name: string;
  jockey_name: string;
  signal: string;
  confidence_label: string;
  ability_score: number;
  win_prob: number;
  top3_prob: number;
};

type FinalBetPlanRow = {
  race_id: string;
  race_name: string;
  horse_name: string;
  horse_no?: number;
  signal: string;
  confidence_label: string;
  win_prob: number;
  win_odds: number;
  win_ev: number;
  bet_percent: number;
  bet_grade: string;
  action: string;
  reason: string;
};

type FinalMultiBetsRow = {
  race_id: string;
  race_name: string;
  bet_type: string;
  axis_horse: string;
  bets: string;
};

type BetAmountsRow = {
  race_id: string;
  bet_type: string;
  bet: string;
  amount: number;
  amount_percent?: number;
};

const ADMIN_PASSWORD = "keiba-admin";

const fallbackRaceListView: RaceListRow[] = [
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", race_date: "2026-04-05", venue: "中山", race_no: 1, field_size: 15, chaos_band: "中間", pred_top_horse: "ニンジャトットリ", pred_top_signal: "軸", pred_top_confidence: "S", pred_top_ability: 58.3, distance: "1200m" },
  { race_id: "20260405_NAKAYAMA_02", race_name: "未勝利", race_date: "2026-04-05", venue: "中山", race_no: 2, field_size: 15, chaos_band: "中間", pred_top_horse: "ミッキーサウザンド", pred_top_signal: "軸", pred_top_confidence: "S", pred_top_ability: 68.9, distance: "1800m" },
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", race_date: "2026-04-05", venue: "阪神", race_no: 11, field_size: 15, chaos_band: "中間", pred_top_horse: "クロワデュノール", pred_top_signal: "軸", pred_top_confidence: "S", pred_top_ability: 67.67, distance: "2000m" },
  { race_id: "20260405_FUKUSHIMA_01", race_name: "未勝利", race_date: "2026-04-05", venue: "福島", race_no: 1, field_size: 14, chaos_band: "やや荒れ", pred_top_horse: "サンプルフクシマ", pred_top_signal: "軸", pred_top_confidence: "A", pred_top_ability: 55.2, distance: "1150m" },
];

const fallbackRaceDetailView: RaceDetailRow[] = [
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 1, gate_no: 3, horse_no: 6, horse_name: "ニンジャトットリ", jockey_name: "田辺裕信", signal: "軸", confidence_label: "S", ability_score: 58.3, win_prob: 0.182, top3_prob: 0.842 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 2, gate_no: 8, horse_no: 15, horse_name: "プラチナムディスク", jockey_name: "戸崎圭太", signal: "複勝圏", confidence_label: "A", ability_score: 57.3, win_prob: 0.161, top3_prob: 0.801 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 3, gate_no: 3, horse_no: 5, horse_name: "ツァレヴナ", jockey_name: "横山武史", signal: "能力注", confidence_label: "B", ability_score: 54.0, win_prob: 0.149, top3_prob: 0.772 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 4, gate_no: 7, horse_no: 12, horse_name: "キョウエイハル", jockey_name: "菅原明良", signal: "様子見", confidence_label: "C", ability_score: 51.2, win_prob: 0.121, top3_prob: 0.681 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 5, gate_no: 5, horse_no: 9, horse_name: "ロードトライデント", jockey_name: "横山和生", signal: "様子見", confidence_label: "C", ability_score: 51.2, win_prob: 0.118, top3_prob: 0.664 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 6, gate_no: 1, horse_no: 1, horse_name: "サンプルA", jockey_name: "石川裕紀", signal: "様子見", confidence_label: "D", ability_score: 49.8, win_prob: 0.109, top3_prob: 0.623 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 7, gate_no: 2, horse_no: 2, horse_name: "サンプルB", jockey_name: "大野拓弥", signal: "様子見", confidence_label: "D", ability_score: 48.6, win_prob: 0.098, top3_prob: 0.592 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 8, gate_no: 4, horse_no: 7, horse_name: "サンプルC", jockey_name: "三浦皇成", signal: "様子見", confidence_label: "D", ability_score: 47.4, win_prob: 0.091, top3_prob: 0.561 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 9, gate_no: 4, horse_no: 8, horse_name: "サンプルD", jockey_name: "津村明秀", signal: "様子見", confidence_label: "D", ability_score: 46.1, win_prob: 0.083, top3_prob: 0.533 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 10, gate_no: 5, horse_no: 10, horse_name: "サンプルE", jockey_name: "木幡巧也", signal: "様子見", confidence_label: "D", ability_score: 44.8, win_prob: 0.075, top3_prob: 0.497 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 11, gate_no: 6, horse_no: 11, horse_name: "サンプルF", jockey_name: "松岡正海", signal: "様子見", confidence_label: "D", ability_score: 43.4, win_prob: 0.063, top3_prob: 0.451 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 12, gate_no: 6, horse_no: 13, horse_name: "サンプルG", jockey_name: "柴田大知", signal: "様子見", confidence_label: "D", ability_score: 41.9, win_prob: 0.054, top3_prob: 0.418 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 13, gate_no: 7, horse_no: 14, horse_name: "サンプルH", jockey_name: "原優介", signal: "様子見", confidence_label: "D", ability_score: 39.7, win_prob: 0.041, top3_prob: 0.362 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 14, gate_no: 8, horse_no: 16, horse_name: "サンプルI", jockey_name: "小林勝太", signal: "様子見", confidence_label: "D", ability_score: 37.2, win_prob: 0.031, top3_prob: 0.291 },
  { race_id: "20260405_NAKAYAMA_01", race_name: "未勝利", win_rank: 15, gate_no: 7, horse_no: 12, horse_name: "サンプルJ", jockey_name: "菅原隆一", signal: "様子見", confidence_label: "D", ability_score: 35.4, win_prob: 0.023, top3_prob: 0.214 },
  { race_id: "20260405_NAKAYAMA_02", race_name: "未勝利", win_rank: 1, gate_no: 8, horse_no: 15, horse_name: "ミッキーサウザンド", jockey_name: "ルメール", signal: "軸", confidence_label: "S", ability_score: 68.9, win_prob: 0.243, top3_prob: 0.911 },
  { race_id: "20260405_NAKAYAMA_02", race_name: "未勝利", win_rank: 2, gate_no: 3, horse_no: 6, horse_name: "アルデキングダム", jockey_name: "川田将雅", signal: "複勝圏", confidence_label: "A", ability_score: 54.3, win_prob: 0.151, top3_prob: 0.763 },
  { race_id: "20260405_NAKAYAMA_02", race_name: "未勝利", win_rank: 3, gate_no: 2, horse_no: 2, horse_name: "ニシノモリミチ", jockey_name: "田辺裕信", signal: "能力注", confidence_label: "B", ability_score: 54.2, win_prob: 0.144, top3_prob: 0.741 },
  { race_id: "20260405_NAKAYAMA_02", race_name: "未勝利", win_rank: 4, gate_no: 1, horse_no: 1, horse_name: "サクセスゴールド", jockey_name: "戸崎圭太", signal: "様子見", confidence_label: "C", ability_score: 54.2, win_prob: 0.141, top3_prob: 0.731 },
  { race_id: "20260405_NAKAYAMA_02", race_name: "未勝利", win_rank: 5, gate_no: 6, horse_no: 11, horse_name: "ニシノトマラナイ", jockey_name: "横山武史", signal: "様子見", confidence_label: "C", ability_score: 52.7, win_prob: 0.125, top3_prob: 0.688 },
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", win_rank: 1, gate_no: 15, horse_no: 15, horse_name: "クロワデュノール", jockey_name: "北村友一", signal: "軸", confidence_label: "S", ability_score: 67.67, win_prob: 0.191, top3_prob: 0.8579 },
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", win_rank: 2, gate_no: 4, horse_no: 4, horse_name: "ダノンデサイル", jockey_name: "坂井瑠星", signal: "複勝圏", confidence_label: "A", ability_score: 57.93, win_prob: 0.1666, top3_prob: 0.7784 },
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", win_rank: 3, gate_no: 6, horse_no: 6, horse_name: "メイショウタバル", jockey_name: "武豊", signal: "能力注", confidence_label: "B", ability_score: 53.37, win_prob: 0.1589, top3_prob: 0.7221 },
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", win_rank: 4, gate_no: 5, horse_no: 5, horse_name: "ショウヘイ", jockey_name: "川田将雅", signal: "様子見", confidence_label: "C", ability_score: 51.15, win_prob: 0.1426, top3_prob: 0.6867 },
];

const fallbackFinalBetPlan: FinalBetPlanRow[] = [
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", horse_name: "メイショウタバル", horse_no: 6, signal: "能力注", confidence_label: "B", win_prob: 0.1589, win_odds: 8, win_ev: 1.2712, bet_percent: 19, bet_grade: "少額", action: "少額買い", reason: "期待値良好 / 穴寄り評価" },
];

const fallbackFinalMultiBets: FinalMultiBetsRow[] = [
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", bet_type: "ワイド", axis_horse: "6 メイショウタバル", bets: "6 メイショウタバル - 4 ダノンデサイル / 6 メイショウタバル - 15 クロワデュノール / 6 メイショウタバル - 5 ショウヘイ" },
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", bet_type: "馬連", axis_horse: "6 メイショウタバル", bets: "6 メイショウタバル - 4 ダノンデサイル / 6 メイショウタバル - 15 クロワデュノール / 6 メイショウタバル - 5 ショウヘイ" },
  { race_id: "20260405_HANSHIN_11", race_name: "大阪杯G1", bet_type: "3連複", axis_horse: "6 メイショウタバル", bets: "6 メイショウタバル - 4 ダノンデサイル - 15 クロワデュノール / 6 メイショウタバル - 4 ダノンデサイル - 5 ショウヘイ / 6 メイショウタバル - 15 クロワデュノール - 5 ショウヘイ" },
];

const fallbackBetAmounts: BetAmountsRow[] = [
  { race_id: "20260405_HANSHIN_11", bet_type: "ワイド", bet: "6 メイショウタバル - 15 クロワデュノール", amount: 100, amount_percent: 10 },
  { race_id: "20260405_HANSHIN_11", bet_type: "ワイド", bet: "6 メイショウタバル - 5 ショウヘイ", amount: 100, amount_percent: 10 },
  { race_id: "20260405_HANSHIN_11", bet_type: "馬連", bet: "6 メイショウタバル - 4 ダノンデサイル", amount: 100, amount_percent: 10 },
];

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function signalColor(signal: string) {
  if (signal === "軸") return "#f4d84e";
  if (signal === "複勝圏") return "#86f7f2";
  if (signal === "能力注") return "#d8b4fe";
  return "#bfd6ff";
}

function signalLabel(signal: string) {
  if (signal === "軸") return "◎ 軸";
  if (signal === "複勝圏") return "○ 複勝圏";
  if (signal === "能力注") return "▲ 注目";
  return "△ 様子見";
}

function confidenceBg(conf: string) {
  if (conf === "S") return "rgba(244,216,78,0.18)";
  if (conf === "A") return "rgba(134,247,242,0.18)";
  if (conf === "B") return "rgba(216,180,254,0.18)";
  return "rgba(191,214,255,0.16)";
}

function toNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((x) => x.trim() !== "");
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

function readCsvFile<T>(file: File, onDone: (rows: T[]) => void) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    onDone(parseCsvText(text) as T[]);
  };
  reader.readAsText(file, "utf-8");
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ background: "rgba(18,24,52,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 18, color: "#fff" }}>
      <div style={{ color: "#aab4d6", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function FileLoader({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#aab4d6" }}>
      <span>{label}</span>
      <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

function SmallBadge({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return <span style={{ background: bg, color, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800 }}>{children}</span>;
}

function RaceListCard({ race, active, onClick, detailRows }: { race: RaceListRow; active: boolean; onClick: () => void; detailRows: RaceDetailRow[] }) {
  return (
    <button onClick={onClick} style={{ width: "100%", background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)", border: active ? "1px solid rgba(244,216,78,0.8)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 24, overflow: "hidden", padding: 0, cursor: "pointer", textAlign: "left", boxShadow: active ? "0 10px 30px rgba(244,216,78,0.12)" : "0 8px 24px rgba(0,0,0,0.18)" }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ width: 88, background: "linear-gradient(180deg, #101d67 0%, #0d1749 100%)", color: "#fff", padding: "18px 10px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2 }}>
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{race.race_no}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{race.field_size}頭</div>
          <div style={{ marginTop: 8, width: "100%", height: 4, borderRadius: 999, background: race.venue === "中山" ? "#57b7ff" : race.venue === "阪神" ? "#ffa55b" : "#98e86d" }} />
        </div>
        <div style={{ flex: 1, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, color: "#9aa7cf" }}>{race.venue} / {race.distance || "-"} / {race.field_size}頭</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: "#ffffff" }}>{race.venue}{race.race_no}R {race.race_name}</div>
            </div>
            <SmallBadge bg={confidenceBg(race.pred_top_confidence)} color="#fff">{race.chaos_band}</SmallBadge>
          </div>
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {detailRows.map((row) => (
              <div key={`${row.race_id}-${row.horse_no}`} style={{ display: "grid", gridTemplateColumns: "38px 1fr 74px minmax(120px, 260px)", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: row.win_rank <= 3 ? signalColor(row.signal) : "rgba(255,255,255,0.08)", color: row.win_rank <= 3 ? "#1f2340" : "#d1d8f0", fontWeight: 800, fontSize: 14 }}>{row.horse_no}</div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 800, color: "#eef2ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.horse_name}</div></div>
                <div style={{ fontSize: 16, fontWeight: 800, color: signalColor(row.signal), textAlign: "right" }}>{row.ability_score.toFixed(1)}</div>
                <div style={{ height: 14, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${Math.min((row.ability_score / 70) * 100, 100)}%`, height: "100%", borderRadius: 999, background: signalColor(row.signal) }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function App() {
  const [raceListView, setRaceListView] = useState<RaceListRow[]>(fallbackRaceListView);
  const [raceDetailView, setRaceDetailView] = useState<RaceDetailRow[]>(fallbackRaceDetailView);
  const [finalBetPlan, setFinalBetPlan] = useState<FinalBetPlanRow[]>(fallbackFinalBetPlan);
  const [finalMultiBets, setFinalMultiBets] = useState<FinalMultiBetsRow[]>(fallbackFinalMultiBets);
  const [betAmounts, setBetAmounts] = useState<BetAmountsRow[]>(fallbackBetAmounts);
  const [showAllHorses, setShowAllHorses] = useState(true);

  const venues = Array.from(new Set(raceListView.map((r) => r.venue)));
  const [mainTab, setMainTab] = useState<"list" | "summary" | "results">("list");
  const [detailTab, setDetailTab] = useState<"pred" | "bets">("pred");
  const [selectedVenue, setSelectedVenue] = useState<string>(venues[0] || "");
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const venueRaces = useMemo(() => raceListView.filter((r) => r.venue === selectedVenue).sort((a, b) => toNum(a.race_no) - toNum(b.race_no)), [raceListView, selectedVenue]);
  const selectedRace = useMemo(() => venueRaces.find((r) => r.race_id === selectedRaceId) ?? venueRaces[0], [venueRaces, selectedRaceId]);
  const details = useMemo(() => raceDetailView.filter((x) => x.race_id === selectedRace?.race_id).sort((a, b) => toNum(a.win_rank) - toNum(b.win_rank)), [raceDetailView, selectedRace]);
  const betPlan = finalBetPlan.filter((x) => x.race_id === selectedRace?.race_id);
  const multiBets = finalMultiBets.filter((x) => x.race_id === selectedRace?.race_id);
  const amounts = betAmounts.filter((x) => x.race_id === selectedRace?.race_id);
  const avgAbility = (raceListView.reduce((sum, r) => sum + toNum(r.pred_top_ability), 0) / Math.max(raceListView.length, 1)).toFixed(1);

  const adminSubmit = () => {
    if (password === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setPasswordError("");
    } else {
      setPasswordError("パスワードが違います");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #11152d 0%, #161b38 100%)", color: "#eef2ff", fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ background: "linear-gradient(135deg, #0f1f67 0%, #5b1c74 100%)", color: "#fff", padding: "28px 20px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>競馬AI</div>
          <div style={{ fontSize: 12, letterSpacing: 2, marginTop: 4, color: "#d7ddff" }}>HORSE RACING PREDICTOR</div>
          <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
            {[["list", "レース一覧"], ["summary", "詳細予想"], ["results", "結果"]].map(([key, label]) => (
              <button key={key} onClick={() => setMainTab(key as "list" | "summary" | "results")} style={{ flex: 1, border: mainTab === key ? "1px solid rgba(244,216,78,0.8)" : "1px solid rgba(255,255,255,0.15)", background: mainTab === key ? "rgba(244,216,78,0.10)" : "rgba(255,255,255,0.04)", color: "#fff", borderRadius: 16, padding: "14px 12px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: 20, display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <StatCard title="対象レース数" value={raceListView.length} />
          <StatCard title="期待値推奨馬" value={`${finalBetPlan.length}頭`} />
          <StatCard title="競馬場数" value={`${venues.length}場`} />
          <StatCard title="平均AI指数" value={avgAbility} />
        </div>

        <div style={{ background: "rgba(18,24,52,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {venues.map((venue) => (
              <button key={venue} onClick={() => { setSelectedVenue(venue); setSelectedRaceId(""); }} style={{ border: "1px solid rgba(255,255,255,0.12)", background: selectedVenue === venue ? "rgba(87,183,255,0.18)" : "rgba(255,255,255,0.04)", color: "#fff", borderRadius: 14, padding: "12px 18px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{venue}</button>
            ))}
          </div>
        </div>

        {mainTab === "list" && (
          <div style={{ display: "grid", gap: 18 }}>
            {venueRaces.map((race) => (
              <RaceListCard key={race.race_id} race={race} active={race.race_id === selectedRace?.race_id} detailRows={raceDetailView.filter((x) => x.race_id === race.race_id).sort((a, b) => toNum(a.win_rank) - toNum(b.win_rank))} onClick={() => { setSelectedRaceId(race.race_id); setMainTab("summary"); setDetailTab("pred"); }} />
            ))}
          </div>
        )}

        {mainTab === "summary" && selectedRace && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", gap: 10 }}>
              {[["pred", "評価"], ["bets", "推奨馬券"]].map(([key, label]) => (
                <button key={key} onClick={() => setDetailTab(key as "pred" | "bets")} style={{ border: detailTab === key ? "1px solid rgba(244,216,78,0.8)" : "1px solid rgba(255,255,255,0.12)", background: detailTab === key ? "rgba(244,216,78,0.12)" : "rgba(255,255,255,0.04)", color: detailTab === key ? "#fff3a6" : "#d7ddff", borderRadius: 999, padding: "12px 18px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>{label}</button>
              ))}
              {detailTab === "pred" && (
                <button onClick={() => setShowAllHorses((v) => !v)} style={{ marginLeft: "auto", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#d7ddff", borderRadius: 999, padding: "12px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  {showAllHorses ? "上位5頭だけ表示" : "全頭表示"}
                </button>
              )}
            </div>

            {detailTab === "pred" && (
              <div style={{ background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 34, fontWeight: 900, color: "#ffffff" }}>{selectedRace.venue}{selectedRace.race_no}R {selectedRace.race_name}</div>
                    <div style={{ marginTop: 6, color: "#aab4d6", fontSize: 16 }}>{selectedRace.distance || "-"} / {selectedRace.field_size}頭 / 荒れ度 : {selectedRace.chaos_band}</div>
                  </div>
                  <SmallBadge bg={confidenceBg(selectedRace.pred_top_confidence)} color="#fff">信頼度 {selectedRace.pred_top_confidence}</SmallBadge>
                </div>

                <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
                  {(showAllHorses ? details : details.slice(0, 5)).map((h) => (
                    <div key={`${h.race_id}-${h.horse_no}`} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", borderRadius: 18, padding: 16, display: "grid", gridTemplateColumns: "70px 1fr 120px 280px", gap: 14, alignItems: "center" }}>
                      <div style={{ width: 54, height: 54, borderRadius: 999, background: h.win_rank <= 3 ? signalColor(h.signal) : "rgba(255,255,255,0.08)", color: h.win_rank <= 3 ? "#1f2340" : "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 20 }}>{h.horse_no}</div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: "#ffffff" }}>{h.horse_name}</div>
                        <div style={{ color: "#aab4d6", marginTop: 4, fontSize: 14 }}>{h.jockey_name} / 枠{h.gate_no} / 予測{h.win_rank}位</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <SmallBadge bg={confidenceBg(h.confidence_label)} color="#fff">信頼度 {h.confidence_label}</SmallBadge>
                          <SmallBadge bg="rgba(255,255,255,0.08)" color={signalColor(h.signal)}>{signalLabel(h.signal)}</SmallBadge>
                        </div>
                      </div>
                      <div style={{ display: "grid", justifyItems: "center", gap: 2 }}>
                        <div style={{ fontSize: 40, fontWeight: 900, color: signalColor(h.signal), lineHeight: 1 }}>{h.ability_score.toFixed(1)}</div>
                        <div style={{ fontSize: 12, color: "#aab4d6" }}>AI指数</div>
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#aab4d6", marginBottom: 4 }}><span>勝率</span><span>{pct(h.win_prob)}</span></div>
                          <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${Math.min(h.win_prob * 100, 100)}%`, height: "100%", borderRadius: 999, background: signalColor(h.signal) }} /></div>
                        </div>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#aab4d6", marginBottom: 4 }}><span>3着内率</span><span>{pct(h.top3_prob)}</span></div>
                          <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${Math.min(h.top3_prob * 100, 100)}%`, height: "100%", borderRadius: 999, background: "#bfd6ff" }} /></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailTab === "bets" && (
              <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>
                <div style={{ background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 20 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#ffe98c" }}>期待値推奨馬</div>
                  <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                    {betPlan.length === 0 && <div style={{ color: "#aab4d6" }}>該当なし</div>}
                    {betPlan.map((b) => (
                      <div key={b.horse_name} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", borderRadius: 18, padding: 16 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{b.horse_no ? `${b.horse_no} ${b.horse_name}` : b.horse_name}</div>
                        <div style={{ color: "#aab4d6", marginTop: 4 }}>{b.race_name}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <SmallBadge bg="rgba(255,255,255,0.08)" color={signalColor(b.signal)}>{signalLabel(b.signal)}</SmallBadge>
                          <SmallBadge bg={confidenceBg(b.confidence_label)} color="#fff">信頼度 {b.confidence_label}</SmallBadge>
                          <SmallBadge bg="rgba(134,247,242,0.14)" color="#86f7f2">期待値 {b.win_ev}</SmallBadge>
                        </div>
                        <div style={{ marginTop: 12, fontSize: 14, color: "#d7ddff", lineHeight: 1.8 }}>
                          <div>勝率: <b>{pct(b.win_prob)}</b></div>
                          <div>理由: <b>{b.reason}</b></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 20 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#ffe98c" }}>推奨馬券</div>
                  <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                    {multiBets.map((bet) => {
                      const amountRows = amounts.filter((x) => x.bet_type === bet.bet_type);
                      const typeBg = bet.bet_type === "ワイド" ? "rgba(134,247,242,0.10)" : bet.bet_type === "馬連" ? "rgba(244,216,78,0.10)" : "rgba(216,180,254,0.10)";
                      const typeColor = bet.bet_type === "ワイド" ? "#86f7f2" : bet.bet_type === "馬連" ? "#f4d84e" : "#d8b4fe";
                      return (
                        <div key={bet.bet_type} style={{ border: `1px solid ${typeColor}33`, background: typeBg, borderRadius: 18, padding: 16 }}>
                          <div style={{ fontWeight: 900, fontSize: 18, color: typeColor }}>{bet.bet_type} / 軸: {bet.axis_horse}</div>
                          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                            {bet.bets.split(" / ").map((b, idx) => {
                              const row = amountRows.find((x) => x.bet.trim() === b.trim());
                              return (
                                <div key={idx} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, color: "#eef2ff" }}>
                                  <span>{b.trim()}</span>
                                  <b style={{ color: typeColor }}>{row?.amount_percent ? `${row.amount_percent}%` : row?.amount ? `${row.amount}円` : "-"}</b>
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
          <div style={{ background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 24 }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>結果</div>
            <div style={{ color: "#aab4d6", marginTop: 8 }}>ここは後で daily_result_view.csv と race_result_view.csv をつないで表示。</div>
          </div>
        )}

        <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
          <button onClick={() => setAdminOpen((v) => !v)} style={{ justifySelf: "start", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#d7ddff", borderRadius: 14, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>管理人専用</button>
          {adminOpen && (
            <div style={{ background: "linear-gradient(180deg, rgba(27,32,64,0.98) 0%, rgba(22,27,56,0.98) 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 16, display: "grid", gap: 14 }}>
              {!adminUnlocked ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#eef2ff" }}>パスワード入力</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="管理人パスワード" style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#fff", borderRadius: 12, padding: "10px 12px", minWidth: 260 }} />
                    <button onClick={adminSubmit} style={{ border: "none", background: "#0f1f67", color: "#fff", borderRadius: 12, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>開く</button>
                  </div>
                  {passwordError && <div style={{ color: "#ff8c8c", fontSize: 13 }}>{passwordError}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#eef2ff" }}>CSVアップロード</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
                    <FileLoader label="race_list_view.csv" onFile={(file) => readCsvFile<RaceListRow>(file, (rows) => setRaceListView(rows.map((r) => ({ ...r, race_no: toNum((r as any).race_no), field_size: toNum((r as any).field_size), pred_top_ability: toNum((r as any).pred_top_ability) }))))} />
                    <FileLoader label="race_detail_view.csv" onFile={(file) => readCsvFile<RaceDetailRow>(file, (rows) => setRaceDetailView(rows.map((r) => ({ ...r, win_rank: toNum((r as any).win_rank), gate_no: toNum((r as any).gate_no), horse_no: toNum((r as any).horse_no), ability_score: toNum((r as any).ability_score), win_prob: toNum((r as any).win_prob), top3_prob: toNum((r as any).top3_prob) }))))} />
                    <FileLoader label="final_bet_plan.csv" onFile={(file) => readCsvFile<FinalBetPlanRow>(file, (rows) => setFinalBetPlan(rows.map((r) => ({ ...r, horse_no: toNum((r as any).horse_no), win_prob: toNum((r as any).win_prob), win_odds: toNum((r as any).win_odds), win_ev: toNum((r as any).win_ev), bet_percent: toNum((r as any).bet_percent || (r as any).bet_ratio) }))))} />
                    <FileLoader label="final_multi_bets.csv" onFile={(file) => readCsvFile<FinalMultiBetsRow>(file, (rows) => setFinalMultiBets(rows))} />
                    <FileLoader label="bet_amounts.csv" onFile={(file) => readCsvFile<BetAmountsRow>(file, (rows) => setBetAmounts(rows.map((r) => ({ ...r, amount: toNum((r as any).amount), amount_percent: toNum((r as any).amount_percent || (r as any).bet_percent) }))))} />
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
