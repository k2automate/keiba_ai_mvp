/**
 * PastResults.jsx — 過去レース結果タブ
 * ui/src/PastResults.jsx として保存する
 */

import { useState, useEffect, useCallback } from "react";

// ============================================================
// ストレージ操作 (localStorage)
// ============================================================
const STORAGE_PREFIX = "past_results:";

async function loadDay(dateStr) {
  try {
    const r = window.localStorage.getItem(`${STORAGE_PREFIX}${dateStr}`);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

async function saveDay(dateStr, data) {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${dateStr}`, JSON.stringify(data));
    return true;
  } catch { return false; }
}

async function listAllKeys() {
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keys.push(k.replace(STORAGE_PREFIX, ""));
      }
    }
    return keys.sort().reverse();
  } catch { return []; }
}

// ============================================================
// 定数・ヘルパー
// ============================================================
const MARK_BG    = { "◎": "#EF4444", "○": "#3B82F6", "▲": "#F59E0B", "△": "#22C55E" };
const GATE_BG = ["","#FFFFFF","#111111","#EF4444","#3B82F6","#F59E0B","#22C55E","#F97316","#EC4899"];
const GATE_FG = ["","#111111","#FFFFFF","#FFFFFF","#FFFFFF","#111111","#FFFFFF","#FFFFFF","#FFFFFF"];

function fmt(d) { 
  const date = new Date(d);
  const days = ["日","月","火","水","木","金","土"];
  return `${date.getMonth()+1}/${date.getDate()}(${days[date.getDay()]})`;
}

function monthLabel(ym) {
  return `${parseInt(ym.split("-")[1])}月`;
}

// 🌟シミュレーション計算ロジック（的中率・回収率）
function calcSimStats(races) {
  let tsHit=0, tsBet=0, tsRet=0;
  let umHit=0, umBet=0, umRet=0;
  let wdHit=0, wdBet=0, wdRet=0;
  let myBet=0, myRet=0;
  let validRaces=0;

  races.forEach(r => {
    const filled = r.horses.filter(h=>h.rank>0);
    if (filled.length < 3) return; // 着順が未入力のレースはスキップ
    validRaces++;

    myBet += Number(r.myBet || 0);
    myRet += Number(r.myReturn || 0);

    const p_ts = Number(r.payouts?.tansho || 0);
    const p_um = Number(r.payouts?.umaren || 0);
    const p_wd = Number(r.payouts?.wide || 0);

    // 古いデータへの後方互換性（確率がない場合は印をスコア化）
    const fallback = h => h.mark==="◎"?100:h.mark==="○"?90:h.mark==="▲"?80:h.mark==="△"?70:0;
    const winS = [...r.horses].sort((a,b)=>(b.win_prob||fallback(b)) - (a.win_prob||fallback(a)));
    const t3S = [...r.horses].sort((a,b)=>(b.top3_prob||fallback(b)) - (a.top3_prob||fallback(a)));

    // ① 単勝シミュレーション（勝率1位）
    tsBet += 100;
    if (winS[0]?.rank === 1) { tsHit++; tsRet += p_ts; }

    // ② 馬連シミュレーション（勝率1位・2位の組み合わせ）
    umBet += 100;
    const u1=winS[0], u2=winS[1];
    if (u1?.rank>0 && u2?.rank>0 && u1.rank<=2 && u2.rank<=2) { umHit++; umRet += p_um; }

    // ③ ワイドシミュレーション（複勝率1位・2位の組み合わせ）
    wdBet += 100;
    const w1=t3S[0], w2=t3S[1];
    if (w1?.rank>0 && w2?.rank>0 && w1.rank<=3 && w2.rank<=3) { wdHit++; wdRet += p_wd; }
  });

  return { validRaces, tsHit, tsBet, tsRet, umHit, umBet, umRet, wdHit, wdBet, wdRet, myBet, myRet };
}

// ============================================================
// UIコンポーネント
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
      <span style={{color:"#94A3B8", fontSize:11, width:36, flexShrink:0}}>{label}</span>
      <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder="0"
        style={{flex:1, height:30, borderRadius:6, border:"1px solid #334155", background:"#1E293B", 
        color:"#FFF", fontSize:13, padding:"0 8px", outline:"none"}} />
      <span style={{color:"#64748B", fontSize:11}}>円</span>
    </div>
  );
}

function SimBox({ label, hit, bet, ret }) {
  const rr = bet > 0 ? Math.round((ret / bet) * 100) : 0;
  const hitRate = bet > 0 ? Math.round((hit / (bet/100)) * 100) : 0;
  return (
    <div style={{flex:1, background:"rgba(15,23,42,.4)", borderRadius:8, padding:"8px", border:`1px solid ${hit>0?"#3B82F6":"rgba(51,65,85,.5)"}`}}>
      <div style={{color:"#94A3B8", fontSize:10, marginBottom:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{label}</div>
      <div style={{display:"flex", alignItems:"baseline", gap:4}}>
         <span style={{color:hit>0?"#60A5FA":"#E2E8F0", fontSize:15, fontWeight:800}}>{hit}/{bet/100}</span>
         <span style={{color:"#64748B", fontSize:10}}>({hitRate}%)</span>
      </div>
      <div style={{color:rr>=100?"#F59E0B":rr>0?"#F1F5F9":"#475569", fontSize:13, fontWeight:700, marginTop:2}}>
         回収 {rr}%
      </div>
    </div>
  );
}

function StatsPanel({ stats, title }) {
  if (!stats || stats.validRaces === 0) return null;
  const { tsHit, tsBet, tsRet, umHit, umBet, umRet, wdHit, wdBet, wdRet, myBet, myRet } = stats;
  return (
    <div style={{margin:"12px 12px 4px", padding:"14px", background:"#1E293B", borderRadius:12, border:"1px solid #334155"}}>
      <div style={{color:"#F1F5F9", fontSize:13, fontWeight:800, marginBottom:10, display:"flex", alignItems:"center", gap:6}}>
        <span>🤖</span> {title}
      </div>
      <div style={{display:"flex", gap:6}}>
        <SimBox label="単勝推奨" hit={tsHit} bet={tsBet} ret={tsRet} />
        <SimBox label="馬連推奨" hit={umHit} bet={umBet} ret={umRet} />
        <SimBox label="ワイド推奨" hit={wdHit} bet={wdBet} ret={wdRet} />
      </div>
      {myBet > 0 && (
        <div style={{marginTop:12, paddingTop:12, borderTop:"1px solid #334155"}}>
          <div style={{color:"#94A3B8", fontSize:11, marginBottom:6}}>👤 ご自身のリアル収支</div>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:13}}>
            <div style={{display:"flex", gap:16}}>
              <span style={{color:"#F1F5F9"}}>購入: {myBet}円</span>
              <span style={{color:"#F59E0B"}}>払戻: {myRet}円</span>
            </div>
            <span style={{color:myRet>=myBet?"#F59E0B":"#64748B", fontWeight:800}}>
              回収率 {Math.round((myRet/myBet)*100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// モーダル・ビュー類
// ============================================================
function EntryModal({ date, raceData, existing, onSave, onClose }) {
  const [races, setRaces] = useState(() => {
    if (existing?.races) {
      return existing.races.map(r => ({
        ...r,
        payouts: r.payouts || {tansho:"", fukusho:"", wide:"", umaren:"", sanrenpuku:"", sanrentan:""},
        myBet: r.myBet || "", myReturn: r.myReturn || "",
      }));
    }
    if (raceData?.length) return raceData.map(r => ({
      race_id: r.race_id, race_label: r.label ?? r.race_id,
      horses: r.horses.map(h => ({
        no: h.no, gate: h.gate, name: h.name, mark: h.mark, rank: 0,
        win_prob: h.win_prob, top3_prob: h.top3_prob // シミュ用に確率も保存
      })),
      payouts: {tansho:"", fukusho:"", wide:"", umaren:"", sanrenpuku:"", sanrentan:""},
      myBet: "", myReturn: ""
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

  const updateMyBalance = (raceIdx, key, val) => {
    setRaces(prev => {
      const next = [...prev];
      next[raceIdx][key] = val;
      return next;
    });
  };

  const cur = races[activeRace];

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
                    {r.race_label.replace(/東京|京都|阪神|中京|福島|新潟|小倉|中山/g,"")}
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
              <p style={{color:"#64748B",fontSize:11,margin:"8px 0 12px"}}>{cur.race_label} — 着順入力（0=除外）</p>
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

              {/* 🌟配当・金額入力セクション */}
              <div style={{marginTop:24, padding:"12px", background:"#0F172A", borderRadius:10, border:"1px solid #334155"}}>
                <div style={{color:"#F1F5F9", fontSize:12, fontWeight:700, marginBottom:10}}>💰 公式配当金（100円換算 / AI回収率計算用）</div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                  <AmountInput label="単勝" value={cur.payouts?.tansho||""} onChange={v=>updatePayout(activeRace, "tansho", v)} />
                  <AmountInput label="複勝" value={cur.payouts?.fukusho||""} onChange={v=>updatePayout(activeRace, "fukusho", v)} />
                  <AmountInput label="馬連" value={cur.payouts?.umaren||""} onChange={v=>updatePayout(activeRace, "umaren", v)} />
                  <AmountInput label="ワイド" value={cur.payouts?.wide||""} onChange={v=>updatePayout(activeRace, "wide", v)} />
                  <AmountInput label="3連複" value={cur.payouts?.sanrenpuku||""} onChange={v=>updatePayout(activeRace, "sanrenpuku", v)} />
                  <AmountInput label="3連単" value={cur.payouts?.sanrentan||""} onChange={v=>updatePayout(activeRace, "sanrentan", v)} />
                </div>
                <div style={{color:"#F1F5F9", fontSize:12, fontWeight:700, margin:"20px 0 10px"}}>👤 ご自身のリアル収支（任意）</div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                  <AmountInput label="購入" value={cur.myBet||""} onChange={v=>updateMyBalance(activeRace, "myBet", v)} />
                  <AmountInput label="払戻" value={cur.myReturn||""} onChange={v=>updateMyBalance(activeRace, "myReturn", v)} />
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

function DayResultView({ dateStr, raceList, onEdit, onBack }) {
  const [dayData, setDayData] = useState(null);
  useEffect(() => { loadDay(dateStr).then(d => { setDayData(d); }); }, [dateStr]);
  const races = dayData?.races ?? [];

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
          {/* 🌟本日のAI回収率シミュレーション */}
          <StatsPanel stats={calcSimStats(races)} title="本日のAI推奨 仮想シミュレーション" />

          {races.map((race, ri) => (
            <div key={ri} style={{margin:"10px 12px 0",background:"#1E293B",borderRadius:12,border:"1px solid #334155",overflow:"hidden"}}>
              <div style={{padding:"10px 14px",background:"#0F172A",borderBottom:"1px solid #1E293B"}}><span style={{color:"#F1F5F9",fontWeight:700,fontSize:14}}>{race.race_label}</span></div>
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

  useEffect(() => {
    (async () => {
      const keys = await listAllKeys();
      const monthKeys = keys.filter(k => k.startsWith(ym));
      let allRaces = [];
      for (const k of monthKeys) {
        const d = await loadDay(k);
        if (d?.races) allRaces = allRaces.concat(d.races);
      }
      setStats(calcSimStats(allRaces));
    })();
  }, [ym]);

  if (!stats || stats.validRaces === 0) return null;
  return <StatsPanel stats={stats} title={`${monthLabel(ym)} AI累計シミュレーション（${stats.validRaces}R）`} />;
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
            <button onClick={() => openEntry(new Date().toISOString().slice(0,10))} style={{padding:"6px 14px",background:"#3B82F6",border:"none",borderRadius:8,color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>＋ 今日の結果を入力</button>
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