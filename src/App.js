import { useState, useEffect, useCallback, useMemo } from "react";
import * as recharts from "recharts";

const { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = recharts;

// ══════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════
const SHEET_ID = "1t4i_3MRtouTGNgdircWiJHouCfrQgUKRc1-XUwKjIQ4";
const REFRESH_MS = 60000; // 1 minute
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTH_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const C = {
  bg: "#0a0e17", panel: "#111827", panelBorder: "#1e293b",
  green: "#00e676", red: "#ff1744", blue: "#2979ff",
  cyan: "#00e5ff", amber: "#ffab00", white: "#e2e8f0",
  muted: "#64748b", dimText: "#475569",
};

// ══════════════════════════════════════════════════════════════
//  GOOGLE SHEETS FETCH
// ══════════════════════════════════════════════════════════════
async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  const text = await res.text();
  return parseCSV(text);
}

function parseCSV(text) {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

function parseLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseMoney(val) {
  if (!val) return 0;
  return parseFloat(val.replace(/[$R\s.]/g, "").replace(",", ".")) || 0;
}

function parseETD(val) {
  if (!val) return null;
  const parts = val.split("/");
  if (parts.length === 3) {
    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
    return new Date(y, m, d);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtUSD(v) {
  if (Math.abs(v) >= 1e6) return `$ ${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$ ${(v / 1e3).toFixed(1)}K`;
  return `$ ${v.toFixed(0)}`;
}

// ══════════════════════════════════════════════════════════════
//  DATA PROCESSING
// ══════════════════════════════════════════════════════════════
function processData(lob, metasTrader, metaLinha, metaGlobal) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Parse LOB rows
  const rows = lob.map(r => {
    const etd = parseETD(r["ETD"]);
    return {
      processo: r["Numero_Processo"] || r["Número_Processo"] || "",
      responsavel: r["Responsavel_Operacional"] || r["Responsável_Operacional"] || "",
      trader: r["Trader"] || "",
      linha: r["Linha de Negócio"] || r["Linha de Negocio"] || r["Linha_de_Negócio"] || "",
      status: r["Status_Processo"] || "",
      cliente: r["Cliente"] || "",
      fornecedor: r["Fornecedor"] || "",
      produto: r["Produto"] || "",
      margem: parseMoney(r["Margem de venda"] || r["Margem_de_venda"] || "0"),
      etd,
      etdMonth: etd ? etd.getMonth() : -1,
      etdYear: etd ? etd.getFullYear() : -1,
      lob: parseMoney(r["LOB"] || "0"),
    };
  });

  // Filter by current year
  const yearRows = rows.filter(r => r.etdYear === currentYear);

  // Monthly LOB (all months up to current)
  const monthlyLOB = MONTH_SHORT.slice(0, currentMonth + 1).map((m, i) => {
    const monthRows = yearRows.filter(r => r.etdMonth === i);
    const total = monthRows.reduce((s, r) => s + r.lob, 0);
    return { month: m, monthIndex: i, lob: total };
  });

  // LOB by trader for current month
  const currentMonthRows = yearRows.filter(r => r.etdMonth === currentMonth);
  const traderMap = {};
  yearRows.forEach(r => {
    if (!r.trader) return;
    if (!traderMap[r.trader]) traderMap[r.trader] = { name: r.trader, lobMes: 0, lobAno: 0, ops: 0, opsMes: 0 };
    traderMap[r.trader].lobAno += r.lob;
    traderMap[r.trader].ops += 1;
  });
  currentMonthRows.forEach(r => {
    if (!r.trader) return;
    if (!traderMap[r.trader]) traderMap[r.trader] = { name: r.trader, lobMes: 0, lobAno: 0, ops: 0, opsMes: 0 };
    traderMap[r.trader].lobMes += r.lob;
    traderMap[r.trader].opsMes += 1;
  });

  // Parse Metas_Trader
  const traderMetas = {};
  metasTrader.forEach(r => {
    const name = r["Trader"] || "";
    const monthCol = MONTH_NAMES[currentMonth];
    const metaMes = parseMoney(r[monthCol] || "0");
    const metaAno = parseMoney(r["Total"] || "0");
    traderMetas[name] = { metaMes, metaAno };
  });

  const traderRanking = Object.values(traderMap).map(t => ({
    ...t,
    metaMes: traderMetas[t.name]?.metaMes || 0,
    metaAno: traderMetas[t.name]?.metaAno || 0,
    pctMes: traderMetas[t.name]?.metaMes ? (t.lobMes / traderMetas[t.name].metaMes * 100) : 0,
    pctAno: traderMetas[t.name]?.metaAno ? (t.lobAno / traderMetas[t.name].metaAno * 100) : 0,
  })).sort((a, b) => b.lobMes - a.lobMes);

  // LOB by Linha de Negócio
  const linhaMap = {};
  yearRows.forEach(r => {
    if (!r.linha) return;
    if (!linhaMap[r.linha]) linhaMap[r.linha] = { name: r.linha, lobMes: 0, lobAno: 0, ops: 0 };
    linhaMap[r.linha].lobAno += r.lob;
    linhaMap[r.linha].ops += 1;
  });
  currentMonthRows.forEach(r => {
    if (!r.linha) return;
    if (!linhaMap[r.linha]) linhaMap[r.linha] = { name: r.linha, lobMes: 0, lobAno: 0, ops: 0 };
    linhaMap[r.linha].lobMes += r.lob;
  });

  const linhaMetas = {};
  metaLinha.forEach(r => {
    const name = r["Linha_de_negócio"] || r["Linha_de_negocio"] || r["Linha de negócio"] || "";
    const monthCol = MONTH_NAMES[currentMonth];
    const metaMes = parseMoney(r[monthCol] || "0");
    const metaAno = parseMoney(r["Total"] || "0");
    linhaMetas[name] = { metaMes, metaAno };
  });

  const linhaRanking = Object.values(linhaMap).map(l => ({
    ...l,
    metaMes: linhaMetas[l.name]?.metaMes || 0,
    metaAno: linhaMetas[l.name]?.metaAno || 0,
    pctMes: linhaMetas[l.name]?.metaMes ? (l.lobMes / linhaMetas[l.name].metaMes * 100) : 0,
    pctAno: linhaMetas[l.name]?.metaAno ? (l.lobAno / linhaMetas[l.name].metaAno * 100) : 0,
  })).sort((a, b) => b.lobAno - a.lobAno);

  // Meta Global
  const globalMetas = {};
  metaGlobal.forEach(r => {
    const mes = r["Mês"] || r["Mes"] || "";
    globalMetas[mes] = parseMoney(r["Meta Global"] || r["Meta_Global"] || "0");
  });

  const lobMesAtual = currentMonthRows.reduce((s, r) => s + r.lob, 0);
  const metaMesAtual = globalMetas[MONTH_NAMES[currentMonth]] || 0;
  const lobAnoTotal = yearRows.reduce((s, r) => s + r.lob, 0);
  const metaAnoTotal = Object.values(globalMetas).reduce((s, v) => s + v, 0);

  // Trimestral
  const qStart = Math.floor(currentMonth / 3) * 3;
  const lobTrimestral = yearRows.filter(r => r.etdMonth >= qStart && r.etdMonth <= currentMonth).reduce((s, r) => s + r.lob, 0);
  const metaTrimestral = MONTH_NAMES.slice(qStart, qStart + 3).reduce((s, m) => s + (globalMetas[m] || 0), 0);

  // Status count
  const statusCount = {};
  currentMonthRows.forEach(r => {
    statusCount[r.status] = (statusCount[r.status] || 0) + 1;
  });

  // Monthly LOB with meta for chart
  const monthlyWithMeta = monthlyLOB.map(m => ({
    ...m,
    meta: globalMetas[MONTH_NAMES[m.monthIndex]] || 0,
  }));

  return {
    monthlyLOB: monthlyWithMeta,
    traderRanking,
    linhaRanking,
    lobMesAtual, metaMesAtual,
    lobTrimestral, metaTrimestral,
    lobAnoTotal, metaAnoTotal,
    totalOps: currentMonthRows.length,
    totalOpsAno: yearRows.length,
    statusCount,
    currentMonthName: MONTH_NAMES[currentMonth],
  };
}

// ══════════════════════════════════════════════════════════════
//  UI COMPONENTS
// ══════════════════════════════════════════════════════════════

function Panel({ title, children, style, icon }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: C.muted, fontFamily: FONT }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}

function GaugeChart({ value, max, period, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 150) : 0;
  const displayPct = max > 0 ? (value / max) * 100 : 0;
  const remaining = max - value;
  const arcPct = Math.min(pct, 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.muted, textTransform: "uppercase", fontFamily: FONT }}>{period}</span>
      <div style={{ position: "relative", width: 130, height: 90 }}>
        <svg viewBox="0 0 120 80" style={{ width: "100%", height: "100%" }}>
          <path d="M 10 70 A 54 54 0 0 1 110 70" fill="none" stroke={C.panelBorder} strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 70 A 54 54 0 0 1 110 70" fill="none" stroke={displayPct >= 100 ? C.green : color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(arcPct / 100) * 157} 157`} style={{ filter: `drop-shadow(0 0 6px ${color}60)`, transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -10%)", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: displayPct >= 100 ? C.green : C.white, fontFamily: FONT, lineHeight: 1 }}>{displayPct.toFixed(1)}%</div>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: -4 }}>
        <div style={{ fontSize: 12, color: C.white, fontWeight: 600, fontFamily: FONT }}>{fmtUSD(value)}</div>
        <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
          {remaining > 0 ? <>Faltam <span style={{ color: C.amber, fontWeight: 700 }}>{fmtUSD(remaining)}</span></> : <span style={{ color: C.green, fontWeight: 700 }}>Meta batida! +{fmtUSD(Math.abs(remaining))}</span>}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, sub, icon, color }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.panel}, ${color}08)`, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "14px 16px", flex: 1, minWidth: 140, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -10, right: -10, fontSize: 50, opacity: 0.04, color }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.muted, textTransform: "uppercase", fontFamily: FONT, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.white, fontFamily: FONT, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>{sub}</div>}
    </div>
  );
}

function TraderRow({ rank, t, maxLob, viewMode }) {
  const lobVal = viewMode === "ano" ? t.lobAno : t.lobMes;
  const metaVal = viewMode === "ano" ? t.metaAno : t.metaMes;
  const pctVal = viewMode === "ano" ? t.pctAno : t.pctMes;
  const barW = maxLob > 0 ? (lobVal / maxLob) * 100 : 0;
  const medals = ["🥇", "🥈", "🥉"];
  const avatar = t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, background: rank === 0 ? `${C.green}08` : "transparent", borderLeft: rank < 3 ? `3px solid ${[C.green, C.cyan, C.amber][rank]}` : "3px solid transparent" }}>
      <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>
        {rank < 3 ? medals[rank] : <span style={{ color: C.dimText, fontSize: 13, fontWeight: 700, fontFamily: FONT }}>{rank + 1}</span>}
      </span>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{avatar}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.white, fontFamily: FONT }}>{t.name}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.white, fontFamily: FONT, flexShrink: 0 }}>{fmtUSD(lobVal)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: C.panelBorder, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(barW, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`, borderRadius: 2, transition: "width 1s ease" }} />
          </div>
          <span style={{ fontSize: 10, color: pctVal >= 100 ? C.green : C.amber, fontWeight: 700, fontFamily: FONT, flexShrink: 0 }}>{pctVal.toFixed(0)}%</span>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, flexShrink: 0 }}>{viewMode === "ano" ? t.ops : t.opsMes} ops</span>
        </div>
      </div>
    </div>
  );
}

function LinhaRow({ l, viewMode }) {
  const lobVal = viewMode === "ano" ? l.lobAno : l.lobMes;
  const metaVal = viewMode === "ano" ? l.metaAno : l.metaMes;
  const pctVal = viewMode === "ano" ? l.pctAno : l.pctMes;
  const remaining = metaVal - lobVal;
  const colors = { "Import": C.blue, "Feed Meal": C.cyan, "Meat": C.red };
  const color = colors[l.name] || C.amber;
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.white, fontFamily: FONT }}>{l.name}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: FONT }}>{fmtUSD(lobVal)}</span>
      </div>
      <div style={{ height: 6, background: C.panelBorder, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ width: `${Math.min(pctVal, 100)}%`, height: "100%", background: color, borderRadius: 3, transition: "width 1s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, fontFamily: FONT }}>
        <span>Meta: {fmtUSD(metaVal)}</span>
        <span style={{ color: pctVal >= 100 ? C.green : C.amber, fontWeight: 700 }}>{pctVal.toFixed(1)}%</span>
        <span>{remaining > 0 ? `Faltam ${fmtUSD(remaining)}` : "Batida!"}</span>
      </div>
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span style={{ fontSize: 18, fontWeight: 800, color: C.white, fontFamily: FONT, letterSpacing: 2 }}>{time.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a2332ee", border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, fontFamily: FONT }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ fontSize: 12, color: p.color || C.white, fontWeight: 700, fontFamily: FONT, marginBottom: 2 }}>{p.name}: {fmtUSD(p.value)}</div>)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ══════════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    if (user === "admin" && pass === "ib2026") {
      onLogin(true);
    } else {
      setError("Usuário ou senha incorretos");
    }
  };

  const inputStyle = { width: "100%", padding: "12px 16px", fontSize: 14, fontFamily: FONT, background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, color: C.white, outline: "none" };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 16, padding: "40px 36px", width: 380, textAlign: "center" }}>
        <div style={{ marginBottom: 8 }}>
          <svg viewBox="0 0 100 100" width="60" height="60" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="96" height="96" fill="white" stroke="#111" strokeWidth="8"/>
            <text x="50" y="68" textAnchor="middle" fontFamily={FONT} fontSize="52" fontWeight="900" fill="#111">IB</text>
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.white, marginBottom: 4 }}>INDEPENDENT BRAZIL</div>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 30 }}>Trading Desk</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input style={inputStyle} placeholder="Usuário" value={user} onChange={e => { setUser(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          <input style={inputStyle} type="password" placeholder="Senha" value={pass} onChange={e => { setPass(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} />
          {error && <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}
          <button onClick={handleLogin} style={{ padding: "12px", fontSize: 14, fontWeight: 700, fontFamily: FONT, background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", letterSpacing: 0.5 }}>Entrar</button>
        </div>
        <div style={{ fontSize: 10, color: C.dimText, marginTop: 20 }}>Acesso restrito • Independent Brazil © {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS PANEL
// ══════════════════════════════════════════════════════════════
function SettingsPanel({ config, setConfig, onClose }) {
  const toggle = (key) => setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  const sections = [
    { key: "showKPIs", label: "KPIs Principais" },
    { key: "showChart", label: "Gráfico LOB Mensal" },
    { key: "showGauges", label: "Gauges de Meta" },
    { key: "showTraders", label: "Ranking de Traders" },
    { key: "showLinhas", label: "Linhas de Negócio" },
    { key: "showStatus", label: "Status dos Processos" },
  ];
  const views = [
    { key: "viewMode", value: "mes", label: "Visão Mensal" },
    { key: "viewMode", value: "ano", label: "Visão Anual" },
  ];

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 320, background: C.panel, borderLeft: `1px solid ${C.panelBorder}`, zIndex: 1000, padding: "20px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.white, fontFamily: FONT }}>Configurações</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT }}>Seções Visíveis</div>
      {sections.map(s => (
        <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <div onClick={() => toggle(s.key)} style={{ width: 40, height: 22, borderRadius: 11, background: config[s.key] ? C.green : C.panelBorder, position: "relative", transition: "background 0.3s", cursor: "pointer" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: config[s.key] ? 20 : 2, transition: "left 0.3s" }} />
          </div>
          <span style={{ fontSize: 13, color: C.white, fontFamily: FONT }}>{s.label}</span>
        </label>
      ))}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontFamily: FONT, marginTop: 8 }}>Visão dos Rankings</div>
      {views.map(v => (
        <label key={v.value} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setConfig(prev => ({ ...prev, viewMode: v.value }))}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${config.viewMode === v.value ? C.cyan : C.panelBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {config.viewMode === v.value && <div style={{ width: 10, height: 10, borderRadius: "50%", background: C.cyan }} />}
          </div>
          <span style={{ fontSize: 13, color: C.white, fontFamily: FONT }}>{v.label}</span>
        </label>
      ))}

      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${C.panelBorder}`, fontSize: 10, color: C.dimText, fontFamily: FONT }}>
        Dados atualizam a cada 1 minuto<br/>Planilha: Dashboard IB
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState({
    showKPIs: true, showChart: true, showGauges: true,
    showTraders: true, showLinhas: true, showStatus: true,
    viewMode: "mes",
  });

  const loadData = useCallback(async () => {
    try {
      const [lob, metasTrader, metaLinha, metaGlobal] = await Promise.all([
        fetchSheet("LOB"), fetchSheet("Metas_Trader"),
        fetchSheet("Meta_linhadenegocio"), fetchSheet("Meta_Global"),
      ]);
      const processed = processData(lob, metasTrader, metaLinha, metaGlobal);
      setData(processed);
      setLastUpdate(new Date());
      setError(null);
      setLoading(false);
    } catch (e) {
      setError("Erro ao carregar dados: " + e.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    loadData();
    const iv = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(iv);
  }, [loggedIn, loadData]);

  if (!loggedIn) return <LoginScreen onLogin={setLoggedIn} />;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 18, color: C.cyan, fontWeight: 700, marginBottom: 8 }}>Carregando dados...</div>
        <div style={{ fontSize: 12, color: C.muted }}>Conectando ao Google Sheets</div>
      </div>
    </div>
  );

  if (error && !data) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 18, color: C.red, fontWeight: 700, marginBottom: 8 }}>Erro de conexão</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{error}</div>
        <div style={{ fontSize: 11, color: C.dimText }}>Verifique se a planilha está com acesso público ("Qualquer pessoa com o link pode visualizar")</div>
        <button onClick={loadData} style={{ marginTop: 16, padding: "10px 24px", background: C.blue, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontWeight: 700 }}>Tentar novamente</button>
      </div>
    </div>
  );

  if (!data) return null;

  const d = data;
  const maxTraderLob = d.traderRanking.length > 0 ? Math.max(...d.traderRanking.map(t => config.viewMode === "ano" ? t.lobAno : t.lobMes)) : 1;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.white, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.panelBorder};border-radius:4px}
      `}</style>

      {settingsOpen && <SettingsPanel config={config} setConfig={setConfig} onClose={() => setSettingsOpen(false)} />}

      {/* Header */}
      <div style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.panelBorder}`, background: `linear-gradient(180deg, #0d1220, ${C.bg})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 3 }}>
            <svg viewBox="0 0 100 100" width="38" height="38" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="96" height="96" fill="white" stroke="#111" strokeWidth="8"/>
              <text x="50" y="68" textAnchor="middle" fontFamily={FONT} fontSize="52" fontWeight="900" fill="#111">IB</text>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5, fontFamily: FONT, color: C.white }}>INDEPENDENT BRAZIL</div>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT }}>Trading Desk • {d.currentMonthName} {new Date().getFullYear()}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s ease-in-out infinite", boxShadow: `0 0 8px ${C.green}80` }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.green, fontFamily: FONT, letterSpacing: 1 }}>LIVE</span>
          </div>
          <Clock />
          <button onClick={() => setSettingsOpen(true)} style={{ background: C.panelBorder, border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 16, color: C.muted, display: "flex", alignItems: "center", gap: 6 }} title="Configurações">
            ⚙️
          </button>
        </div>
      </div>

      {/* KPIs */}
      {config.showKPIs && (
        <div style={{ display: "flex", gap: 12, padding: "14px 20px", flexWrap: "wrap" }}>
          <KPICard label={`LOB ${d.currentMonthName}`} value={fmtUSD(d.lobMesAtual)} sub={`Meta: ${fmtUSD(d.metaMesAtual)}`} icon="💰" color={C.green} />
          <KPICard label="LOB Trimestral" value={fmtUSD(d.lobTrimestral)} sub={`Meta: ${fmtUSD(d.metaTrimestral)}`} icon="📊" color={C.cyan} />
          <KPICard label="LOB Anual" value={fmtUSD(d.lobAnoTotal)} sub={`Meta: ${fmtUSD(d.metaAnoTotal)}`} icon="🏆" color={C.amber} />
          <KPICard label="Processos do Mês" value={`${d.totalOps}`} sub={`Ano: ${d.totalOpsAno}`} icon="📋" color={C.blue} />
        </div>
      )}

      {/* Main Grid */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", gap: 12, padding: "0 20px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* LOB Chart */}
          {config.showChart && (
            <Panel title="LOB Mensal vs Meta" icon="📈" style={{ flex: 1 }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={d.monthlyLOB} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.panelBorder} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickLine={false} axisLine={{ stroke: C.panelBorder }} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted, fontFamily: FONT }} tickLine={false} axisLine={false} tickFormatter={fmtUSD} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="meta" name="Meta" fill={C.panelBorder} radius={[3, 3, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="lob" name="LOB Realizado" fill={C.cyan} radius={[3, 3, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
                <span style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5, fontFamily: FONT }}><span style={{ width: 12, height: 3, background: C.panelBorder, borderRadius: 2, display: "inline-block" }} /> Meta</span>
                <span style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 5, fontFamily: FONT }}><span style={{ width: 12, height: 3, background: C.cyan, borderRadius: 2, display: "inline-block" }} /> LOB Realizado</span>
              </div>
            </Panel>
          )}

          {/* Gauges + Linhas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {config.showGauges && (
              <Panel title="Atingimento de Meta Global" icon="🎯">
                <div style={{ display: "flex", gap: 4, justifyContent: "space-around", paddingTop: 4 }}>
                  <GaugeChart value={d.lobMesAtual} max={d.metaMesAtual} period="Mensal" color={C.green} />
                  <GaugeChart value={d.lobTrimestral} max={d.metaTrimestral} period="Trimestral" color={C.cyan} />
                  <GaugeChart value={d.lobAnoTotal} max={d.metaAnoTotal} period="Anual" color={C.amber} />
                </div>
              </Panel>
            )}

            {config.showLinhas && (
              <Panel title={`Linhas de Negócio — ${config.viewMode === "ano" ? "Anual" : d.currentMonthName}`} icon="🏷️">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {d.linhaRanking.map(l => <LinhaRow key={l.name} l={l} viewMode={config.viewMode} />)}
                </div>
              </Panel>
            )}
          </div>

          {/* Status */}
          {config.showStatus && Object.keys(d.statusCount).length > 0 && (
            <Panel title={`Status dos Processos — ${d.currentMonthName}`} icon="📦">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {Object.entries(d.statusCount).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <div key={status} style={{ background: `${C.blue}15`, border: `1px solid ${C.blue}30`, borderRadius: 8, padding: "10px 16px", textAlign: "center", minWidth: 100 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: C.white, fontFamily: FONT }}>{count}</div>
                    <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 0.5 }}>{status}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* Right — Traders */}
        {config.showTraders && (
          <Panel title={`Ranking de Traders — ${config.viewMode === "ano" ? "Anual" : d.currentMonthName}`} icon="🏆" style={{ overflow: "hidden" }}>
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {d.traderRanking.map((t, i) => <TraderRow key={t.name} rank={i} t={t} maxLob={maxTraderLob} viewMode={config.viewMode} />)}
            </div>
            <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 10, marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, fontFamily: FONT }}>
              <span>Total: <span style={{ color: C.white, fontWeight: 700 }}>{fmtUSD(d.traderRanking.reduce((s, t) => s + (config.viewMode === "ano" ? t.lobAno : t.lobMes), 0))}</span></span>
              <span>Ops: <span style={{ color: C.white, fontWeight: 700 }}>{d.traderRanking.reduce((s, t) => s + (config.viewMode === "ano" ? t.ops : t.opsMes), 0)}</span></span>
            </div>
          </Panel>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 24px", borderTop: `1px solid ${C.panelBorder}`, display: "flex", justifyContent: "space-between", fontSize: 10, color: C.dimText, fontFamily: FONT }}>
        <span>🔗 Google Sheets • Atualização a cada 1 min</span>
        <span>Último update: {lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : "—"}</span>
        <span>INDEPENDENT BRAZIL • Trading Desk v2.0 • {new Date().getFullYear()}</span>
      </div>
    </div>
  );
}
