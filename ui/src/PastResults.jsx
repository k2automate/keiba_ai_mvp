/**
 * PastResults.jsx — 過去レース結果タブ
 * ui/src/PastResults.jsx として保存する
 */

import { useState, useEffect, useCallback } from "react";

// ============================================================
// 🌟公開データ ＋ ローカルデータ 統合ストレージ
// ============================================================
const STORAGE_PREFIX = "past_results:";
let publicCache = null;

async function fetchPublicData() {
  if (publicCache) return publicCache;
  try {
    const res = await fetch(`/data/public_results.json?_=${Date.now()}`);
    if (res.ok) {
      publicCache = await res.json();
      return publicCache;
    }
  } catch {}
  return {};
}

async function loadDay(dateStr) {
  const local = window.localStorage.getItem(`${STORAGE_PREFIX}${dateStr}`);
  if (local) return JSON.parse(local);
  const pub = await fetchPublicData();
  if (pub && pub[dateStr]) return pub[dateStr];
  return null;
}

async function saveDay(dateStr, data) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${dateStr}`, JSON.stringify(data));
    return true;
  } catch { return false; }
}

async function listAllKeys() {
  const keys = new Set();
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) keys.add(k.replace(STORAGE_PREFIX, ""));
  }
  const pub = await fetchPublicData();
  if (pub) Object.keys(pub).forEach(k => keys.add(k));
  return Array.from(keys).sort().reverse();
}

async function exportPublicJson() {
  const pub = await fetchPublicData() || {};
  const exportData = { ...pub };
  
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) {
      const dateStr = k.replace(STORAGE_PREFIX, "");
      exportData[dateStr] = JSON.parse(window.localStorage.getItem(k));
    }
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "public_results.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// 定数・ヘルパー・フォーマット
// ============================================================
const MARK_BG = { "◎": "#EF4444", "○": "#3B82F6", "▲": "#F59E0B", "△": "#22C55E" };
const GATE_BG = ["","#FFFFFF","#111111","#EF4444","#3B82F6","#F59E0B","#22C55E","#F97316","#EC4899"];
const GATE_FG = ["","#111111","#FFFFFF","#FFFFFF","#FFFFFF","#111111","#FFFFFF","#FFFFFF","#FFFFFF"];

const VENUE_MAP = {
  "SAPPORO": "札幌", "HAKODATE": "函館", "FUKUSHIMA": "福島", "NIIGATA": "新潟",
  "TOKYO": "東京", "NAKAYAMA": "中山", "CHUKYO": "中京", "KYOTO": "京都",
  "HANSHIN": "阪神", "KOKURA": "小倉"
};

function formatRaceLabel(labelOrId) {
  if (!labelOrId) return "";
  let res = labelOrId;
  const match = res.match(/_([A-Za-z]+)_0*(\d+)/);
  if (match) {
    const vName = VENUE_MAP[match[1].toUpperCase()] || match[1];
    res = `${vName}${match[2]}R`;
  }
  for (const [en, jp] of Object.entries(VENUE_MAP)) {
    res = res.replace(new RegExp(en, "ig"), jp);
  }
  return res.replace(/_/g, " ");
}

function fmt(d) { 
  if (!d) return "";
  const date = new Date(d);
  const days = ["日","月","火","水","木","金","土"];
  return `${date.getMonth()+1}/${date.getDate()}(${days[date.getDay()]})`;
}

function monthLabel(ym) {
  if (!ym) return "";
  return `${parseInt(ym.split("-")[1])}月`;
}

// ============================================================
// 🌟 確率計算ロジック（UI表示用）
// ============================================================
function calcUmarenProb(p1_100, p2_100) {
  const p1 = (p1_100 || 0) / 100, p2 = (p2_100 || 0) / 100;
  const eps = 1e-9;
  return ((p1 * p2 / (1 - p1 + eps)) + (p2 * p1 / (1 - p2 + eps))) * 100;
}

function calcWideProb(w1, w2) {
  const p1 = (w1.top3_prob || 0) / 100, p2 = (w2.top3_prob || 0) / 100;
  const base = p1 * p2 * 0.85;
  const umaren = calcUmarenProb(w1.win_prob, w2.win_prob) / 100;
  return Math.min(Math.max(base, umaren * 2.5), 0.999) * 100;
}

// ============================================================
// シミュレーション計算ロジック
// ============================================================
function initStats() {
  return { 
    validRaces:0, 
    tsHit:0, tsBet:0, tsRet:0, tsList: [],
    umHit:0, umBet:0, umRet:0, umList: [],
    wdHit:0, wdBet:0, wdRet:0, wdList: []
  };
}

function updateStats(st, r) {
  st.validRaces++;
  const p_ts = Number(r.payouts?.tansho || 0);
  const p_um = Number(r.payouts?.umaren || 0);

  const fallback = h => h.mark==="◎"?100:h.mark==="○"?90:h.mark==="▲"?80:h.mark==="△"?70:0;
  const winS = [...r.horses].sort((a,b)=>(b.win_prob||fallback(b)) - (a.win_prob||fallback(a)));
  const t3S = [...r.horses].sort((a,b)=>(b.top3_prob||fallback(b)) - (a.top3_prob||fallback(a)));

  const raceName = formatRaceLabel(r.race_label);
  const rawDate = r.dateStr || "";
  const displayDate = fmt(rawDate);

  st.tsBet += 100;
  if (winS[0]?.rank === 1) { 
    st.tsHit++; st.tsRet += p_ts; 
    st.tsList.push({ rawDate, date: displayDate, race: raceName, type: "単勝", ret: p_ts, horse: winS[0].name, prob: winS[0].win_prob || 0 });
  }

  st.umBet += 100;
  const u1=winS[0], u2=winS[1];
  if (u1?.rank>0 && u2?.rank>0 && u1.rank<=2 && u2.rank<=2) { 
    st.umHit++; st.umRet += p_um; 
    st.umList.push({ rawDate, date: displayDate, race: raceName, type: "馬連", ret: p_um, horse: `${u1.name} - ${u2.name}`, prob: calcUmarenProb(u1.win_prob, u2.win_prob) });
  }

  st.wdBet += 100;
  const w1h=t3S[0], w2h=t3S[1];
  if (w1h?.rank>0 && w2h?.rank>0 && w1h.rank<=3 && w2h.rank<=3) { 
    st.wdHit++;
    const hitPair = [w1h.no, w2h.no].sort((a,b)=>a-b).join("-");
    const ranked = [...r.horses].filter(h=>h.rank>0).sort((a,b)=>a.rank-b.rank);
    const r1 = ranked[0], r2 = ranked[1], r3 = ranked[2];
    
    const pair12 = r1&&r2 ? [r1.no, r2.no].sort((a,b)=>a-b).join("-") : "";
    const pair13 = r1&&r3 ? [r1.no, r3.no].sort((a,b)=>a-b).join("-") : "";
    const pair23 = r2&&r3 ? [r2.no, r3.no].sort((a,b)=>a-b).join("-") : "";
    
    let p_wd = 0;
    if (hitPair === pair12) p_wd = Number(r.payouts?.wide1 || 0);
    else if (hitPair === pair13) p_wd = Number(r.payouts?.wide2 || 0);
    else if (hitPair === pair23) p_wd = Number(r.payouts?.wide3 || 0);
    
    st.wdRet += p_wd; 
    st.wdList.push({ rawDate, date: displayDate, race: raceName, type: "ワイド", ret: p_wd, horse: `${w1h.name} - ${w2h.name}`, prob: calcWideProb(w1h, w2h) });
  }
}

function calcSimStats(races) {
  const res = { ALL: initStats(), SS: initStats(), S: initStats(), A: initStats(), B: initStats(), C: initStats() };
  races.forEach(r => {
      const filled = r.horses.filter(h=>h.rank>0);
      if (filled.length < 3) return;
      const rank = r.confidence_rank || "C";
      updateStats(res.ALL, r);
      if (res[rank]) updateStats(res[rank], r);
  });
  return res;
}

// ============================================================
// UIコンポーネント群
// ============================================================
function GateBall({ gate, no, size=26 }) {
  const bg=GATE_BG[gate]??"#6B7280", fg=GATE_FG[gate]??"#FFF";
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
    width:size,height:size,borderRadius:"50%",flexShrink:0,background:bg,color:fg,
    fontSize:11,fontWeight:700,border:gate===1?"1.5px solid #94A3B8":"none"}}>{no}</span>;
}

function MarkBadge({ mark }) {
  const bg = MARK_BG[mark];
  if (!bg) return <span style={{width:24,flexShrink:0}}/>;
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
    width:24,height:24,borderRadius:4,background:bg,color:"#FFF",
    fontSize:13,fontWeight:800,flexShrink:0}}>{mark}</span>;
}

function RankInput({ value, onChange }) {
  return (
    <input type="number" min="1" max="18" value={value || ""} placeholder="着"
      onChange={e => onChange(e.target.value ? parseInt(e.target.value) : 0)}
      style={{ width:40, height:30, borderRadius:6, border:"1px solid #334155", background:"#0F172A",
        color:"#F1F5F9", fontSize:13, fontWeight:700, textAlign:"center", padding:0, outline:"none" }} />
  );
}

function AmountInput({ label, value, onChange }) {
  return (
    <div style={{display:"flex", alignItems:"center", gap:6}}>
      <span style={{color:"#94A3B8", fontSize:11, width:64, flexShrink:0, textAlign:"right"}}>{label}</span>
      <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder="0"
        style={{flex:1, height:30, borderRadius:6, border:"1px solid #334155", background:"#1E293B", 
        color:"#FFF", fontSize:13, padding:"0 8px", outline:"none"}} />
    </div>
  );
}

// 🌟 的中履歴ポップアップ（レースごとにグループ化＆確率表示版）
function HitHistoryModal({ stats, onClose }) {
  const hits = [...stats.tsList, ...stats.umList, ...stats.wdList];
  
  // レースごとにグループ化
  const grouped = {};
  hits.forEach(h => {
     const key = `${h.rawDate}__${h.race}`;
     if (!grouped[key]) grouped[key] = { rawDate: h.rawDate, date: h.date, race: h.race, items: [], totalRet: 0 };
     grouped[key].items.push(h);
     grouped[key].totalRet += h.ret;
  });
  
  // 日付の降順、同じ日付なら合計配当額の降順でソート
  const groupedArray = Object.values(grouped).sort((a,b) => {
     if (a.rawDate !== b.rawDate) return b.rawDate.localeCompare(a.rawDate);
     return b.totalRet - a.totalRet;
  });

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.7)",display:"flex",flexDirection:"column",justifyContent:"center", padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1E293B",borderRadius:16,maxHeight:"85vh",display:"flex",flexDirection:"column", overflow:"hidden", border:"1px solid #334155"}}>
        <div style={{padding:"16px", borderBottom:"1px solid #334155", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#0F172A"}}>
           <span style={{color:"#FFF", fontWeight:"bold", fontSize:16}}>🎯 的中レース一覧</span>
           <button onClick={onClose} style={{background:"none",border:"none",color:"#94A3B8",fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <div style={{flex:1, overflowY:"auto", padding:"16px", background:"#0F172A"}}>
           {groupedArray.length === 0 ? <div style={{textAlign:"center", color:"#64748B", padding:24, fontSize:13}}>的中履歴がありません</div> :
              groupedArray.map((g, i) => (
                <div key={i} style={{background:"#1E293B", borderRadius:10, marginBottom:12, border:"1px solid #334155", overflow:"hidden"}}>
                   {/* レース単位のヘッダー */}
                   <div style={{background:"#334155", padding:"8px 14px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <span style={{color:"#F1F5F9", fontSize:13, fontWeight:"bold"}}>{g.date} - {g.race}</span>
                      <span style={{color:"#F59E0B", fontSize:12, fontWeight:"bold"}}>計 {g.totalRet} 円</span>
                   </div>
                   {/* 当たった券種ごとのリスト */}
                   <div style={{padding:"4px 14px"}}>
                     {g.items.map((h, j) => (
                       <div key={j} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom: j!==g.items.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none"}}>
                          <div style={{display:"flex", alignItems:"center", gap:10}}>
                              <span style={{
                                background: h.type==="単勝"?"rgba(245,158,11,0.15)":h.type==="馬連"?"rgba(139,92,246,0.15)":"rgba(59,130,246,0.15)",
                                color: h.type==="単勝"?"#F59E0B":h.type==="馬連"?"#C084FC":"#60A5FA",
                                padding:"3px 8px", borderRadius:6, fontSize:11, fontWeight:"bold", width:44, textAlign:"center"
                              }}>{h.type}</span>
                              <div style={{display:"flex", flexDirection:"column"}}>
                                <span style={{color:"#F1F5F9", fontSize:14, fontWeight:600}}>{h.horse}</span>
                                <span style={{color:"#64748B", fontSize:11}}>AI推定確率: <span style={{color:"#94A3B8"}}>{h.prob?.toFixed(1)}%</span></span>
                              </div>
                          </div>
                          <span style={{color:"#F59E0B", fontSize:16, fontWeight:800}}>{h.ret}<span style={{fontSize:11, fontWeight:"normal", marginLeft:2}}>円</span></span>
                       </div>
                     ))}
                   </div>
                </div>
              ))
           }
        </div>
      </div>
    </div>
  );
}

function RankTableRow({ label, st, isTotal=false }) {
  if (!st || st.validRaces === 0) return null;
  const tsH = st.tsBet > 0 ? Math.round((st.tsHit/(st.tsBet/100))*100) : 0;
  const umH = st.umBet > 0 ? Math.round((st.umHit/(st.umBet/100))*100) : 0;
  const wdH = st.wdBet > 0 ? Math.round((st.wdHit/(st.wdBet/100))*100) : 0;

  const tsR = st.tsBet > 0 ? Math.round((st.tsRet/st.tsBet)*100) : 0;
  const umR = st.umBet > 0 ? Math.round((st.umRet/st.umBet)*100) : 0;
  const wdR = st.wdBet > 0 ? Math.round((st.wdRet/st.wdBet)*100) : 0;
  
  const fmtStr = (h, r) => (
      <div style={{display:"flex", flexDirection:"column", alignItems:"center"}}>
          <span style={{color:r>=100?"#F59E0B":"#F1F5F9", fontSize:14, fontWeight:800}}>{r}%</span>
          <span style={{color:"#64748B", fontSize:9, marginTop:1}}>{h}%的中</span>
      </div>
  );

  return (
      <div style={{display:"flex", borderBottom:"1px solid #334155", padding:"8px 0", alignItems:"center", background:isTotal?"rgba(59,130,246,.1)":"transparent"}}>
          <div style={{width:36, color:isTotal?"#60A5FA":"#E2E8F0", fontWeight:800, fontSize:13, textAlign:"center"}}>{label}</div>
          <div style={{width:36, color:"#94A3B8", fontSize:11, textAlign:"center", fontWeight:600}}>{st.validRaces}R</div>
          <div style={{flex:1}}>{fmtStr(tsH, tsR)}</div>
          <div style={{flex:1}}>{fmtStr(umH, umR)}</div>
          <div style={{flex:1}}>{fmtStr(wdH, wdR)}</div>
      </div>
  );
}

function StatsPanel({ statsObj, title, onClick }) {
  const st = statsObj.ALL;
  if (!st || st.validRaces === 0) return null;
  return (
    <div onClick={onClick} style={{margin:"12px 12px 4px", padding:"14px", background:"#1E293B", borderRadius:12, border:"1px solid #334155", cursor:onClick?"pointer":"default", transition:"all .2s"}} onMouseEnter={e=>onClick&&(e.currentTarget.style.borderColor="#3B82F6")} onMouseLeave={e=>onClick&&(e.currentTarget.style.borderColor="#334155")}>
      <div style={{color:"#F1F5F9", fontSize:13, fontWeight:800, marginBottom:10, display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div style={{display:"flex", alignItems:"center", gap:6}}><span>🤖</span> {title}</div>
        {onClick && <span style={{color:"#60A5FA", fontSize:11, fontWeight:"bold", background:"rgba(59,130,246,0.15)", padding:"3px 10px", borderRadius:12}}>タップで的中履歴 ›</span>}
      </div>
      
      <div style={{background:"#0F172A", borderRadius:8, padding:"8px 12px", border:"1px solid #334155"}}>
        <div style={{display:"flex", borderBottom:"1px solid #334155", paddingBottom:6, marginBottom:4}}>
            <div style={{width:36, color:"#64748B", fontSize:10, textAlign:"center"}}>ランク</div>
            <div style={{width:36, color:"#64748B", fontSize:10, textAlign:"center"}}>レース</div>
            <div style={{flex:1, color:"#64748B", fontSize:10, textAlign:"center"}}>単勝回収</div>
            <div style={{flex:1, color:"#64748B", fontSize:10, textAlign:"center"}}>馬連回収</div>
            <div style={{flex:1, color:"#64748B", fontSize:10, textAlign:"center"}}>ﾜｲﾄﾞ回収</div>
        </div>
        <RankTableRow label="全体" st={statsObj.ALL} isTotal={true} />
        {["SS","S","A","B","C"].map(r => <RankTableRow key={r} label={r} st={statsObj[r]} />)}
      </div>
    </div>
  );
}

// ============================================================
// 入力モーダル
// ============================================================
function EntryModal({ date, raceData, existing, onSave, onClose }) {
  const [races, setRaces] = useState(() => {
    if (existing?.races) {
      return existing.races.map(r => ({
        ...r, payouts: r.payouts || {tansho:"", wide1:"", wide2:"", wide3:"", umaren:"", sanrenpuku:"", sanrentan:""}
      }));
    }
    if (raceData?.length) return raceData.map(r => ({
      race_id: r.race_id, race_label: formatRaceLabel(r.label ?? r.race_id), confidence_rank: r.confidence_rank ?? "C",
      horses: r.horses.map(h => ({
        no: h.no, gate: h.gate, name: h.name, mark: h.mark, rank: 0,
        win_prob: h.win_prob, top3_prob: h.top3_prob 
      })),
      payouts: {tansho:"", wide1:"", wide2:"", wide3:"", umaren:"", sanrenpuku:"", sanrentan:""}
    }));
    return [];
  });

  const [activeRace, setActiveRace] = useState(0);

  const updateRank = (raceIdx, horseIdx, rank) => {
    setRaces(prev => {
      const next = [...prev];
      next[raceIdx].horses[horseIdx].rank = rank;
      return next;
    });
  };

  const updatePayout = (raceIdx, key, val) => {
    setRaces(prev => {
      const next = [...prev];
      next[raceIdx].payouts = { ...next[raceIdx].payouts, [key]: val };
      return next;
    });
  };

  const cur = races[activeRace];

  const ranked = cur ? [...cur.horses].filter(h=>h.rank>0).sort((a,b)=>a.rank-b.rank) : [];
  const r1 = ranked[0], r2 = ranked[1], r3 = ranked[2];
  const w12 = r1&&r2 ? `${r1.no}-${r2.no}` : "1着-2着";
  const w13 = r1&&r3 ? `${r1.no}-${r3.no}` : "1着-3着";
  const w23 = r2&&r3 ? `${r2.no}-${r3.no}` : "2着-3着";

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.7)",
      display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:"#1E293B",borderRadius:"20px 20px 0 0",
        maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
        
        <div style={{padding:"16px 16px 0",flexShrink:0}}>
          <div style={{width:36,height:4,background:"#475569",borderRadius:2,margin:"0 auto 14px"}}/>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <span style={{color:"#F1F5F9",fontWeight:800,fontSize:16}}>{date ? fmt(date) : ""} 結果入力</span>
            <button onClick={onClose} style={{background:"none",border:"none",color:"#64748B",fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
          </div>
          {races.length > 0 && (
            <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:8}}>
              {races.map((r, i) => {
                const filled = r.horses.filter(h => h.rank > 0).length;
                return (
                  <button key={i} onClick={() => setActiveRace(i)} style={{
                    flexShrink:0,padding:"5px 10px",borderRadius:6,border:"1px solid #334155",cursor:"pointer",fontSize:11,fontWeight:600,
                    background:activeRace===i?"#3B82F6":"transparent",color:activeRace===i?"#FFF":"#94A3B8",position:"relative"
                  }}>
                    {formatRaceLabel(r.race_label).replace(/東京|京都|阪神|中京|福島|新潟|小倉|中山/g,"")}
                    {filled > 0 && <span style={{position:"absolute",top:-4,right:-4,background:filled===r.horses.length?"#22C55E":"#F59E0B",color:"#000",borderRadius:8,padding:"0 4px",fontSize:9,fontWeight:800}}>{filled}/{r.horses.length}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"0 16px"}}>
          {!cur ? <div style={{color:"#64748B",textAlign:"center",padding:32,fontSize:13}}>レースデータなし</div> : (
            <div style={{paddingBottom:20}}>
              <p style={{color:"#64748B",fontSize:11,margin:"8px 0 12px"}}>{formatRaceLabel(cur.race_label)} — 着順入力（0=除外）</p>
              {cur.horses.sort((a,b)=>{
                  const mo={"◎":0,"○":1,"▲":2,"△":3};
                  return (mo[a.mark]??9) - (mo[b.mark]??9) || a.no-b.no;
                }).map((h) => {
                  const realIdx = cur.horses.findIndex(x => x.no === h.no);
                  return (
                    <div key={h.no} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 0",borderBottom:"1px solid #1E293B"}}>
                      <MarkBadge mark={h.mark}/>
                      <GateBall gate={h.gate} no={h.no} size={26}/>
                      <span style={{flex:1,color:"#E2E8F0",fontSize:13,fontWeight:h.mark in MARK_BG?600:400}}>{h.name}</span>
                      <RankInput value={h.rank} onChange={v => updateRank(activeRace, realIdx, v)} />
                      {h.rank > 0 && <span style={{color: h.rank===1?"#F59E0B":h.rank<=3?"#60A5FA":"#64748B",fontWeight:700,fontSize:12,width:24,textAlign:"center",flexShrink:0}}>{h.rank}着</span>}
                    </div>
                  );
              })}

              <div style={{marginTop:24, padding:"12px", background:"#0F172A", borderRadius:10, border:"1px solid #334155"}}>
                <div style={{color:"#F1F5F9", fontSize:12, fontWeight:700, marginBottom:10}}>💰 公式配当金（100円換算 / AI回収率計算用）</div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                  <AmountInput label="単勝" value={cur.payouts?.tansho||""} onChange={v=>updatePayout(activeRace, "tansho", v)} />
                  <AmountInput label="馬連" value={cur.payouts?.umaren||""} onChange={v=>updatePayout(activeRace, "umaren", v)} />
                  <AmountInput label={`ﾜｲﾄﾞ ${w12}`} value={cur.payouts?.wide1||""} onChange={v=>updatePayout(activeRace, "wide1", v)} />
                  <AmountInput label={`ﾜｲﾄﾞ ${w13}`} value={cur.payouts?.wide2||""} onChange={v=>updatePayout(activeRace, "wide2", v)} />
                  <div style={{gridColumn:"span 2"}}>
                     <AmountInput label={`ﾜｲﾄﾞ ${w23}`} value={cur.payouts?.wide3||""} onChange={v=>updatePayout(activeRace, "wide3", v)} />
                  </div>
                  <AmountInput label="3連複" value={cur.payouts?.sanrenpuku||""} onChange={v=>updatePayout(activeRace, "sanrenpuku", v)} />
                  <AmountInput label="3連単" value={cur.payouts?.sanrentan||""} onChange={v=>updatePayout(activeRace, "sanrentan", v)} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{padding:"12px 16px 28px",borderTop:"1px solid #1E293B",flexShrink:0,display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:"12px 0",background:"#334155",border:"none",borderRadius:10,color:"#94A3B8",fontSize:14,fontWeight:600,cursor:"pointer"}}>キャンセル</button>
          <button onClick={() => onSave({ date, races })} style={{flex:2,padding:"12px 0",background:"#3B82F6",border:"none",borderRadius:10,color:"#FFF",fontSize:14,fontWeight:700,cursor:"pointer"}}>保存する</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// メイン画面群
// ============================================================
function DayResultView({ dateStr, raceList, onEdit, onBack }) {
  const [dayData, setDayData] = useState(null);
  const [hitModal, setHitModal] = useState(null);

  useEffect(() => { loadDay(dateStr).then(d => { setDayData(d); }); }, [dateStr]);
  const races = dayData?.races ?? [];
  races.forEach(r => r.dateStr = dateStr);
  const simStats = calcSimStats(races);

  return (
    <div style={{background:"#0F172A",minHeight:"100vh"}}>
      <div style={{position:"sticky",top:0,zIndex:10,background:"#0F172A",borderBottom:"1px solid #1E293B",padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#94A3B8",fontSize:26,cursor:"pointer",padding:"0 4px",lineHeight:1}}>‹</button>
          <span style={{color:"#F1F5F9",fontWeight:800,fontSize:17}}>{fmt(dateStr)} の結果</span>
          <button onClick={onEdit} style={{marginLeft:"auto",padding:"6px 14px",background:"#3B82F6",border:"none",borderRadius:8,color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>{races.length>0?"編集":"着順・配当入力"}</button>
        </div>
      </div>

      {races.length === 0 ? (
        <div style={{textAlign:"center",padding:"60px 20px",color:"#64748B",fontSize:13}}><div style={{fontSize:36,marginBottom:12}}>📝</div>まだ着順・配当が入力されていません<br/>
          <button onClick={onEdit} style={{marginTop:16,padding:"10px 24px",background:"#3B82F6",border:"none",borderRadius:10,color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer"}}>結果を入力する</button>
        </div>
      ) : (
        <div style={{padding:"0 0 40px"}}>
          <StatsPanel statsObj={simStats} title="本日のAI推奨 マトリクス分析" onClick={() => setHitModal(simStats.ALL)} />

          {races.map((race, ri) => (
            <div key={ri} style={{margin:"10px 12px 0",background:"#1E293B",borderRadius:12,border:"1px solid #334155",overflow:"hidden"}}>
              <div style={{padding:"10px 14px",background:"#0F172A",borderBottom:"1px solid #1E293B"}}><span style={{color:"#F1F5F9",fontWeight:700,fontSize:14}}>{formatRaceLabel(race.race_label)}</span></div>
              {race.horses.filter(h=>h.rank>0).sort((a,b)=>a.rank-b.rank).map((h)=>(
                <div key={h.no} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderBottom:"1px solid #1E293B",background:h.rank<=3?"rgba(59,130,246,.04)":"transparent"}}>
                  <span style={{width:30,textAlign:"center",flexShrink:0,color:h.rank===1?"#F59E0B":h.rank===2?"#94A3B8":h.rank===3?"#CD7F32":"#475569",fontWeight:800,fontSize:h.rank<=3?15:13}}>{h.rank}着</span>
                  <GateBall gate={h.gate} no={h.no} size={24}/>
                  <MarkBadge mark={h.mark}/>
                  <span style={{flex:1,color:h.rank<=3?"#F1F5F9":"#94A3B8",fontSize:13,fontWeight:h.mark in MARK_BG?600:400}}>{h.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {hitModal && <HitHistoryModal stats={hitModal} onClose={() => setHitModal(null)} />}
    </div>
  );
}

function MonthView({ ym, allKeys, raceList, onSelectDate }) {
  const days = allKeys.filter(k => k.startsWith(ym));
  const today = new Date().toISOString().slice(0,10);
  const showToday = ym === today.slice(0,7) && !days.includes(today);
  const racedays = raceList.map(r => r._date).filter(Boolean).filter(d => d && d.startsWith(ym));
  const allDays = [...new Set([...days, ...(showToday?[today]:[]), ...racedays])].sort().reverse();

  return (
    <div style={{padding:"8px 12px 40px"}}>
      {allDays.length === 0 ? <div style={{textAlign:"center",padding:"48px 16px",color:"#64748B",fontSize:13}}>この月の記録はありません</div> : (
        allDays.map(d => {
          const hasData = days.includes(d);
          const isToday = d === today;
          return (
            <button key={d} onClick={() => onSelectDate(d)} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"14px 14px",marginBottom:8,background:"#1E293B",border:`1px solid ${hasData?"#334155":"#1E293B"}`,borderRadius:12,cursor:"pointer",textAlign:"left"}}>
              <div style={{width:44,height:44,borderRadius:10,flexShrink:0,background:isToday?"#3B82F6":hasData?"#1E3A5F":"#0F172A",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <span style={{color:isToday?"#FFF":hasData?"#60A5FA":"#475569",fontWeight:800,fontSize:18,lineHeight:1}}>{parseInt(d.slice(8))}</span>
                <span style={{color:isToday?"rgba(255,255,255,.7)":hasData?"#64748B":"#334155",fontSize:9,marginTop:1}}>{["日","月","火","水","木","金","土"][new Date(d).getDay()]}</span>
              </div>
              <div style={{flex:1}}>
                <span style={{color:hasData?"#F1F5F9":"#64748B",fontWeight:600,fontSize:14}}>{fmt(d)}</span>
                {isToday && <span style={{marginLeft:8,color:"#60A5FA",fontSize:11,fontWeight:700}}>今日</span>}
                <div style={{color:hasData?"#64748B":"#334155",fontSize:11,marginTop:3}}>{hasData?"記録・配当あり":"未記録 — タップして入力"}</div>
              </div>
              <span style={{color:"#475569",fontSize:18}}>›</span>
            </button>
          );
        })
      )}
    </div>
  );
}

function MonthSummary({ ym }) {
  const [stats, setStats] = useState(null);
  const [hitModal, setHitModal] = useState(null);

  useEffect(() => {
    (async () => {
      const keys = await listAllKeys();
      const monthKeys = keys.filter(k => k.startsWith(ym));
      let allRaces = [];
      for (const k of monthKeys) {
        const d = await loadDay(k);
        if (d?.races) {
            d.races.forEach(r => r.dateStr = k);
            allRaces = allRaces.concat(d.races);
        }
      }
      setStats(calcSimStats(allRaces));
    })();
  }, [ym]);

  if (!stats || stats.ALL.validRaces === 0) return null;
  return (
    <>
      <StatsPanel statsObj={stats} title={`${monthLabel(ym)} AI累計シミュレーション（全${stats.ALL.validRaces}R）`} onClick={() => setHitModal(stats.ALL)} />
      {hitModal && <HitHistoryModal stats={hitModal} onClose={() => setHitModal(null)} />}
    </>
  );
}

export default function PastResults({ raceList }) {
  const [allKeys, setAllKeys] = useState([]);
  const [activeYM, setActiveYM] = useState(() => new Date().toISOString().slice(0,7));
  const [viewDate, setViewDate] = useState(null);
  const [showEntry, setShowEntry] = useState(false);
  const [entryDate, setEntryDate] = useState(null);
  const [existing, setExisting] = useState(null);

  const refresh = useCallback(async () => {
    const keys = await listAllKeys();
    setAllKeys(keys);
    const today = new Date().toISOString().slice(0,7);
    if (!keys.some(k=>k.startsWith(today)) && activeYM !== today) {/* keep */}
  }, [activeYM]);

  useEffect(() => { refresh(); }, [refresh]);

  const ymList = [...new Set([new Date().toISOString().slice(0,7), ...allKeys.map(k=>k.slice(0,7))])].sort().reverse();

  const openEntry = async (dateStr) => {
    const ex = await loadDay(dateStr);
    setExisting(ex);
    setEntryDate(dateStr);
    setShowEntry(true);
  };

  const handleSave = async (data) => {
    await saveDay(data.date, data);
    await refresh();
    setShowEntry(false);
    setViewDate(data.date);
  };

  if (viewDate) {
    return (
      <>
        <DayResultView dateStr={viewDate} raceList={raceList} onEdit={() => openEntry(viewDate)} onBack={() => setViewDate(null)} />
        {showEntry && <EntryModal date={entryDate} raceData={raceList} existing={existing} onSave={handleSave} onClose={() => setShowEntry(false)} />}
      </>
    );
  }

  return (
    <div style={{background:"#0F172A",minHeight:"100%"}}>
      <div style={{position:"sticky",top:0,zIndex:10,background:"#0F172A",borderBottom:"1px solid #1E293B"}}>
        <div style={{padding:"12px 14px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{color:"#F1F5F9",fontWeight:800,fontSize:17}}>過去レース結果</span>
            <div>
              <button onClick={() => openEntry(new Date().toISOString().slice(0,10))} style={{padding:"6px 12px",background:"#3B82F6",border:"none",borderRadius:8,color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>＋ 入力</button>
              <button onClick={exportPublicJson} style={{padding:"6px 12px",background:"#10B981",border:"none",borderRadius:8,color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer", marginLeft:8}}>📥 公開</button>
            </div>
          </div>
          <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:8}}>
            {ymList.map(ym => (
              <button key={ym} onClick={() => setActiveYM(ym)} style={{flexShrink:0,padding:"6px 16px",borderRadius:8,border:"1px solid #334155",cursor:"pointer",fontSize:13,fontWeight:700,background:activeYM===ym?"#3B82F6":"transparent",color:activeYM===ym?"#FFF":"#94A3B8",transition:"all .15s"}}>{monthLabel(ym)}</button>
            ))}
          </div>
        </div>
      </div>
      <MonthSummary ym={activeYM}/>
      <MonthView ym={activeYM} allKeys={allKeys} raceList={raceList} onSelectDate={d => setViewDate(d)} />
      {showEntry && <EntryModal date={entryDate} raceData={raceList} existing={existing} onSave={handleSave} onClose={() => setShowEntry(false)} />}
    </div>
  );
}