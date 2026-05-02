/**
 * App.jsx — 競馬AI 予測UI（EV ランキング・過去結果統合版）
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import PastResults from "./PastResults";

const DATA_BASE    = "/data";
const DETAIL_CSV   = `${DATA_BASE}/race_detail_view.csv`;
const LIST_CSV     = `${DATA_BASE}/race_list_view.csv`;
const BETS_CSV     = `${DATA_BASE}/final_multi_bets.csv`;
const COMMENTS_CSV = `${DATA_BASE}/horse_comments.csv`;
const EV_CSV       = `${DATA_BASE}/combination_ev_ranking.csv`;

// 🌟 開催場マッピング（ローマ字を日本語に変換）
const VENUE_MAP = {
  "SAPPORO": "札幌", "HAKODATE": "函館", "FUKUSHIMA": "福島", "NIIGATA": "新潟",
  "TOKYO": "東京", "NAKAYAMA": "中山", "CHUKYO": "中京", "KYOTO": "京都",
  "HANSHIN": "阪神", "KOKURA": "小倉"
};

function parseCSV(text) {
  const s = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = s.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map(line => {
    const vals = []; let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; } else cur += ch;
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

async function fetchCSV(url) {
  try { const r = await fetch(`${url}?_=${Date.now()}`); return r.ok ? parseCSV(await r.text()) : []; }
  catch { return []; }
}

const toF = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
const toI = (v, d = 0) => { const n = parseInt(v);   return isNaN(n) ? d : n; };

function rowToHorse(row) {
  return {
    race_id: row.race_id ?? row["レース番号"] ?? "", no: toI(row["馬番"] ?? row.horse_no),
    gate: toI(row["枠番"] ?? row.gate_no), name: row["馬名"] ?? row.horse_name ?? "",
    jockey: row["騎手"] ?? row.jockey_name ?? "", mark: row["印"] ?? row.mark ?? "×",
    signal: row["signal"] ?? "様子見", ability: toF(row.ability_score, 20),
    win_prob: toF(row.win_prob) * 100, top3_prob: toF(row.top3_prob) * 100,
    win_odds: toF(row.win_odds, 10), win_ev: toF(row.win_ev, 0),
    confidence_rank: row.confidence_rank ?? "C", confidence_label: row.confidence_label ?? "難解",
  };
}

function buildRaces(detailRows, listRows) {
  const listMap = Object.fromEntries(listRows.map(r => [r.race_id ?? r["レース番号"] ?? "", r]));
  const raceMap = {};
  for (const row of detailRows) {
    const h = rowToHorse(row), rid = h.race_id; if (!rid) continue;
    if (!raceMap[rid]) {
      const m = listMap[rid] ?? {};
      // 🌟 ローマ字を日本語に変換してセット
      const rawVenue = m["開催"] ?? "";
      const jpVenue = VENUE_MAP[rawVenue.toUpperCase()] || rawVenue;

      raceMap[rid] = { race_id: rid, venue: jpVenue, race_no: m["レース番号"] ?? rid,
      race_name: m["レース名"] ?? "", distance: m["距離"] ? `${m["距離"]}m` : "",
      track_cond: m["馬場状態"] ?? "", field_size: toI(m.field_size ?? 0),
      confidence_rank: m.confidence_rank ?? "C", confidence_label: m.confidence_label ?? "難解", horses: [] };
    }
    raceMap[rid].horses.push(h);
  }
  for (const r of Object.values(raceMap)) {
    r.horses.sort((a, b) => b.ability - a.ability);
    if (!r.field_size) r.field_size = r.horses.length;
    if (r.confidence_rank === "C" && r.horses[0]?.confidence_rank) {
      r.confidence_rank = r.horses[0].confidence_rank; r.confidence_label = r.horses[0].confidence_label;
    }
    
    // 🌟 race_idの形式が「2024_TOKYO_01」のような場合も日本語化
    const match = r.race_id.match(/_([A-Za-z]+)_0*(\d+)/);
    if (match) {
       const vName = VENUE_MAP[match[1].toUpperCase()] || match[1];
       r.race_no = match[2]; 
       r.label = `${vName}${match[2]}R`;
       r.venue = vName;
    } else {
       r.race_no = r.race_no || "";
       r.label = r.venue && r.race_no ? `${r.venue}${r.race_no}R` : r.race_id;
    }
  }
  return Object.values(raceMap);
}

function buildCommentMap(rows) {
  const map = {};
  for (const row of rows) {
    const key = `${row.race_id ?? ""}__${row["馬名"] ?? ""}`;
    let tags = []; try { tags = JSON.parse(row.tags ?? "[]"); } catch {}
    map[key] = { tags, comment: row.comment ?? "" };
  }
  return map;
}

const GATE_BG = ["","#FFFFFF","#111111","#EF4444","#3B82F6","#F59E0B","#22C55E","#F97316","#EC4899"];
const GATE_FG = ["","#111111","#FFFFFF","#FFFFFF","#FFFFFF","#111111","#FFFFFF","#FFFFFF","#FFFFFF"];
const MARK_DEF = { "◎":{bg:"#EF4444",fg:"#FFFFFF",label:"◎"}, "○":{bg:"#3B82F6",fg:"#FFFFFF",label:"○"},
"▲":{bg:"#F59E0B",fg:"#111111",label:"▲"}, "△":{bg:"#22C55E",fg:"#FFFFFF",label:"△"} };
const RANK_DEF = { SS:{bg:"#F59E0B",fg:"#000000"}, S:{bg:"#EF4444",fg:"#FFFFFF"},
A:{bg:"#3B82F6",fg:"#FFFFFF"}, B:{bg:"#6B7280",fg:"#FFFFFF"}, C:{bg:"#374151",fg:"#9CA3AF"} };
const TAG_DEF  = { good:{bg:"#EF4444",fg:"#FFFFFF"}, bad:{bg:"#3B82F6",fg:"#FFFFFF"}, neutral:{bg:"#334155",fg:"#CBD5E1"} };
const ROW_HL   = { "◎":"rgba(239,68,68,.10)", "○":"rgba(59,130,246,.10)" };
const barCol   = s => s>=80?"#F59E0B":s>=60?"#60A5FA":s>=40?"#34D399":"#4B5563";

function GateBall({ gate, no, size=30 }) {
  const bg=GATE_BG[gate]??"#6B7280", fg=GATE_FG[gate]??"#FFF";
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
  width:size,height:size,borderRadius:"50%",flexShrink:0,background:bg,color:fg,
  fontSize:size<=26?11:13,fontWeight:700,border:gate===1?"1.5px solid #4B5563":"none"}}>{no}</span>;
}

function MarkIcon({ mark, size=26 }) {
  const d=MARK_DEF[mark]; if(!d) return <span style={{width:size,flexShrink:0}}/>;
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
  width:size,height:size,borderRadius:5,flexShrink:0,background:d.bg,color:d.fg,
  fontSize:size<=22?12:14,fontWeight:800}}>{d.label}</span>;
}

function MiniMark({ mark }) {
  const bg=MARK_DEF[mark]?.bg; if(!bg) return null;
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
  width:18,height:18,borderRadius:3,background:bg,color:"#FFF",fontSize:10,fontWeight:800,flexShrink:0}}>{mark}</span>;
}

function RankBadge({ rank, label, small=false }) {
  const d=RANK_DEF[rank]??RANK_DEF.C;
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,
  padding:small?"2px 7px":"4px 10px",borderRadius:7,background:d.bg,color:d.fg,
  fontSize:small?11:13,fontWeight:800,whiteSpace:"nowrap"}}>
  {rank}{!small&&label&&<span style={{fontWeight:500,fontSize:11,opacity:.9}}>{label}</span>}</span>;
}

function AbilityBar({ score, compact=false }) {
  const pct=Math.max(((score-20)/(92-20))*100,2), col=barCol(score);
  return <div style={{display:"flex",alignItems:"center",gap:compact?4:6}}>
  <span style={{color:"#F1F5F9",fontWeight:700,fontSize:compact?13:14,
  width:compact?34:36,textAlign:"right",flexShrink:0}}>{score.toFixed(1)}</span>
  <div style={{flex:1,height:compact?4:5,background:"#1E293B",borderRadius:3,overflow:"hidden",minWidth:compact?32:48}}>
  <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:3,transition:"width .4s ease"}}/></div></div>;
}

function HorsePopup({ horse, commentData, onClose }) {
  const { tags=[], comment="" } = commentData ?? {};
  return <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:100,
  background:"rgba(0,0,0,.55)",display:"flex",alignItems:"flex-end"}}>
  <div onClick={e=>e.stopPropagation()} style={{width:"100%",background:"#FFFFFF",
  borderRadius:"20px 20px 0 0",padding:"20px 18px 32px",maxHeight:"75vh",overflowY:"auto",animation:"slideUp .25s ease"}}>
  <div style={{width:36,height:4,borderRadius:2,background:"#CBD5E1",margin:"0 auto 16px"}}/>
  <div style={{marginBottom:10}}>
  <span style={{color:"#0F172A",fontWeight:800,fontSize:16}}>{horse.no}番　{horse.name}</span>
  <span style={{color:"#64748B",fontSize:13,marginLeft:8}}>{horse.jockey}</span>
  </div>
  {tags.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
  {tags.map((t,i)=>{const td=TAG_DEF[t.type]??TAG_DEF.neutral;
  return <span key={i} style={{padding:"4px 10px",borderRadius:20,background:td.bg,color:td.fg,fontSize:12,fontWeight:700}}>{t.label}</span>;})}
  </div>}
  {comment ? <p style={{color:"#1E293B",fontSize:13,lineHeight:1.75,margin:0,whiteSpace:"pre-wrap"}}>{comment}</p>
  : <p style={{color:"#94A3B8",fontSize:13}}>コメントなし（generate_comments.py を実行）</p>}
  <button onClick={onClose} style={{display:"block",width:"100%",marginTop:20,padding:"12px 0",
  background:"#F1F5F9",border:"none",borderRadius:10,color:"#475569",fontSize:14,fontWeight:600,cursor:"pointer"}}>閉じる</button>
  </div>
  <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
  </div>;
}

function DetailTable({ horses, commentMap, raceId }) {
  const [popup, setPopup] = useState(null);
  const getCD = h => commentMap[`${raceId}__${h.name}`] ?? null;
  return <div style={{paddingBottom:40}}>
  <div style={{display:"grid",gridTemplateColumns:"38px 32px 1fr 96px 52px 54px",
  padding:"7px 12px",color:"#475569",fontSize:11,borderBottom:"1px solid #1E293B",gap:4}}>
  <span>枠/馬</span><span>印</span><span style={{paddingLeft:6}}>馬名/騎手</span>
  <span style={{textAlign:"right"}}>AI指数</span><span style={{textAlign:"right"}}>勝率</span><span style={{textAlign:"right"}}>複勝率</span>
  </div>
  {horses.map(h=>{const cd=getCD(h),hasCmt=!!cd;
  return <div key={h.no} onClick={()=>hasCmt&&setPopup(h)}
  style={{display:"grid",gridTemplateColumns:"38px 32px 1fr 96px 52px 54px",alignItems:"center",gap:4,
  padding:"11px 12px",background:ROW_HL[h.mark]??"transparent",borderBottom:"1px solid #1E293B",cursor:hasCmt?"pointer":"default"}}>
  <div style={{display:"flex",justifyContent:"center"}}><GateBall gate={h.gate} no={h.no} size={30}/></div>
  <div style={{display:"flex",justifyContent:"center"}}><MarkIcon mark={h.mark} size={26}/></div>
  <div style={{paddingLeft:4}}>
  <div style={{display:"flex",alignItems:"center",gap:5}}>
  <span style={{color:"#F1F5F9",fontWeight:600,fontSize:13,lineHeight:1.3}}>{h.name}</span>
  {hasCmt&&<span style={{width:5,height:5,borderRadius:"50%",background:"#60A5FA",flexShrink:0}}/>}
  </div>
  <div style={{color:"#64748B",fontSize:11,marginTop:2}}>{h.jockey}</div>
  </div>
  <AbilityBar score={h.ability} compact/>
  <div style={{textAlign:"right"}}>
  <span style={{fontSize:13,fontWeight:700,color:h.win_prob>=15?"#F59E0B":h.win_prob>=10?"#E2E8F0":"#94A3B8"}}>{h.win_prob.toFixed(1)}%</span></div>
  <div style={{textAlign:"right"}}>
  <span style={{fontSize:12,color:h.top3_prob>=60?"#60A5FA":h.top3_prob>=40?"#93C5FD":"#64748B"}}>{h.top3_prob.toFixed(1)}%</span></div>
  </div>;})}
  {popup&&<HorsePopup horse={popup} commentData={getCD(popup)} onClose={()=>setPopup(null)}/>}
  </div>;
}

function EVRankingTab({ raceId, evData }) {
  const [filter,  setFilter]  = useState("全て");
  const [sortKey, setSortKey] = useState("prob");

  const rows = useMemo(()=>
  (evData||[]).filter(r=>(r.race_id??"")===String(raceId)),
  [evData, raceId]
  );
  const displayed = useMemo(()=>
  rows.filter(r=>filter==="全て"||r.bet_type===filter)
  .sort((a,b)=>toF(b[sortKey])-toF(a[sortKey])),
  [rows, filter, sortKey]
  );
  const uC=rows.filter(r=>r.bet_type==="馬連").length;
  const wC=rows.filter(r=>r.bet_type==="ワイド").length;
  const pColor=p=>p>=30?"#F59E0B":p>=20?"#34D399":p>=10?"#60A5FA":"#64748B";

  if (!rows.length) return (
  <div style={{padding:"40px 16px",textAlign:"center",color:"#64748B",fontSize:13}}>
  <div style={{fontSize:28,marginBottom:10}}>📊</div>確率ランキングデータなし<br/>
  <span style={{fontSize:11,color:"#475569"}}>combination_ev_ranking.py を実行</span>
  </div>
  );

  return <div style={{paddingBottom:48}}>
  <div style={{display:"flex",gap:8,padding:"12px 14px",borderBottom:"1px solid #1E293B",overflowX:"auto"}}>
  {[{label:"馬連",count:uC,color:"#8B5CF6"},{label:"ワイド",count:wC,color:"#3B82F6"}].map(s=>(
  <div key={s.label} style={{flexShrink:0,padding:"6px 16px",borderRadius:8,
  background:"#1E293B",border:"1px solid #334155",textAlign:"center",minWidth:80}}>
  <div style={{color:s.color,fontWeight:800,fontSize:20}}>{s.count}</div>
  <div style={{color:"#64748B",fontSize:10,marginTop:1}}>{s.label} TOP{Math.min(s.count,10)}</div>
  </div>))}
  <div style={{flexShrink:0,padding:"6px 12px",borderRadius:8,background:"#1E293B",
  border:"1px solid #334155",fontSize:11,color:"#64748B",display:"flex",
  alignItems:"center",lineHeight:1.5}}>
  確率 = モデルの推定的中率
  </div>
  </div>

  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
    padding:"10px 14px",borderBottom:"1px solid #1E293B",gap:8}}>
    <div style={{display:"flex",gap:4}}>
      {["全て","馬連","ワイド"].map(f=>(
        <button key={f} onClick={()=>setFilter(f)} style={{padding:"5px 10px",borderRadius:6,
          border:"1px solid #334155",cursor:"pointer",fontSize:11,fontWeight:600,
          background:filter===f?"#3B82F6":"transparent",color:filter===f?"#FFF":"#94A3B8",
          transition:"all .15s"}}>{f}</button>))}
    </div>
    <select value={sortKey} onChange={e=>setSortKey(e.target.value)} style={{background:"#1E293B",
      color:"#94A3B8",border:"1px solid #334155",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>
      <option value="prob">確率順</option>
      <option value="rank">ランク順</option>
    </select>
  </div>

  {displayed.map((r,i)=>{
    const prob=toF(r.prob), col=pColor(prob), isU=r.bet_type==="馬連";
    const barPct=Math.min(prob/50*100,100);
    return <div key={i} style={{padding:"13px 14px",borderBottom:"1px solid #1E293B"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <span style={{color:"#475569",fontSize:12,fontWeight:700,width:22,textAlign:"right",flexShrink:0}}>{i+1}</span>
        <span style={{background:isU?"#8B5CF6":"#3B82F6",color:"#FFF",borderRadius:4,
          padding:"2px 8px",fontSize:11,fontWeight:700,flexShrink:0}}>{r.bet_type}</span>
        <span style={{color:"#F1F5F9",fontWeight:800,fontSize:16}}>{r.numbers}</span>
        <div style={{marginLeft:"auto",textAlign:"right"}}>
          <span style={{color:col,fontWeight:900,fontSize:24,letterSpacing:"-0.5px"}}>{prob.toFixed(1)}</span>
          <span style={{color:col,fontWeight:700,fontSize:14}}>%</span>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,paddingLeft:30}}>
        <MiniMark mark={r.mark1}/><span style={{color:"#CBD5E1",fontSize:13}}>{r.name1}</span>
        <span style={{color:"#475569",fontSize:13,margin:"0 2px"}}>×</span>
        <MiniMark mark={r.mark2}/><span style={{color:"#CBD5E1",fontSize:13}}>{r.name2}</span>
      </div>
      <div style={{paddingLeft:30,display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1,height:6,background:"#1E293B",borderRadius:3,overflow:"hidden"}}>
          <div style={{width:`${barPct}%`,height:"100%",background:col,borderRadius:3,transition:"width .4s ease"}}/>
        </div>
        <span style={{color:"#475569",fontSize:10,flexShrink:0,width:24,textAlign:"right"}}>
          {prob>=30?"高":prob>=20?"中":prob>=10?"低":"微"}
        </span>
      </div>
    </div>;})}
  </div>;
}

function BetsPanel({ bets }) {
  if (!bets.length) return <div style={{color:"#64748B",textAlign:"center",padding:"48px 16px",fontSize:13}}>
  <div style={{fontSize:32,marginBottom:12}}>📋</div>買い目データなし</div>;
  const BC={"単勝":"#F59E0B","複勝":"#22C55E","ワイド":"#3B82F6","馬連":"#8B5CF6","3連複":"#EC4899","3連単":"#EF4444"};
  const byType={};
  for(const b of bets){const t=b.bet_type??"その他";(byType[t]??=[]).push(b);}
  return <div style={{paddingBottom:40}}>
  {Object.entries(byType).map(([type,rows])=>(
  <div key={type} style={{marginBottom:4}}>
  <div style={{padding:"8px 14px",display:"flex",alignItems:"center",gap:8,background:"#1E293B"}}>
  <span style={{background:BC[type]??"#475569",color:"#FFF",borderRadius:5,padding:"2px 10px",fontSize:12,fontWeight:700}}>{type}</span>
  <span style={{color:"#64748B",fontSize:12}}>{rows.length}点</span>
  </div>
  {rows.map((b,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
  padding:"10px 14px",borderBottom:"1px solid #1E293B"}}>
  <span style={{color:"#E2E8F0",fontSize:13,fontWeight:600}}>{b.numbers??""}</span>
  <span style={{color:"#64748B",fontSize:12}}>{b.recommendation??""}</span>
  </div>)}
  </div>))}
  </div>;
}

function RaceDetail({ race, bets, commentMap, evData, onBack }) {
  const [tab, setTab] = useState("予想");
  const raceBets=bets.filter(b=>(b.race_id??"")===race.race_id);
  return <div style={{minHeight:"100vh",background:"#0F172A",display:"flex",flexDirection:"column"}}>
  <div style={{position:"sticky",top:0,zIndex:20,background:"#0F172A",borderBottom:"1px solid #1E293B",padding:"12px 14px 0"}}>
  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
  <button onClick={onBack} style={{background:"none",border:"none",color:"#94A3B8",fontSize:26,cursor:"pointer",padding:"0 4px",lineHeight:1}}>‹</button>
  <span style={{color:"#F1F5F9",fontWeight:800,fontSize:18}}>{race.label}</span>
  <RankBadge rank={race.confidence_rank} label={race.confidence_label}/>
  </div>
  <p style={{color:"#64748B",fontSize:12,margin:"0 0 4px 40px"}}>
  {[race.race_name,race.distance,race.track_cond,race.field_size&&`${race.field_size}頭`].filter(Boolean).join(" / ")}</p>
  <p style={{color:"#475569",fontSize:11,margin:"0 0 8px 40px"}}>💡 馬名タップで詳細評価</p>
  <div style={{display:"flex",borderTop:"1px solid #1E293B"}}>
  {["予想","EV","買い目"].map(t=>(
  <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px 0",background:"none",border:"none",cursor:"pointer",
  fontSize:13,fontWeight:600,color:tab===t?"#F1F5F9":"#64748B",
  borderBottom:tab===t?"2px solid #3B82F6":"2px solid transparent",transition:"color .15s,border-color .15s"}}>
  {t}{t==="買い目"&&raceBets.length>0&&<span style={{marginLeft:5,background:"#3B82F6",color:"#FFF",borderRadius:10,padding:"1px 6px",fontSize:10}}>{raceBets.length}</span>}
  </button>))}
  </div>
  </div>
  <div style={{flex:1,overflowY:"auto"}}>
  {tab==="予想"&&<DetailTable horses={race.horses} commentMap={commentMap} raceId={race.race_id}/>}
  {tab==="EV"&&<EVRankingTab raceId={race.race_id} evData={evData}/>}
  {tab==="買い目"&&<BetsPanel bets={raceBets}/>}
  </div>
  </div>;
}

function RaceCard({ race, onClick }) {
  const MO={"◎":0,"○":1,"▲":2,"△":3};
  const marked=race.horses.filter(h=>MARK_DEF[h.mark]).sort((a,b)=>(MO[a.mark]??9)-(MO[b.mark]??9));
  return <button onClick={onClick} style={{width:"100%",textAlign:"left",display:"block",background:"#1E293B",
  border:"1px solid #334155",borderRadius:14,padding:"14px 14px 12px",marginBottom:10,cursor:"pointer",transition:"opacity .15s"}}
  onMouseEnter={e=>e.currentTarget.style.opacity=".85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
  <div>
  <div style={{color:"#F1F5F9",fontWeight:800,fontSize:16}}>{race.label}</div>
  <div style={{color:"#64748B",fontSize:11,marginTop:3}}>
  {[race.race_name,race.distance,race.track_cond,race.field_size&&`${race.field_size}頭`].filter(Boolean).join(" / ")}</div>
  </div>
  <RankBadge rank={race.confidence_rank} label={race.confidence_label}/>
  </div>
  <div style={{display:"flex",flexDirection:"column",gap:9}}>
  {marked.map(h=><div key={h.no} style={{display:"flex",alignItems:"center",gap:8}}>
  <MarkIcon mark={h.mark} size={26}/><GateBall gate={h.gate} no={h.no} size={28}/>
  <span style={{color:"#E2E8F0",fontSize:14,fontWeight:600,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{h.name}</span>
  <div style={{width:110,flexShrink:0}}><AbilityBar score={h.ability} compact/></div>
  <span style={{fontSize:12,fontWeight:600,width:40,textAlign:"right",flexShrink:0,
  color:h.win_prob>=15?"#F59E0B":h.win_prob>=10?"#E2E8F0":"#64748B"}}>{h.win_prob.toFixed(1)}%</span>
  </div>)}
  </div>
  </button>;
}

function Spinner() {
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh",gap:14}}>
  <div style={{width:34,height:34,borderRadius:"50%",border:"3px solid #1E293B",borderTopColor:"#3B82F6",animation:"spin 1s linear infinite"}}/>
  <span style={{color:"#64748B",fontSize:13}}>読み込み中…</span>
  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}

function ErrorPanel({onRetry}) {
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60vh",gap:12,padding:"0 24px",textAlign:"center"}}>
    <span style={{fontSize:40}}>⚠️</span>
    <span style={{color:"#F1F5F9",fontWeight:700,fontSize:15}}>データが見つかりません</span>
    <span style={{color:"#64748B",fontSize:12,lineHeight:1.7}}>build_race_day_bundle_single.py<br/>→ post_process_scores.py<br/>を実行してください</span>
    <button onClick={onRetry} style={{marginTop:8,background:"#3B82F6",color:"#FFF",border:"none",borderRadius:8,padding:"10px 24px",fontSize:13,fontWeight:600,cursor:"pointer"}}>再読み込み</button>
  </div>;
}

export default function App() {
  // 🔒 パスワード保護ロジック
  const ACCESS_PASSWORD = "0120";
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [error, setError] = useState("");

  const [races,setRaces]=useState([]), [bets,setBets]=useState([]);
  const [commentMap,setCommentMap]=useState({}), [evData,setEvData]=useState([]);
  const [loading,setLoading]=useState(true), [hasError,setHasError]=useState(false);
  const [currentView,setCurrentView]=useState("list"), [currentRace,setCurrentRace]=useState(null);
  const [venueTab,setVenueTab]=useState(null);
  const [mainTab,setMainTab]=useState("today");

  const loadData=useCallback(async()=>{
    if (!isAuthenticated) return;
    setLoading(true);setHasError(false);
    try {
      const [detailRows,listRows,betRows,commentRows,evRows]=await Promise.all([
      fetchCSV(DETAIL_CSV),fetchCSV(LIST_CSV),fetchCSV(BETS_CSV),fetchCSV(COMMENTS_CSV),fetchCSV(EV_CSV)]);
      if (!detailRows.length){setHasError(true);setLoading(false);return;}
      const built=buildRaces(detailRows,listRows);
      setRaces(built);setBets(betRows);setCommentMap(buildCommentMap(commentRows));setEvData(evRows);
      const venues=[...new Set(built.map(r=>r.venue).filter(Boolean))];
      if (venues.length) setVenueTab(v=>(v&&venues.includes(v))?v:venues[0]);
    } catch {setHasError(true);} finally {setLoading(false);}
  },[isAuthenticated]);

  useEffect(()=>{loadData();},[loadData]);

  const venues=useMemo(()=>[...new Set(races.map(r=>r.venue).filter(Boolean))],[races]);
  const visibleRaces=useMemo(()=>venueTab?races.filter(r=>r.venue===venueTab):races,[races,venueTab]);

  const openDetail=useCallback(race=>{setCurrentRace(race);setCurrentView("detail");window.scrollTo(0,0);},[]);
  const closeDetail=useCallback(()=>{setCurrentView("list");setCurrentRace(null);},[]);

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
            <button type="submit" style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#3B82F6", color: "#FFF", fontWeight: "bold", cursor: "pointer", transition: "background 0.2s" }}>
              ENTER SYSTEM
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (currentView==="detail"&&currentRace)
    return <RaceDetail race={currentRace} bets={bets} commentMap={commentMap} evData={evData} onBack={closeDetail}/>;

  return <div style={{minHeight:"100vh",background:"#0F172A",display:"flex",flexDirection:"column"}}>
    <div style={{position:"sticky",top:0,zIndex:10,background:"#0F172A",borderBottom:"1px solid #1E293B"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 14px 6px"}}>
        <h1 style={{color:"#F1F5F9",fontWeight:900,fontSize:22,margin:0}}>競馬AI</h1>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{color:"#64748B",fontSize:12,marginRight:4}}>ガイド</span>
          {["SS","S","A","B","C"].map(r=><RankBadge key={r} rank={r} small/>)}
        </div>
      </div>

      <div style={{display:"flex",borderBottom:"1px solid #1E293B",margin:"4px 14px 0"}}>
        {[{id:"today",label:"本日予想"},{id:"past",label:"過去結果"}].map(t=>(
          <button key={t.id} onClick={()=>setMainTab(t.id)} style={{
            padding:"9px 20px",background:"none",border:"none",cursor:"pointer",
            fontSize:13,fontWeight:700,
            color:mainTab===t.id?"#F1F5F9":"#64748B",
            borderBottom:mainTab===t.id?"2px solid #3B82F6":"2px solid transparent",
            transition:"color .15s,border-color .15s",
          }}>{t.label}</button>
        ))}
        {mainTab==="today"&&<button onClick={loadData} style={{marginLeft:"auto",padding:"6px 12px",
          background:"none",border:"1px solid #334155",color:"#64748B",borderRadius:7,
          fontSize:11,cursor:"pointer",alignSelf:"center",marginBottom:4}}>更新</button>}
      </div>

      {mainTab==="today"&&venues.length>0&&(
        <div style={{display:"flex",padding:"6px 10px 0",gap:4,overflowX:"auto"}}>
          {venues.map(v=><button key={v} onClick={()=>setVenueTab(v)} style={{
            flexShrink:0,padding:"7px 18px",
            background:venueTab===v?"#3B82F6":"transparent",color:venueTab===v?"#FFF":"#94A3B8",
            border:venueTab===v?"none":"1px solid #334155",borderRadius:8,cursor:"pointer",
            fontSize:13,fontWeight:700,transition:"all .15s"}}>{v}</button>)}
        </div>
      )}
      <div style={{height:8}}/>
    </div>

    <div style={{flex:1}}>
      {mainTab==="today"&&(
        <div style={{padding:"10px 12px 80px"}}>
          {loading&&<Spinner/>}
          {hasError&&!loading&&<ErrorPanel onRetry={loadData}/>}
          {!loading&&!hasError&&visibleRaces.map(race=><RaceCard key={race.race_id} race={race} onClick={()=>openDetail(race)}/>)}
          {!loading&&!hasError&&!visibleRaces.length&&(
            <div style={{color:"#64748B",textAlign:"center",padding:48,fontSize:13}}>表示するレースがありません</div>
          )}
        </div>
      )}

      {mainTab==="past"&&(
        <PastResults raceList={races}/>
      )}
    </div>

    <div style={{
      position:"fixed",bottom:0,left:0,right:0,zIndex:20,
      background:"#0F172A",borderTop:"1px solid #1E293B",
      display:"flex",
      paddingBottom:"env(safe-area-inset-bottom)",
    }}>
      {[
        {id:"today",label:"本日予想",icon:"🏇"},
        {id:"past", label:"過去結果",icon:"📊"},
      ].map(t=>(
        <button key={t.id} onClick={()=>setMainTab(t.id)} style={{
          flex:1,padding:"10px 0 8px",background:"none",border:"none",cursor:"pointer",
          display:"flex",flexDirection:"column",alignItems:"center",gap:3,
        }}>
          <span style={{fontSize:20,lineHeight:1}}>{t.icon}</span>
          <span style={{fontSize:10,fontWeight:600,color:mainTab===t.id?"#3B82F6":"#475569"}}>{t.label}</span>
          {mainTab===t.id&&<div style={{width:20,height:2,background:"#3B82F6",borderRadius:1}}/>}
        </button>
      ))}
    </div>
  </div>;
}