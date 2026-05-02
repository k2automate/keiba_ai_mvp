/**
 * PastResults.jsx — 過去レース結果タブ
 * ui/src/PastResults.jsx として保存する
 */

import { useState, useEffect, useCallback } from "react";

// ============================================================
// 🌟修正：Vercel（本番ブラウザ）で動くように localStorage に変更
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

async function deleteDay(dateStr) {
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${dateStr}`);
    return true;
  } catch { return false; }
}

// ============================================================
// 定数・ヘルパー
// ============================================================
const MARK_ORDER = { "◎": 1, "○": 2, "▲": 3, "△": 4 };
const MARK_BG    = { "◎": "#EF4444", "○": "#3B82F6", "▲": "#F59E0B", "△": "#22C55E" };

const GATE_BG = ["","#FFFFFF","#111111","#EF4444","#3B82F6","#F59E0B","#22C55E","#F97316","#EC4899"];
const GATE_FG = ["","#111111","#FFFFFF","#FFFFFF","#FFFFFF","#111111","#FFFFFF","#FFFFFF","#FFFFFF"];

function fmt(d) { // "2026-05-03" → "5/3(土)"
  const date = new Date(d);
  const days = ["日","月","火","水","木","金","土"];
  return `${date.getMonth()+1}/${date.getDate()}(${days[date.getDay()]})`;
}

function monthLabel(ym) { // "2026-05" → "5月"
  return `${parseInt(ym.split("-")[1])}月`;
}

// 的中判定
function judgeHit(horses, betType) {
  const sorted = [...horses].filter(h => h.rank > 0).sort((a,b) => a.rank - b.rank);
  const top1 = sorted[0]?.name;
  const top2 = sorted[1]?.name;
  const top3 = sorted[2]?.name;
  const honmei = horses.find(h => h.mark === "◎")?.name;
  const taikou = horses.find(h => h.mark === "○")?.name;
  const marks3 = horses.filter(h => ["◎","○","▲"].includes(h.mark)).map(h => h.name);
  const marks4 = horses.filter(h => ["◎","○","▲","△"].includes(h.mark)).map(h => h.name);

  switch (betType) {
    case "単勝": return honmei === top1;
    case "複勝": return marks3.some(n => [top1,top2,top3].includes(n));
    case "馬連": return marks4.filter(n => [top1,top2].includes(n)).length >= 2;
    case "三連複":return marks4.filter(n => [top1,top2,top3].includes(n)).length >= 3;
    default: return false;
  }
}

// ============================================================
// 小コンポーネント
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
    <input
      type="number" min="1" max="18"
      value={value || ""}
      onChange={e => onChange(e.target.value ? parseInt(e.target.value) : 0)}
      placeholder="着"
      style={{
        width:40, height:30, borderRadius:6,
        border:"1px solid #334155", background:"#0F172A",
        color:"#F1F5F9", fontSize:13, fontWeight:700,
        textAlign:"center", padding:0,
        outline:"none",
      }}
    />
  );
}

// ============================================================
// 着順入力モーダル
// ============================================================
function EntryModal({ date, raceData, existing, onSave, onClose }) {
  const [races, setRaces] = useState(() => {
    if (existing?.races) return existing.races;
    if (raceData?.length) return raceData.map(r => ({
      race_id:   r.race_id,
      race_label: r.label ?? r.race_id,
      horses: r.horses.map(h => ({
        no: h.no, gate: h.gate, name: h.name, mark: h.mark, rank: 0,
      })),
    }));
    return [];
  });

  const [activeRace, setActiveRace] = useState(0);

  const updateRank = (raceIdx, horseIdx, rank) => {
    setRaces(prev => {
      const next = prev.map((r, ri) => ri !== raceIdx ? r : {
        ...r,
        horses: r.horses.map((h, hi) => hi !== horseIdx ? h : { ...h, rank }),
      });
      return next;
    });
  };

  const handleSave = () => {
    onSave({ date, races });
  };

  const cur = races[activeRace];

  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,.7)",
      display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{background:"#1E293B",borderRadius:"20px 20px 0 0",
        maxHeight:"85vh",display:"flex",flexDirection:"column"}}>

        {/* ヘッダー */}
        <div style={{padding:"16px 16px 0",flexShrink:0}}>
          <div style={{width:36,height:4,background:"#475569",borderRadius:2,margin:"0 auto 14px"}}/>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <span style={{color:"#F1F5F9",fontWeight:800,fontSize:16}}>
              {date ? fmt(date) : ""} 着順入力
            </span>
            <button onClick={onClose} style={{background:"none",border:"none",color:"#64748B",
              fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
          </div>

          {/* レース選択タブ */}
          {races.length > 0 && (
            <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:8}}>
              {races.map((r, i) => {
                const filled = r.horses.filter(h => h.rank > 0).length;
                const total  = r.horses.length;
                return (
                  <button key={i} onClick={() => setActiveRace(i)} style={{
                    flexShrink:0,padding:"5px 10px",borderRadius:6,
                    border:"1px solid #334155",cursor:"pointer",fontSize:11,fontWeight:600,
                    background:activeRace===i?"#3B82F6":"transparent",
                    color:activeRace===i?"#FFF":"#94A3B8",
                    position:"relative",
                  }}>
                    {r.race_label.replace(/東京|京都|阪神|中京|福島|新潟|小倉|中山/g,"")}
                    {filled > 0 && (
                      <span style={{
                        position:"absolute",top:-4,right:-4,
                        background:filled===total?"#22C55E":"#F59E0B",
                        color:"#000",borderRadius:8,padding:"0 4px",fontSize:9,fontWeight:800,
                      }}>{filled}/{total}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 馬リスト（スクロール） */}
        <div style={{flex:1,overflowY:"auto",padding:"0 16px"}}>
          {!cur ? (
            <div style={{color:"#64748B",textAlign:"center",padding:32,fontSize:13}}>
              レースデータなし
            </div>
          ) : (
            <div style={{paddingBottom:20}}>
              <p style={{color:"#64748B",fontSize:11,margin:"8px 0 12px"}}>
                {cur.race_label} — 各馬の着順を入力（0=DNS/除外）
              </p>
              {cur.horses
                .sort((a,b)=>{
                  const mo={"◎":0,"○":1,"▲":2,"△":3};
                  const am=mo[a.mark]??9, bm=mo[b.mark]??9;
                  return am!==bm ? am-bm : a.no-b.no;
                })
                .map((h, hi) => {
                  const realIdx = cur.horses.findIndex(x => x.no === h.no);
                  return (
                    <div key={h.no} style={{
                      display:"flex",alignItems:"center",gap:8,
                      padding:"9px 0",borderBottom:"1px solid #1E293B",
                    }}>
                      <MarkBadge mark={h.mark}/>
                      <GateBall gate={h.gate} no={h.no} size={26}/>
                      <span style={{flex:1,color:"#E2E8F0",fontSize:13,fontWeight:h.mark in MARK_BG?600:400}}>
                        {h.name}
                      </span>
                      <RankInput
                        value={h.rank}
                        onChange={v => updateRank(activeRace, realIdx, v)}
                      />
                      {h.rank > 0 && (
                        <span style={{
                          color: h.rank===1?"#F59E0B":h.rank<=3?"#60A5FA":"#64748B",
                          fontWeight:700,fontSize:12,width:24,textAlign:"center",flexShrink:0,
                        }}>{h.rank}着</span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{padding:"12px 16px 28px",borderTop:"1px solid #1E293B",flexShrink:0,
          display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:"12px 0",background:"#334155",
            border:"none",borderRadius:10,color:"#94A3B8",fontSize:14,fontWeight:600,cursor:"pointer"}}>
            キャンセル
          </button>
          <button onClick={handleSave} style={{flex:2,padding:"12px 0",background:"#3B82F6",
            border:"none",borderRadius:10,color:"#FFF",fontSize:14,fontWeight:700,cursor:"pointer"}}>
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 日別結果ビュー
// ============================================================
function DayResultView({ dateStr, raceList, onEdit, onBack }) {
  const [dayData, setDayData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDay(dateStr).then(d => { setDayData(d); setLoading(false); });
  }, [dateStr]);

  if (loading) return (
    <div style={{display:"flex",justifyContent:"center",padding:40}}>
      <div style={{color:"#64748B",fontSize:13}}>読み込み中...</div>
    </div>
  );

  const races = dayData?.races ?? [];

  // 月別サマリー計算用
  const bets = ["単勝","複勝","馬連","三連複"];
  const summary = bets.map(bt => {
    let hit = 0;
    races.forEach(r => {
      const filled = r.horses.filter(h=>h.rank>0);
      if (filled.length >= 3 && judgeHit(r.horses, bt)) hit++;
    });
    return { type: bt, hit, total: races.filter(r=>r.horses.filter(h=>h.rank>0).length>=3).length };
  });

  return (
    <div style={{background:"#0F172A",minHeight:"100vh"}}>
      {/* ヘッダー */}
      <div style={{position:"sticky",top:0,zIndex:10,background:"#0F172A",
        borderBottom:"1px solid #1E293B",padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#94A3B8",
            fontSize:26,cursor:"pointer",padding:"0 4px",lineHeight:1}}>‹</button>
          <span style={{color:"#F1F5F9",fontWeight:800,fontSize:17}}>{fmt(dateStr)} の結果</span>
          <button onClick={onEdit} style={{marginLeft:"auto",padding:"6px 14px",
            background:"#3B82F6",border:"none",borderRadius:8,
            color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>
            {races.length>0?"編集":"着順入力"}
          </button>
        </div>
      </div>

      {races.length === 0 ? (
        <div style={{textAlign:"center",padding:"60px 20px",color:"#64748B",fontSize:13}}>
          <div style={{fontSize:36,marginBottom:12}}>📝</div>
          まだ着順が入力されていません<br/>
          <button onClick={onEdit} style={{marginTop:16,padding:"10px 24px",
            background:"#3B82F6",border:"none",borderRadius:10,
            color:"#FFF",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            着順を入力する
          </button>
        </div>
      ) : (
        <div style={{padding:"0 0 40px"}}>
          {/* 的中サマリー */}
          <div style={{margin:"12px 12px 4px",padding:"14px",background:"#1E293B",
            borderRadius:12,border:"1px solid #334155"}}>
            <p style={{color:"#64748B",fontSize:11,margin:"0 0 10px",fontWeight:600}}>
              本日の的中チェック（印ベース自動判定）
            </p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {summary.map(s => (
                <div key={s.type} style={{
                  background:s.hit>0?"rgba(34,197,94,.15)":"rgba(100,116,139,.1)",
                  border:`1px solid ${s.hit>0?"#22C55E":"#334155"}`,
                  borderRadius:8,padding:"6px 12px",textAlign:"center",minWidth:64,
                }}>
                  <div style={{color:s.hit>0?"#22C55E":"#64748B",fontWeight:800,fontSize:15}}>
                    {s.hit}/{s.total}
                  </div>
                  <div style={{color:"#94A3B8",fontSize:10,marginTop:1}}>{s.type}</div>
                </div>
              ))}
            </div>
          </div>

          {/* レース別結果 */}
          {races.map((race, ri) => {
            const sorted = [...race.horses].filter(h=>h.rank>0).sort((a,b)=>a.rank-b.rank);
            const top3names = sorted.slice(0,3).map(h=>h.name);
            return (
              <div key={ri} style={{margin:"10px 12px 0",background:"#1E293B",
                borderRadius:12,border:"1px solid #334155",overflow:"hidden"}}>
                {/* レースヘッダー */}
                <div style={{padding:"10px 14px",background:"#0F172A",
                  borderBottom:"1px solid #1E293B"}}>
                  <span style={{color:"#F1F5F9",fontWeight:700,fontSize:14}}>
                    {race.race_label}
                  </span>
                </div>
                {/* 馬リスト */}
                {race.horses
                  .filter(h=>h.rank>0)
                  .sort((a,b)=>a.rank-b.rank)
                  .map((h,hi)=>(
                    <div key={h.no} style={{
                      display:"flex",alignItems:"center",gap:8,
                      padding:"9px 14px",borderBottom:"1px solid #1E293B",
                      background:h.rank<=3?"rgba(59,130,246,.04)":"transparent",
                    }}>
                      {/* 着順 */}
                      <span style={{
                        width:30,textAlign:"center",flexShrink:0,
                        color:h.rank===1?"#F59E0B":h.rank===2?"#94A3B8":h.rank===3?"#CD7F32":"#475569",
                        fontWeight:800,fontSize:h.rank<=3?15:13,
                      }}>{h.rank}着</span>
                      <GateBall gate={h.gate} no={h.no} size={24}/>
                      <MarkBadge mark={h.mark}/>
                      <span style={{
                        flex:1,color:h.rank<=3?"#F1F5F9":"#94A3B8",
                        fontSize:13,fontWeight:h.mark in MARK_BG?600:400,
                      }}>{h.name}</span>
                      {/* 的中マーク */}
                      {h.mark in MARK_BG && h.rank === 1 && (
                        <span style={{color:"#F59E0B",fontSize:11,fontWeight:800}}>◀ 単勝的中</span>
                      )}
                      {h.mark in MARK_BG && h.rank <= 3 && h.rank > 1 && (
                        <span style={{color:"#60A5FA",fontSize:11,fontWeight:700}}>◀ 複勝圏</span>
                      )}
                    </div>
                  ))}
                {/* 未入力馬 */}
                {race.horses.filter(h=>h.rank===0).length > 0 && (
                  <div style={{padding:"6px 14px"}}>
                    <span style={{color:"#475569",fontSize:11}}>
                      未入力: {race.horses.filter(h=>h.rank===0).map(h=>h.name).join("・")}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 月別カレンダー（日付一覧）
// ============================================================
function MonthView({ ym, allKeys, raceList, onSelectDate }) {
  const days = allKeys.filter(k => k.startsWith(ym));
  const today = new Date().toISOString().slice(0,10);
  const showToday = ym === today.slice(0,7) && !days.includes(today);
  const racedays = raceList
    .map(r => r._date)
    .filter(Boolean)
    .filter(d => d && d.startsWith(ym));

  const allDays = [...new Set([...days, ...(showToday?[today]:[]), ...racedays])].sort().reverse();

  return (
    <div style={{padding:"8px 12px 40px"}}>
      {allDays.length === 0 ? (
        <div style={{textAlign:"center",padding:"48px 16px",color:"#64748B",fontSize:13}}>
          この月の記録はありません
        </div>
      ) : (
        allDays.map(d => {
          const hasData = days.includes(d);
          const isToday = d === today;
          return (
            <button key={d} onClick={() => onSelectDate(d)}
              style={{
                width:"100%",display:"flex",alignItems:"center",gap:12,
                padding:"14px 14px",marginBottom:8,
                background:"#1E293B",border:`1px solid ${hasData?"#334155":"#1E293B"}`,
                borderRadius:12,cursor:"pointer",textAlign:"left",
                transition:"opacity .15s",
              }}
              onMouseEnter={e=>e.currentTarget.style.opacity=".8"}
              onMouseLeave={e=>e.currentTarget.style.opacity="1"}
            >
              <div style={{
                width:44,height:44,borderRadius:10,flexShrink:0,
                background:isToday?"#3B82F6":hasData?"#1E3A5F":"#0F172A",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              }}>
                <span style={{color:isToday?"#FFF":hasData?"#60A5FA":"#475569",fontWeight:800,fontSize:18,lineHeight:1}}>
                  {parseInt(d.slice(8))}
                </span>
                <span style={{color:isToday?"rgba(255,255,255,.7)":hasData?"#64748B":"#334155",fontSize:9,marginTop:1}}>
                  {["日","月","火","水","木","金","土"][new Date(d).getDay()]}
                </span>
              </div>
              <div style={{flex:1}}>
                <span style={{color:hasData?"#F1F5F9":"#64748B",fontWeight:600,fontSize:14}}>
                  {fmt(d)}
                </span>
                {isToday && <span style={{marginLeft:8,color:"#60A5FA",fontSize:11,fontWeight:700}}>今日</span>}
                {hasData && (
                  <div style={{color:"#64748B",fontSize:11,marginTop:3}}>
                    記録あり
                  </div>
                )}
                {!hasData && (
                  <div style={{color:"#334155",fontSize:11,marginTop:3}}>
                    未記録 — タップして入力
                  </div>
                )}
              </div>
              <span style={{color:"#475569",fontSize:18}}>›</span>
            </button>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// 月別サマリーバー
// ============================================================
function MonthSummary({ ym }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      const keys = await listAllKeys();
      const monthKeys = keys.filter(k => k.startsWith(ym));
      let totalRaces = 0, hitTansho = 0, hitFukusho = 0, hitUmaren = 0;
      for (const k of monthKeys) {
        const d = await loadDay(k);
        if (!d?.races) continue;
        d.races.forEach(r => {
          const filled = r.horses.filter(h=>h.rank>0);
          if (filled.length < 3) return;
          totalRaces++;
          if (judgeHit(r.horses,"単勝")) hitTansho++;
          if (judgeHit(r.horses,"複勝")) hitFukusho++;
          if (judgeHit(r.horses,"馬連")) hitUmaren++;
        });
      }
      setStats({ totalRaces, hitTansho, hitFukusho, hitUmaren });
    })();
  }, [ym]);

  if (!stats || stats.totalRaces === 0) return null;

  const { totalRaces: n, hitTansho: ts, hitFukusho: fs, hitUmaren: us } = stats;
  return (
    <div style={{margin:"8px 12px 0",padding:"12px 14px",
      background:"#1E293B",borderRadius:12,border:"1px solid #334155"}}>
      <p style={{color:"#64748B",fontSize:11,margin:"0 0 10px",fontWeight:600}}>
        {monthLabel(ym)} 累計（{n}レース記録）
      </p>
      <div style={{display:"flex",gap:8}}>
        {[{label:"単勝",hit:ts},{label:"複勝",hit:fs},{label:"馬連",hit:us}].map(s=>(
          <div key={s.label} style={{flex:1,textAlign:"center",
            background:s.hit>0?"rgba(59,130,246,.15)":"rgba(100,116,139,.08)",
            borderRadius:8,padding:"8px 4px"}}>
            <div style={{color:s.hit>0?"#60A5FA":"#475569",fontWeight:800,fontSize:18}}>
              {n>0?`${Math.round(s.hit/n*100)}%`:"-"}
            </div>
            <div style={{color:"#64748B",fontSize:10,marginTop:2}}>
              {s.label} ({s.hit}/{n})
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// メイン: 過去結果タブ
// ============================================================
export default function PastResults({ raceList }) {
  const [allKeys,    setAllKeys]    = useState([]);
  const [activeYM,   setActiveYM]   = useState(() => new Date().toISOString().slice(0,7));
  const [viewDate,   setViewDate]   = useState(null);
  const [showEntry,  setShowEntry]  = useState(false);
  const [entryDate,  setEntryDate]  = useState(null);
  const [existing,   setExisting]   = useState(null);

  const refresh = useCallback(async () => {
    const keys = await listAllKeys();
    setAllKeys(keys);
    const today = new Date().toISOString().slice(0,7);
    if (!keys.some(k=>k.startsWith(today)) && activeYM !== today) {/* keep */}
  }, [activeYM]);

  useEffect(() => { refresh(); }, [refresh]);

  const today = new Date().toISOString().slice(0,7);
  const ymSet = new Set([today, ...allKeys.map(k=>k.slice(0,7))]);
  const ymList = [...ymSet].sort().reverse();

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
        <DayResultView
          dateStr={viewDate}
          raceList={raceList}
          onEdit={() => openEntry(viewDate)}
          onBack={() => setViewDate(null)}
        />
        {showEntry && (
          <EntryModal
            date={entryDate}
            raceData={raceList}
            existing={existing}
            onSave={handleSave}
            onClose={() => setShowEntry(false)}
          />
        )}
      </>
    );
  }

  return (
    <div style={{background:"#0F172A",minHeight:"100%"}}>
      <div style={{position:"sticky",top:0,zIndex:10,background:"#0F172A",
        borderBottom:"1px solid #1E293B"}}>
        <div style={{padding:"12px 14px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{color:"#F1F5F9",fontWeight:800,fontSize:17}}>過去レース結果</span>
            <button onClick={() => openEntry(new Date().toISOString().slice(0,10))} style={{
              padding:"6px 14px",background:"#3B82F6",border:"none",borderRadius:8,
              color:"#FFF",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              ＋ 今日の結果を入力
            </button>
          </div>

          <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:8}}>
            {ymList.map(ym => (
              <button key={ym} onClick={() => setActiveYM(ym)} style={{
                flexShrink:0,padding:"6px 16px",borderRadius:8,
                border:"1px solid #334155",cursor:"pointer",
                fontSize:13,fontWeight:700,
                background:activeYM===ym?"#3B82F6":"transparent",
                color:activeYM===ym?"#FFF":"#94A3B8",
                transition:"all .15s",
              }}>{monthLabel(ym)}</button>
            ))}
          </div>
        </div>
      </div>

      <MonthSummary ym={activeYM}/>

      <MonthView
        ym={activeYM}
        allKeys={allKeys}
        raceList={raceList}
        onSelectDate={d => setViewDate(d)}
      />

      {showEntry && (
        <EntryModal
          date={entryDate}
          raceData={raceList}
          existing={existing}
          onSave={handleSave}
          onClose={() => setShowEntry(false)}
        />
      )}
    </div>
  );
}