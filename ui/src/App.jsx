import { useState, useEffect, useCallback, useMemo } from "react";

// ============================================================
// 設定
// ============================================================
const DATA_BASE      = "/data";
const DETAIL_CSV     = `${DATA_BASE}/race_detail_view.csv`;
const LIST_CSV       = `${DATA_BASE}/race_list_view.csv`;
const BETS_CSV       = `${DATA_BASE}/final_multi_bets.csv`;
const COMMENTS_CSV   = `${DATA_BASE}/horse_comments.csv`;
const RANKING_CSV    = `${DATA_BASE}/combination_ev_ranking.csv`; // 🌟追加：Claudeさんのランキングデータ

// ============================================================
// 開催場マッピング
// ============================================================
const VENUE_MAP = {
  "SAPPORO": "札幌", "HAKODATE": "函館", "FUKUSHIMA": "福島", "NIIGATA": "新潟",
  "TOKYO": "東京", "NAKAYAMA": "中山", "CHUKYO": "中京", "KYOTO": "京都",
  "HANSHIN": "阪神", "KOKURA": "小倉"
};

// ============================================================
// 強化版 CSV パーサー
// ============================================================
function parseCSV(text) {
  const s = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = s.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"'; 
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        vals.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

async function fetchCSV(url) {
  try {
    const r = await fetch(`${url}?_=${Date.now()}`);
    if (!r.ok) return [];
    return parseCSV(await r.text());
  } catch { return []; }
}

const toF = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
const toI = (v, d = 0) => { const n = parseInt(v);   return isNaN(n) ? d : n; };

function rowToHorse(row) {
  return {
    race_id:          row.race_id ?? row["レース番号"] ?? "",
    no:               toI(row["馬番"] ?? row.horse_no),
    gate:             toI(row["枠番"] ?? row.gate_no),
    name:             row["馬名"]  ?? row.horse_name ?? "",
    jockey:           row["騎手"]  ?? row.jockey_name ?? "",
    ability:          toF(row.ability_score, 20),
    win_prob:         toF(row.win_prob)  * 100,
    top3_prob:        toF(row.top3_prob) * 100,
    confidence_rank:  row.confidence_rank  ?? "C",
    confidence_label: row.confidence_label ?? "難解",
  };
}

function buildRaces(detailRows, listRows) {
  const listMap = Object.fromEntries(listRows.map(r => [r.race_id ?? r["レース番号"] ?? "", r]));
  const raceMap = {};
  for (const row of detailRows) {
    const h   = rowToHorse(row);
    const rid = h.race_id;
    if (!rid) continue;
    if (!raceMap[rid]) {
      const m = listMap[rid] ?? {};
      raceMap[rid] = {
        race_id:          rid,
        venue:            m["開催"] ?? "",
        race_name:        m["レース名"] ?? "",
        distance:         m["距離"] ? `${m["距離"]}m` : "",
        track_cond:       m["馬場状態"] ?? "",
        field_size:       toI(m.field_size ?? 0),
        confidence_rank:  m.confidence_rank ?? "C",
        confidence_label: m.confidence_label ?? "難解",
        horses: [],
      };
    }
    raceMap[rid].horses.push(h);
  }
  
  for (const r of Object.values(raceMap)) {
    let sorted = [...r.horses].sort((a, b) => b.ability - a.ability);
    sorted.forEach(h => h.mark = "");

    if (sorted.length > 0) {
      sorted[0].mark = "◎";
      let remaining = sorted.slice(1).sort((a, b) => b.top3_prob - a.top3_prob);
      if (remaining.length > 0) remaining[0].mark = "○";
      if (remaining.length > 1) remaining[1].mark = "▲";
      if (remaining.length > 2) remaining[2].mark = "△";
      if (remaining.length > 3) remaining[3].mark = "△";
    }

    r.horses = sorted;

    if (!r.field_size) r.field_size = r.horses.length;
    if (r.confidence_rank === "C" && r.horses[0]?.confidence_rank) {
      r.confidence_rank  = r.horses[0].confidence_rank;
      r.confidence_label = r.horses[0].confidence_label;
    }
    
    const match = r.race_id.match(/_([A-Za-z]+)_0*(\d+)/);
    if (match) {
       const vName = VENUE_MAP[match[1].toUpperCase()] || match[1];
       r.race_no = match[2]; 
       r.label = `${vName}${match[2]}R`;
       r.venue = vName;
    } else {
       r.race_no = r.race_no || "";
       r.label = r.race_id;
    }
  }
  return Object.values(raceMap);
}

function buildCommentMap(commentRows) {
  const map = {};
  for (const row of commentRows) {
    const key = `${row.race_id ?? ""}__${row["馬名"] ?? ""}`;
    let tags = [];
    try { tags = JSON.parse(row.tags ?? "[]"); } catch {}
    map[key] = { tags, comment: row.comment ?? "" };
  }
  return map;
}

// ============================================================
// デザイン設定
// ============================================================
const GATE_BG_COLOR = ["", "#FFFFFF","#000000","#EF4444","#3B82F6","#F59E0B","#22C55E","#F97316","#EC4899"];
const GATE_FG_COLOR = ["", "#111111","#FFFFFF","#FFFFFF","#FFFFFF","#111111","#FFFFFF","#FFFFFF","#FFFFFF"];
const MARK_DEF = {
  "◎": { bg: "#EF4444", fg: "#FFFFFF", label: "◎" },
  "○": { bg: "#3B82F6", fg: "#FFFFFF", label: "○" },
  "▲": { bg: "#F59E0B", fg: "#111111", label: "▲" },
  "△": { bg: "#22C55E", fg: "#FFFFFF", label: "△" },
};
const RANK_DEF = {
  SS: { bg: "#F59E0B", fg: "#000000" },
  S:  { bg: "#EF4444", fg: "#FFFFFF" },
  A:  { bg: "#3B82F6", fg: "#FFFFFF" },
  B:  { bg: "#6B7280", fg: "#FFFFFF" },
  C:  { bg: "#374151", fg: "#9CA3AF" },
};
const TAG_TYPE_DEF = {
  good:    { bg: "#EF4444", fg: "#FFFFFF" },  
  bad:     { bg: "#3B82F6", fg: "#FFFFFF" },  
  neutral: { bg: "#334155", fg: "#CBD5E1" },  
};
const ROW_HIGHLIGHT = { "◎": "rgba(239, 68, 68, 0.10)", "○": "rgba(59, 130, 246, 0.10)" };
const barColor = (s) => s >= 80 ? "#F59E0B" : s >= 60 ? "#60A5FA" : s >= 40 ? "#34D399" : "#4B5563";

// ============================================================
// コンポーネント
// ============================================================
function GateBall({ gate, no, size = 32 }) {
  const bg = GATE_BG_COLOR[gate] ?? "#6B7280";
  const fg = GATE_FG_COLOR[gate] ?? "#FFF";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: "50%", flexShrink: 0, background: bg, color: fg, fontSize: size <= 28 ? 11 : 13, fontWeight: 700, border: gate === 1 ? "1.5px solid #4B5563" : "none" }}>{no}</span>
  );
}
function MarkIcon({ mark, size = 28 }) {
  const d = MARK_DEF[mark];
  if (!d) return <span style={{ width: size, flexShrink: 0 }} />;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: 6, flexShrink: 0, background: d.bg, color: d.fg, fontSize: size <= 24 ? 13 : 15, fontWeight: 800 }}>{d.label}</span>
  );
}
function RankBadge({ rank, label, small = false }) {
  const d = RANK_DEF[rank] ?? RANK_DEF.C;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: small ? "2px 7px" : "4px 10px", borderRadius: 7, background: d.bg, color: d.fg, fontSize: small ? 11 : 13, fontWeight: 800, whiteSpace: "nowrap" }}>
      {rank}{!small && label && <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.9 }}>{label}</span>}
    </span>
  );
}
function AbilityBar({ score, compact = false }) {
  const pct = Math.max(((score - 20) / (92 - 20)) * 100, 2);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6 }}>
      <span style={{ color: "#F1F5F9", fontWeight: 700, fontSize: compact ? 13 : 14, width: compact ? 34 : 36, textAlign: "right", flexShrink: 0 }}>{score.toFixed(1)}</span>
      <div style={{ flex: 1, height: compact ? 4 : 5, background: "#1E293B", borderRadius: 3, overflow: "hidden", minWidth: compact ? 32 : 48 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor(score), borderRadius: 3, transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

function HorseCommentPopup({ horse, commentData, onClose }) {
  const { tags = [], comment = "" } = commentData ?? {};
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", padding: "0 0 env(safe-area-inset-bottom)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "20px 18px 32px", maxHeight: "75vh", overflowY: "auto", animation: "slideUp .25s ease" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#CBD5E1", margin: "0 auto 16px" }} />
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ color: "#0F172A", fontWeight: 800, fontSize: 16 }}>{horse.no}番　{horse.name}</span>
            <span style={{ color: "#64748B", fontSize: 13 }}>{horse.jockey}</span>
          </div>
        </div>
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {tags.map((t, i) => {
              const td = TAG_TYPE_DEF[t.type] ?? TAG_TYPE_DEF.neutral;
              return <span key={i} style={{ padding: "4px 10px", borderRadius: 20, background: td.bg, color: td.fg, fontSize: 12, fontWeight: 700 }}>{t.label}</span>;
            })}
          </div>
        )}
        {comment ? (
          <p style={{ color: "#1E293B", fontSize: 13, lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>{comment}</p>
        ) : (
          <p style={{ color: "#94A3B8", fontSize: 13 }}>コメントデータなし。ターミナルで generate_comments.py を実行してください。</p>
        )}
        <button onClick={onClose} style={{ display: "block", width: "100%", marginTop: 20, padding: "12px 0", background: "#F1F5F9", border: "none", borderRadius: 10, color: "#475569", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          閉じる
        </button>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

function DetailTable({ horses, commentMap, raceId }) {
  const [popupHorse, setPopupHorse] = useState(null);
  const getComment = (horse) => commentMap[`${raceId}__${horse.name}`] ?? null;
  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: "grid", gridTemplateColumns: "38px 32px 1fr 96px 52px 54px", padding: "7px 12px", color: "#475569", fontSize: 11, borderBottom: "1px solid #1E293B", gap: 4 }}>
        <span>枠/馬</span><span>印</span><span style={{ paddingLeft: 6 }}>馬名 / 騎手</span><span style={{ textAlign: "right" }}>AI指数</span><span style={{ textAlign: "right" }}>勝率</span><span style={{ textAlign: "right" }}>複勝率</span>
      </div>
      {horses.map(h => {
        const hasComment = !!getComment(h);
        return (
          <div key={h.no} onClick={() => setPopupHorse(h)} style={{ display: "grid", gridTemplateColumns: "38px 32px 1fr 96px 52px 54px", alignItems: "center", gap: 4, padding: "11px 12px", background: ROW_HIGHLIGHT[h.mark] ?? "transparent", borderBottom: "1px solid #1E293B", cursor: hasComment ? "pointer" : "default", transition: "background .1s" }}>
            <div style={{ display: "flex", justifyContent: "center" }}><GateBall gate={h.gate} no={h.no} size={30} /></div>
            <div style={{ display: "flex", justifyContent: "center" }}><MarkIcon mark={h.mark} size={26} /></div>
            <div style={{ paddingLeft: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{h.name}</span>
                {hasComment && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#60A5FA", flexShrink: 0 }} />}
              </div>
              <div style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>{h.jockey}</div>
            </div>
            <AbilityBar score={h.ability} compact />
            <div style={{ textAlign: "right" }}><span style={{ fontSize: 13, fontWeight: 700, color: h.win_prob >= 15 ? "#F59E0B" : h.win_prob >= 10 ? "#E2E8F0" : "#94A3B8" }}>{h.win_prob.toFixed(1)}%</span></div>
            <div style={{ textAlign: "right" }}><span style={{ fontSize: 12, color: h.top3_prob >= 60 ? "#60A5FA" : h.top3_prob >= 40 ? "#93C5FD" : "#64748B" }}>{h.top3_prob.toFixed(1)}%</span></div>
          </div>
        );
      })}
      {popupHorse && <HorseCommentPopup horse={popupHorse} commentData={getComment(popupHorse)} onClose={() => setPopupHorse(null)} />}
    </div>
  );
}

// 🌟追加：Claudeさんの確率ランキング用パネル
function RankingPanel({ rankings }) {
  if (!rankings || rankings.length === 0) return <div style={{ color: "#64748B", textAlign: "center", padding: "48px 16px", fontSize: 13 }}>📋 確率ランキングデータなし</div>;
  const BET_COL = { "馬連": "#8B5CF6", "ワイド": "#3B82F6" };
  const byType = {};
  for (const r of rankings) { (byType[r.bet_type ?? "その他"] ??= []).push(r); }

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ padding: "12px 14px", color: "#94A3B8", fontSize: 11, lineHeight: 1.4, background: "#0B0E14" }}>
        ※オッズ・期待値を除外した「AIの純粋な確率評価」です。<br/>※馬連はHarville式、ワイドは同時3着内補正で計算しています。
      </div>
      {Object.entries(byType).map(([type, rows]) => (
        <div key={type} style={{ marginBottom: 12 }}>
          <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, background: "#1E293B" }}>
            <span style={{ background: BET_COL[type] ?? "#475569", color: "#FFF", borderRadius: 5, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{type} 上位</span>
          </div>
          {rows.map((r, i) => {
            const rankNum = parseInt(r.rank);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1E293B" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: rankNum <= 3 ? "#F59E0B" : "#64748B", fontSize: 14, fontWeight: 800, width: 24, textAlign: "center" }}>{r.rank}</span>
                  <span style={{ color: "#E2E8F0", fontSize: 16, fontWeight: 700, width: 44 }}>{r.numbers}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ color: "#94A3B8", fontSize: 12 }}>{r.name1} × {r.name2}</span>
                    <span style={{ color: "#64748B", fontSize: 10 }}>印: {r.mark1} - {r.mark2}</span>
                  </div>
                </div>
                <span style={{ color: "#60A5FA", fontWeight: 800, fontSize: 15 }}>{r.prob}%</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function RaceDetail({ race, bets, rankings, commentMap, onBack, prevRace, nextRace, onNavigate }) {
  const [tab, setTab] = useState("予想");
  const raceBets = bets.filter(b => (b.race_id ?? "") === race.race_id);
  const raceRankings = rankings.filter(r => (r.race_id ?? "") === race.race_id); // 🌟追加

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 800, background: "#0F172A", display: "flex", flexDirection: "column", minHeight: "100vh", borderLeft: "1px solid #1E293B", borderRight: "1px solid #1E293B" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#0F172A", borderBottom: "1px solid #1E293B", padding: "12px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={onBack} style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 26, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>‹</button>
              <span style={{ color: "#F1F5F9", fontWeight: 800, fontSize: 18 }}>{race.label}</span>
              <RankBadge rank={race.confidence_rank} label={race.confidence_label} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {prevRace ? <button onClick={() => onNavigate(prevRace)} style={{ background: "#1E293B", border: "1px solid #334155", color: "#E2E8F0", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>◀ {prevRace.race_no}R</button> : <div style={{ width: 50 }}></div>}
              {nextRace ? <button onClick={() => onNavigate(nextRace)} style={{ background: "#1E293B", border: "1px solid #334155", color: "#E2E8F0", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{nextRace.race_no}R ▶</button> : <div style={{ width: 50 }}></div>}
            </div>
          </div>
          <p style={{ color: "#64748B", fontSize: 12, margin: "0 0 10px 40px" }}>{[race.race_name, race.distance, race.track_cond, race.field_size && `${race.field_size}頭`].filter(Boolean).join(" / ")}</p>
          <p style={{ color: "#94A3B8", fontSize: 11, margin: "0 0 8px 40px", fontWeight: 600 }}>💡 馬名をタップするとAI評価を表示</p>
          
          <div style={{ display: "flex", borderTop: "1px solid #1E293B" }}>
            {/* 🌟 確率ランク タブを追加！ */}
            {["予想", "確率ランク", "買い目"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "9px 0", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: tab === t ? "#F1F5F9" : "#64748B", borderBottom: tab === t ? "2px solid #3B82F6" : "2px solid transparent" }}>
                {t}
                {t === "買い目" && raceBets.length > 0 && <span style={{ marginLeft: 5, background: "#3B82F6", color: "#FFF", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{raceBets.length}</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "予想" && <DetailTable horses={race.horses} commentMap={commentMap} raceId={race.race_id} />}
          {tab === "確率ランク" && <RankingPanel rankings={raceRankings} />} 
          {tab === "買い目" && <BetsPanel bets={raceBets} />}
        </div>
      </div>
    </div>
  );
}

function BetsPanel({ bets }) {
  if (!bets.length) return <div style={{ color: "#64748B", textAlign: "center", padding: "48px 16px", fontSize: 13 }}>📋 買い目データなし</div>;
  const BET_COL = { "単勝": "#F59E0B", "複勝": "#22C55E", "ワイド": "#3B82F6", "馬連": "#8B5CF6", "3連複": "#EC4899", "3連単": "#EF4444" };
  const byType = {};
  for (const b of bets) { (byType[b.bet_type ?? "その他"] ??= []).push(b); }
  return (
    <div style={{ paddingBottom: 40 }}>
      {Object.entries(byType).map(([type, rows]) => (
        <div key={type} style={{ marginBottom: 4 }}>
          <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, background: "#1E293B" }}>
            <span style={{ background: BET_COL[type] ?? "#475569", color: "#FFF", borderRadius: 5, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{type}</span><span style={{ color: "#64748B", fontSize: 12 }}>{rows.length}点</span>
          </div>
          {rows.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1E293B" }}>
              <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 600 }}>{b.numbers ?? ""}</span><span style={{ color: "#64748B", fontSize: 12 }}>{b.recommendation ?? ""}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RaceCard({ race, onClick }) {
  const MARK_ORDER = { "◎": 0, "○": 1, "▲": 2, "△": 3 };
  const marked = race.horses.filter(h => MARK_DEF[h.mark]).sort((a, b) => (MARK_ORDER[a.mark] ?? 9) - (MARK_ORDER[b.mark] ?? 9));
  return (
    <div onClick={onClick} style={{ width: "100%", textAlign: "left", background: "#1E293B", border: "1px solid #334155", borderRadius: 14, padding: "14px 14px 12px", marginBottom: 10, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ color: "#F1F5F9", fontWeight: 800, fontSize: 16 }}>{race.label}</div>
          <div style={{ color: "#64748B", fontSize: 11, marginTop: 3 }}>{[race.race_name, race.distance, race.track_cond, race.field_size && `${race.field_size}頭`].filter(Boolean).join(" / ")}</div>
        </div>
        <RankBadge rank={race.confidence_rank} label={race.confidence_label} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {marked.map(h => (
          <div key={h.no} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MarkIcon mark={h.mark} size={26} />
            <GateBall gate={h.gate} no={h.no} size={28} />
            <span style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</span>
            <div style={{ width: 110, flexShrink: 0 }}><AbilityBar score={h.ability} compact /></div>
            <span style={{ fontSize: 12, fontWeight: 600, width: 40, textAlign: "right", color: h.win_prob >= 15 ? "#F59E0B" : h.win_prob >= 10 ? "#E2E8F0" : "#64748B" }}>{h.win_prob.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// メインアプリ
// ============================================================
export default function App() {
  const ACCESS_PASSWORD = "0120";
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [error, setError] = useState("");

  const [races, setRaces] = useState([]);
  const [bets, setBets] = useState([]);
  const [commentMap, setCommentMap] = useState({});
  const [rankings, setRankings] = useState([]); // 🌟追加：ランキング用ステート
  
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState("list");
  const [currentRace, setCurrentRace] = useState(null);
  const [venueTab, setVenueTab] = useState(null);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      // 🌟RANKING_CSV も同時に取得するように修正
      const [detailRows, listRows, betRows, commentRows, rankingRows] = await Promise.all([
        fetchCSV(DETAIL_CSV), fetchCSV(LIST_CSV), fetchCSV(BETS_CSV), fetchCSV(COMMENTS_CSV), fetchCSV(RANKING_CSV)
      ]);
      if (detailRows.length) {
        const built = buildRaces(detailRows, listRows);
        setRaces(built); 
        setBets(betRows);
        setCommentMap(buildCommentMap(commentRows));
        setRankings(rankingRows); // 🌟追加
        
        const venues = [...new Set(built.map(r => r.venue).filter(Boolean))];
        if (venues.length) setVenueTab(v => (v && venues.includes(v)) ? v : venues[0]);
      }
    } finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { loadData(); }, [loadData]);

  const venues = useMemo(() => [...new Set(races.map(r => r.venue).filter(Boolean))], [races]);
  const visibleRaces = useMemo(() => venueTab ? races.filter(r => r.venue === venueTab) : races, [races, venueTab]);
  const currentRaceIndex = useMemo(() => (!currentRace ? -1 : visibleRaces.findIndex(r => r.race_id === currentRace.race_id)), [visibleRaces, currentRace]);
  const prevRace = currentRaceIndex > 0 ? visibleRaces[currentRaceIndex - 1] : null;
  const nextRace = (currentRaceIndex >= 0 && currentRaceIndex < visibleRaces.length - 1) ? visibleRaces[currentRaceIndex + 1] : null;

  const handleLogin = (e) => {
    e.preventDefault();
    if (passInput === ACCESS_PASSWORD) {
      setIsAuthenticated(true);
      setError("");
    } else {
      setError("パスワードが正しくありません。");
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F172A" }}>
        <div style={{ background: "#1E293B", padding: 40, borderRadius: 16, textAlign: "center", border: "1px solid #334155", width: "100%", maxWidth: 360, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          <h2 style={{ color: "#FFF", marginBottom: 8, fontSize: "1.8rem", letterSpacing: "1px" }}>競馬AI Premium</h2>
          <p style={{ color: "#94A3B8", fontSize: "0.85rem", marginBottom: 32 }}>アクセスするにはパスワードを入力してください</p>
          <form onSubmit={handleLogin}>
            <input 
              type="password" 
              placeholder="Password"
              value={passInput} 
              onChange={e => setPassInput(e.target.value)} 
              autoFocus 
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #334155", background: "#0B0E14", color: "#FFF", marginBottom: 12, boxSizing: "border-box", outline: "none", fontSize: "1rem" }} 
            />
            {error && <p style={{ color: "#EF4444", fontSize: "0.8rem", marginBottom: 12 }}>{error}</p>}
            <button type="submit" style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#3B82F6", color: "#FFF", fontWeight: "bold", cursor: "pointer" }}>ENTER SYSTEM</button>
          </form>
        </div>
      </div>
    );
  }

  if (currentView === "detail" && currentRace) {
    return <RaceDetail race={currentRace} bets={bets} rankings={rankings} commentMap={commentMap} onBack={() => { setCurrentView("list"); setCurrentRace(null); }} prevRace={prevRace} nextRace={nextRace} onNavigate={(r) => { setCurrentRace(r); window.scrollTo(0,0); }} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0F172A", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 800, background: "#0F172A", minHeight: "100vh", position: "relative", borderLeft: "1px solid #1E293B", borderRight: "1px solid #1E293B" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#0F172A", borderBottom: "1px solid #1E293B" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px 6px" }}>
            <h1 style={{ color: "#F1F5F9", fontWeight: 900, fontSize: 22, margin: 0 }}>競馬AI</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#64748B", fontSize: 12 }}>ガイド</span>
              {["SS","S","A","B","C"].map(rank => <RankBadge key={rank} rank={rank} small />)}
            </div>
          </div>
          {venues.length > 0 && (
            <div style={{ display: "flex", padding: "4px 10px 0" }}>
              {venues.map(v => (
                <button key={v} onClick={() => setVenueTab(v)} style={{ padding: "8px 20px", background: venueTab === v ? "#3B82F6" : "transparent", color: venueTab === v ? "#FFF" : "#94A3B8", border: venueTab === v ? "none" : "1px solid #334155", borderRadius: 8, marginRight: 6, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{v}</button>
              ))}
              <button onClick={loadData} style={{ marginLeft: "auto", padding: "6px 12px", background: "none", border: "1px solid #334155", color: "#64748B", borderRadius: 7, fontSize: 11, cursor: "pointer" }}>更新</button>
            </div>
          )}
          <div style={{ height: 8 }} />
        </div>
        <div style={{ padding: "10px 12px 48px" }}>
          {!loading && visibleRaces.map(race => <RaceCard key={race.race_id} race={race} onClick={() => { setCurrentRace(race); setCurrentView("detail"); window.scrollTo(0, 0); }} />)}
        </div>
      </div>
    </div>
  );
}