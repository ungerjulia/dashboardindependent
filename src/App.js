import { useState, useEffect, useCallback, useMemo } from "react";
import * as recharts from "recharts";

const { AreaChart, Area, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } = recharts;

// ══════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════
const SHEET_ID = "1t4i_3MRtouTGNgdircWiJHouCfrQgUKRc1-XUwKjIQ4";
const CLIENT_ID = "954287281463-fcgcg4uuoi56thmev4d8qsj9gdk3gqli.apps.googleusercontent.com";
const API_KEY = "AIzaSyB9h4KWCNFYSZ8nzajsL2zll07jSyEGlvw";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";
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
let _accessToken = null;

function setAccessToken(token) { _accessToken = token; }

async function fetchSheet(sheetName) {
  if (!_accessToken) throw new Error("Não autenticado com Google");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${_accessToken}` }
  });
  if (res.status === 401) throw new Error("TOKEN_EXPIRED");
  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar aba "${sheetName}"`);
  const json = await res.json();
  const rows = json.values;
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ""; });
    return obj;
  });
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
  // Map headers flexibly once
  const sampleKeys = lob.length > 0 ? Object.keys(lob[0]) : [];
  const headerMap = {};
  sampleKeys.forEach(k => {
    const lk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\s]/g, "");
    if (lk.includes("numero") || lk.includes("processo") && !lk.includes("status")) headerMap.processo = k;
    if (lk.includes("responsavel") || lk.includes("operacional")) headerMap.responsavel = k;
    if (lk === "trader") headerMap.trader = k;
    if (lk.includes("linhadenegocio") || (lk.includes("linha") && lk.includes("negocio"))) headerMap.linha = k;
    if (lk.includes("status")) headerMap.status = k;
    if (lk === "cliente") headerMap.cliente = k;
    if (lk === "fornecedor") headerMap.fornecedor = k;
    if (lk === "produto") headerMap.produto = k;
    if (lk.includes("margem")) headerMap.margem = k;
    if (lk === "etd") headerMap.etd = k;
    if (lk === "lob") headerMap.lob = k;
  });

  const rows = lob.map(r => {
    const etd = parseETD(r[headerMap.etd] || "");
    return {
      processo: r[headerMap.processo] || "",
      responsavel: r[headerMap.responsavel] || "",
      trader: (r[headerMap.trader] || "").trim(),
      linha: (r[headerMap.linha] || "").trim(),
      status: (r[headerMap.status] || "").trim(),
      cliente: r[headerMap.cliente] || "",
      fornecedor: r[headerMap.fornecedor] || "",
      produto: r[headerMap.produto] || "",
      margem: parseMoney(r[headerMap.margem] || "0"),
      etd,
      etdMonth: etd ? etd.getMonth() : -1,
      etdYear: etd ? etd.getFullYear() : -1,
      lob: parseMoney(r[headerMap.lob] || "0"),
    };
  });

  // Filter by current year
  const yearRows = rows.filter(r => r.etdYear === currentYear);

  // Monthly LOB — show from (currentMonth-1) to (currentMonth+2), split by embarcado
  const chartStart = Math.max(0, currentMonth - 1);
  const chartEnd = Math.min(11, currentMonth + 2);
  const monthlyLOB = [];
  for (let i = chartStart; i <= chartEnd; i++) {
    const monthRows = yearRows.filter(r => r.etdMonth === i);
    const lobEmbarcado = monthRows.filter(r => r.status.toLowerCase() === "embarcado").reduce((s, r) => s + r.lob, 0);
    const lobOutros = monthRows.filter(r => r.status.toLowerCase() !== "embarcado").reduce((s, r) => s + r.lob, 0);
    monthlyLOB.push({ month: MONTH_SHORT[i], monthIndex: i, embarcado: lobEmbarcado, outros: lobOutros, lob: lobEmbarcado + lobOutros });
  }

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
    const keys = Object.keys(r);
    const nameKey = keys.find(k => k.toLowerCase().includes("trader")) || keys[0];
    const name = (r[nameKey] || "").trim();
    const currentMonthName = MONTH_NAMES[currentMonth];
    const normalizedMonth = currentMonthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let monthKey = keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === normalizedMonth);
    if (!monthKey) monthKey = keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().startsWith(normalizedMonth.substring(0, 3)));
    const metaMes = parseMoney(monthKey ? (r[monthKey] || "0") : "0");
    const totalKey = keys.find(k => k.toLowerCase().trim() === "total") || keys.find(k => k.toLowerCase().includes("total"));
    const metaAno = parseMoney(totalKey ? (r[totalKey] || "0") : "0");
    if (name) traderMetas[name] = { metaMes, metaAno };
  });

  const findTraderMeta = (traderName) => {
    if (traderMetas[traderName]) return traderMetas[traderName];
    const norm = traderName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    for (const [k, v] of Object.entries(traderMetas)) {
      const nk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      if (nk === norm || nk.includes(norm) || norm.includes(nk)) return v;
    }
    return { metaMes: 0, metaAno: 0 };
  };

  // Get known trader names from metas sheet
  const knownTraderNames = new Set(Object.keys(traderMetas).map(n => n.toLowerCase().trim()));

  const traderRanking = Object.values(traderMap)
    .filter(t => {
      // Exclude entries that are linha de negocio names, not traders
      const tn = t.name.toLowerCase().trim();
      // If we have known traders, only include those; otherwise include all
      if (knownTraderNames.size > 0) {
        return knownTraderNames.has(tn) || Object.keys(traderMetas).some(k => 
          k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === 
          tn.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
        );
      }
      return true;
    })
    .map(t => {
      const meta = findTraderMeta(t.name);
      return {
        ...t,
        metaMes: meta.metaMes,
        metaAno: meta.metaAno,
        pctMes: meta.metaMes ? (t.lobMes / meta.metaMes * 100) : 0,
        pctAno: meta.metaAno ? (t.lobAno / meta.metaAno * 100) : 0,
      };
    }).sort((a, b) => b.lobMes - a.lobMes);

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
    const keys = Object.keys(r);
    const nameKey = keys.find(k => k.toLowerCase().replace(/[_\s]/g, "").includes("linha")) || keys[0];
    const name = (r[nameKey] || "").trim();
    // Find month column - try exact match first, then partial
    const currentMonthName = MONTH_NAMES[currentMonth];
    const normalizedMonth = currentMonthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let monthKey = keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === normalizedMonth);
    if (!monthKey) monthKey = keys.find(k => k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().startsWith(normalizedMonth.substring(0, 3)));
    if (!monthKey) monthKey = keys.find(k => normalizedMonth.startsWith(k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().substring(0, 3)));
    const metaMes = parseMoney(monthKey ? (r[monthKey] || "0") : "0");
    const totalKey = keys.find(k => k.toLowerCase().trim() === "total") || keys.find(k => k.toLowerCase().includes("total"));
    const metaAno = parseMoney(totalKey ? (r[totalKey] || "0") : "0");
    if (name) linhaMetas[name] = { metaMes, metaAno };
    console.log("Meta Linha:", name, "MonthKey:", monthKey, "MetaMes:", metaMes, "MetaAno:", metaAno, "Keys:", keys);
  });

  // Helper to match linha names flexibly
  const findLinhaMeta = (linhaName) => {
    if (linhaMetas[linhaName]) return linhaMetas[linhaName];
    const norm = linhaName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    for (const [k, v] of Object.entries(linhaMetas)) {
      const nk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      if (nk === norm || nk.includes(norm) || norm.includes(nk)) return v;
    }
    return { metaMes: 0, metaAno: 0 };
  };

  const linhaRanking = Object.values(linhaMap).map(l => {
    const meta = findLinhaMeta(l.name);
    return {
      ...l,
      metaMes: meta.metaMes,
      metaAno: meta.metaAno,
      pctMes: meta.metaMes ? (l.lobMes / meta.metaMes * 100) : 0,
      pctAno: meta.metaAno ? (l.lobAno / meta.metaAno * 100) : 0,
    };
  }).sort((a, b) => b.lobAno - a.lobAno);

  // Meta Global
  const globalMetas = {};
  metaGlobal.forEach(r => {
    // Try multiple possible column names
    const keys = Object.keys(r);
    const mesKey = keys.find(k => k.trim().toLowerCase().startsWith("m") && k.trim().length < 10) || keys[0];
    const metaKey = keys.find(k => k.trim().toLowerCase().includes("meta")) || keys[1];
    const mes = (r[mesKey] || "").trim();
    const val = parseMoney(r[metaKey] || "0");
    if (mes) globalMetas[mes] = val;
  });

  // Also try matching month names with accents removed
  const matchMeta = (monthName) => {
    if (globalMetas[monthName]) return globalMetas[monthName];
    const normalized = monthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (const [k, v] of Object.entries(globalMetas)) {
      const nk = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (nk === normalized) return v;
    }
    return 0;
  };

  const lobMesAtual = currentMonthRows.reduce((s, r) => s + r.lob, 0);
  const metaMesAtual = matchMeta(MONTH_NAMES[currentMonth]);
  const lobAnoTotal = yearRows.reduce((s, r) => s + r.lob, 0);
  const metaAnoTotal = MONTH_NAMES.reduce((s, m) => s + matchMeta(m), 0);

  // Trimestral
  const qStart = Math.floor(currentMonth / 3) * 3;
  const lobTrimestral = yearRows.filter(r => r.etdMonth >= qStart && r.etdMonth <= currentMonth).reduce((s, r) => s + r.lob, 0);
  const metaTrimestral = MONTH_NAMES.slice(qStart, qStart + 3).reduce((s, m) => s + matchMeta(m), 0);

  // Status count with LOB
  const statusData = {};
  currentMonthRows.forEach(r => {
    if (!r.status) return;
    if (!statusData[r.status]) statusData[r.status] = { count: 0, lob: 0 };
    statusData[r.status].count += 1;
    statusData[r.status].lob += r.lob;
  });

  // Monthly LOB with meta for chart
  const monthlyWithMeta = monthlyLOB.map(m => ({
    ...m,
    meta: matchMeta(MONTH_NAMES[m.monthIndex]),
  }));

  // Top/Bottom margins for current month
  const margensDoMes = currentMonthRows
    .filter(r => r.margem > 0 && r.processo)
    .map(r => ({ processo: r.processo, cliente: r.cliente, produto: r.produto, trader: r.trader, linha: r.linha, margem: r.margem, lob: r.lob }));
  const topMargens = [...margensDoMes].sort((a, b) => b.margem - a.margem).slice(0, 3);
  const bottomMargens = [...margensDoMes].sort((a, b) => a.margem - b.margem).slice(0, 3);

  // Products per linha for pizza charts (current month)
  const produtosPorLinha = {};
  currentMonthRows.forEach(r => {
    if (!r.linha || !r.produto) return;
    if (!produtosPorLinha[r.linha]) produtosPorLinha[r.linha] = {};
    if (!produtosPorLinha[r.linha][r.produto]) produtosPorLinha[r.linha][r.produto] = { count: 0, lob: 0 };
    produtosPorLinha[r.linha][r.produto].count += 1;
    produtosPorLinha[r.linha][r.produto].lob += r.lob;
  });

  return {
    monthlyLOB: monthlyWithMeta,
    traderRanking,
    linhaRanking,
    lobMesAtual, metaMesAtual,
    lobTrimestral, metaTrimestral,
    lobAnoTotal, metaAnoTotal,
    totalOps: currentMonthRows.length,
    totalOpsAno: yearRows.length,
    statusData,
    topMargens,
    bottomMargens,
    produtosPorLinha,
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
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#fff", fontFamily: FONT }}>{title}</span>
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 120 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "#fff", textTransform: "uppercase", fontFamily: FONT }}>{period}</span>
      <div style={{ position: "relative", width: 120, height: 75 }}>
        <svg viewBox="0 0 120 75" style={{ width: "100%", height: "100%" }}>
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={C.panelBorder} strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={displayPct >= 100 ? C.green : color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(arcPct / 100) * 157} 157`} style={{ filter: `drop-shadow(0 0 6px ${color}60)`, transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div style={{ position: "absolute", top: "45%", left: "50%", transform: "translate(-50%, -10%)", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: displayPct >= 100 ? C.green : "#fff", fontFamily: FONT, lineHeight: 1 }}>{displayPct.toFixed(1)}%</div>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, fontFamily: FONT }}>{fmtUSD(value)}</div>
        <div style={{ fontSize: 10, color: "#fff", fontFamily: FONT, opacity: 0.7 }}>
          {remaining > 0 ? <>Faltam <span style={{ color: C.amber, fontWeight: 700, opacity: 1 }}>{fmtUSD(remaining)}</span></> : <span style={{ color: C.green, fontWeight: 700, opacity: 1 }}>Meta batida! +{fmtUSD(Math.abs(remaining))}</span>}
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, meta, icon, color }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${C.panel}, ${color}08)`, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "14px 16px", flex: 1, minWidth: 140, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -10, right: -10, fontSize: 50, opacity: 0.04, color }}>{icon}</div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.white, textTransform: "uppercase", fontFamily: FONT, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: FONT, marginBottom: 4 }}>{value}</div>
      {meta && <div style={{ fontSize: 13, color: C.green, fontWeight: 700, fontFamily: FONT }}>Meta: {meta}</div>}
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
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, flexShrink: 0 }}>{viewMode === "ano" ? t.ops : t.opsMes} proc.</span>
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load Google Identity Services
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  const handleGoogleLogin = () => {
    setLoading(true);
    setError("");
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          if (response.error) {
            setError("Erro na autenticação: " + response.error);
            setLoading(false);
            return;
          }
          setAccessToken(response.access_token);
          // Auto-refresh token before expiry
          const expiresIn = (response.expires_in - 60) * 1000;
          setInterval(() => {
            client.requestAccessToken({ prompt: "" });
          }, expiresIn);
          onLogin(true);
        },
      });
      client.requestAccessToken();
    } catch (e) {
      setError("Erro ao iniciar autenticação Google");
      setLoading(false);
    }
  };

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
          {error && <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}
          <button onClick={handleGoogleLogin} disabled={loading} style={{ padding: "12px", fontSize: 14, fontWeight: 700, fontFamily: FONT, background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", letterSpacing: 0.5, opacity: loading ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {loading ? "Conectando..." : "Entrar com Google"}
          </button>
          <div style={{ fontSize: 11, color: C.dimText, marginTop: 4 }}>Use sua conta @independentbrazil.com</div>
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
//  CAROUSEL SLIDES
// ══════════════════════════════════════════════════════════════
const SLIDE_NAMES = ["Visão Geral", "Ranking de Traders", "Linhas de Negócio", "Status dos Processos", "Metas Globais", "Margens de Venda", "Produtos por Linha"];
const SLIDE_INTERVAL = 20000;

function SlideOverview({ d }) {
  // Custom label for bars showing total and difference vs meta
  const DiffLabel = (props) => {
    const { x, y, width, index } = props;
    if (!d.monthlyLOB[index]) return null;
    const item = d.monthlyLOB[index];
    const total = item.embarcado + item.outros;
    const meta = item.meta || 0;
    const diff = total - meta;
    if (total === 0) return null;
    return (
      <g>
        <text x={x + width / 2} y={y - 38} textAnchor="middle" fill="#fff" fontSize={14} fontWeight={800} fontFamily={FONT}>{fmtUSD(total)}</text>
        {meta > 0 && <text x={x + width / 2} y={y - 20} textAnchor="middle" fill={diff >= 0 ? C.green : C.red} fontSize={12} fontWeight={700} fontFamily={FONT}>{diff >= 0 ? "+" : ""}{fmtUSD(diff)}</text>}
      </g>
    );
  };
  // Custom dot for meta line showing value below the dot
  const MetaDot = (props) => {
    const { cx, cy, value } = props;
    if (!value) return null;
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill={C.red} />
        <text x={cx} y={cy + 20} textAnchor="middle" fill={C.red} fontSize={11} fontWeight={700} fontFamily={FONT}>{fmtUSD(value)}</text>
      </g>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, padding: "0 20px" }}>
      <div style={{ display: "flex", gap: 12 }}>
        <KPICard label={`LOB ${d.currentMonthName}`} value={fmtUSD(d.lobMesAtual)} meta={fmtUSD(d.metaMesAtual)} icon="💰" color={C.green} />
        <KPICard label="LOB Trimestral" value={fmtUSD(d.lobTrimestral)} meta={fmtUSD(d.metaTrimestral)} icon="📊" color={C.cyan} />
        <KPICard label="LOB Anual" value={fmtUSD(d.lobAnoTotal)} meta={fmtUSD(d.metaAnoTotal)} icon="🏆" color={C.amber} />
        <KPICard label="Processos do Mês" value={`${d.totalOps}`} meta={`Ano: ${d.totalOpsAno} processos`} icon="📋" color={C.blue} />
      </div>
      <Panel title="LOB Mensal vs Meta" icon="📈" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={d.monthlyLOB} margin={{ top: 55, right: 20, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.panelBorder} />
            <XAxis dataKey="month" tick={{ fontSize: 16, fill: "#fff", fontFamily: FONT, fontWeight: 600 }} tickLine={false} axisLine={{ stroke: C.panelBorder }} />
            <YAxis tick={{ fontSize: 12, fill: "#fff", fontFamily: FONT }} tickLine={false} axisLine={false} tickFormatter={fmtUSD} width={80} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="embarcado" name="Embarcado" stackId="lob" fill="#ffffff" maxBarSize={50} />
            <Bar dataKey="outros" name="Outros Status" stackId="lob" fill="#4a5568" radius={[4, 4, 0, 0]} maxBarSize={50} label={<DiffLabel />} />
            <Line type="monotone" dataKey="meta" name="Meta" stroke={C.red} strokeWidth={3} dot={<MetaDot />} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 4 }}>
          <span style={{ fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 6, fontFamily: FONT }}><span style={{ width: 14, height: 10, background: "#fff", borderRadius: 2, display: "inline-block" }} /> Embarcado (confirmado)</span>
          <span style={{ fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 6, fontFamily: FONT }}><span style={{ width: 14, height: 10, background: "#4a5568", borderRadius: 2, display: "inline-block" }} /> Outros Status (projetado)</span>
          <span style={{ fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 6, fontFamily: FONT }}><span style={{ width: 14, height: 4, background: C.red, borderRadius: 2, display: "inline-block" }} /> Meta</span>
        </div>
      </Panel>
    </div>
  );
}

function SlideTraders({ d }) {
  const maxLob = d.traderRanking.length > 0 ? Math.max(...d.traderRanking.map(t => t.lobMes)) : 1;
  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center", marginBottom: 8 }}>🏆 RANKING DE TRADERS — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, justifyContent: "center" }}>
        {d.traderRanking.map((t, i) => {
          const medals = ["🥇", "🥈", "🥉"];
          const avatar = t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
          const barW = maxLob > 0 ? (t.lobMes / maxLob) * 100 : 0;
          return (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderRadius: 10, background: i === 0 ? `${C.green}10` : "transparent", borderLeft: i < 3 ? `4px solid ${[C.green, C.cyan, C.amber][i]}` : "4px solid transparent" }}>
              <span style={{ fontSize: 28, width: 40, textAlign: "center" }}>{i < 3 ? medals[i] : <span style={{ color: C.dimText, fontSize: 20, fontWeight: 800 }}>{i + 1}</span>}</span>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>{avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{t.name}</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: FONT }}>{fmtUSD(t.lobMes)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 6, background: C.panelBorder, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(barW, 100)}%`, height: "100%", background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 14, color: t.pctMes >= 100 ? C.green : C.amber, fontWeight: 700, fontFamily: FONT }}>{t.pctMes.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>{t.opsMes} proc.</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideLinhas({ d }) {
  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🏷️ LINHAS DE NEGÓCIO — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, justifyContent: "center" }}>
        {d.linhaRanking.map(l => {
          const colors = { "Import": C.blue, "Feed Meal": C.cyan, "Meat": "#ff6b6b" };
          const color = colors[l.name] || C.amber;
          return (
            <div key={l.name} style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{l.name}</span>
                <span style={{ fontSize: 28, fontWeight: 900, color, fontFamily: FONT }}>{fmtUSD(l.lobMes)}</span>
              </div>
              <div style={{ height: 10, background: C.panelBorder, borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ width: `${Math.min(l.pctMes, 100)}%`, height: "100%", background: color, borderRadius: 5 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "#fff", fontFamily: FONT, alignItems: "center" }}>
                <span>Meta: {fmtUSD(l.metaMes)}</span>
                <span style={{ color: l.pctMes >= 100 ? C.green : C.amber, fontWeight: 900, fontSize: 24 }}>{l.pctMes.toFixed(1)}%</span>
                <span style={{ fontWeight: 700, fontSize: 18, color: l.metaMes - l.lobMes > 0 ? C.amber : C.green }}>{l.metaMes - l.lobMes > 0 ? `Faltam ${fmtUSD(l.metaMes - l.lobMes)}` : "Meta batida! 🎉"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideStatus({ d }) {
  const entries = Object.entries(d.statusData).sort((a, b) => b[1].lob - a[1].lob);
  const statusColors = { "Embarcado": C.green, "Com Booking": C.cyan, "Sem Booking": C.amber, "Claim": C.red, "Stand by": C.muted };
  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>📦 STATUS DOS PROCESSOS — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, flex: 1, alignContent: "center" }}>
        {entries.map(([status, data]) => {
          const color = statusColors[status] || C.blue;
          return (
            <div key={status} style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 12, padding: "24px", textAlign: "center" }}>
              <div style={{ fontSize: 16, color: "#fff", fontWeight: 700, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>{status}</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", fontFamily: FONT, marginBottom: 4 }}>{fmtUSD(data.lob)}</div>
              <div style={{ fontSize: 16, color, fontWeight: 700, fontFamily: FONT }}>{data.count} {data.count === 1 ? "processo" : "processos"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideGauges({ d }) {
  const BigGauge = ({ value, max, period, color }) => {
    const pct = max > 0 ? Math.min((value / max) * 100, 150) : 0;
    const displayPct = max > 0 ? (value / max) * 100 : 0;
    const remaining = max - value;
    const arcPct = Math.min(pct, 100);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, flex: 1 }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, color: "#fff", textTransform: "uppercase", fontFamily: FONT }}>{period}</span>
        <div style={{ position: "relative", width: 260, height: 160 }}>
          <svg viewBox="0 0 120 75" style={{ width: "100%", height: "100%" }}>
            <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={C.panelBorder} strokeWidth="6" strokeLinecap="round" />
            <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={displayPct >= 100 ? C.green : color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(arcPct / 100) * 157} 157`} style={{ filter: `drop-shadow(0 0 8px ${color}80)` }} />
          </svg>
          <div style={{ position: "absolute", top: "42%", left: "50%", transform: "translate(-50%, -10%)", textAlign: "center" }}>
            <div style={{ fontSize: 44, fontWeight: 900, color: displayPct >= 100 ? C.green : "#fff", fontFamily: FONT, lineHeight: 1 }}>{displayPct.toFixed(1)}%</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, color: "#fff", fontWeight: 800, fontFamily: FONT }}>{fmtUSD(value)}</div>
          <div style={{ fontSize: 16, color: "#fff", fontFamily: FONT, marginTop: 4 }}>
            {remaining > 0 ? <>Faltam <span style={{ color: C.amber, fontWeight: 800 }}>{fmtUSD(remaining)}</span></> : <span style={{ color: C.green, fontWeight: 800 }}>Meta batida! +{fmtUSD(Math.abs(remaining))}</span>}
          </div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: FONT, marginTop: 2 }}>Meta: {fmtUSD(max)}</div>
        </div>
      </div>
    );
  };
  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🎯 ATINGIMENTO DE META GLOBAL</div>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", flex: 1, alignItems: "center" }}>
        <BigGauge value={d.lobMesAtual} max={d.metaMesAtual} period="Mensal" color={C.green} />
        <BigGauge value={d.lobTrimestral} max={d.metaTrimestral} period="Trimestral" color={C.cyan} />
        <BigGauge value={d.lobAnoTotal} max={d.metaAnoTotal} period="Anual" color={C.amber} />
      </div>
    </div>
  );
}

function SlideMargens({ d }) {
  const MargemCard = ({ item, rank, type }) => {
    const isTop = type === "top";
    const color = isTop ? C.green : C.red;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderRadius: 10, background: `${color}08`, borderLeft: `4px solid ${color}` }}>
        <span style={{ fontSize: 28, fontWeight: 900, color, fontFamily: FONT, width: 40, textAlign: "center" }}>#{rank + 1}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: FONT }}>{item.processo}</span>
            <span style={{ fontSize: 22, fontWeight: 900, color, fontFamily: FONT }}>{item.margem.toFixed(1)}%</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.cyan, fontFamily: FONT, marginBottom: 4 }}>{item.produto || "—"}</div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>
            {item.trader} • {item.linha} • {item.cliente ? item.cliente.substring(0, 40) : ""} • LOB: {fmtUSD(item.lob)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, padding: "0 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>📊 MARGENS DE VENDA — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, flex: 1, alignContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: FONT, textAlign: "center", marginBottom: 8 }}>▲ TOP 3 MAIORES</div>
          {d.topMargens.map((m, i) => <MargemCard key={m.processo} item={m} rank={i} type="top" />)}
          {d.topMargens.length === 0 && <div style={{ color: C.muted, textAlign: "center", fontSize: 14 }}>Sem dados de margem no mês</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.red, fontFamily: FONT, textAlign: "center", marginBottom: 8 }}>▼ TOP 3 MENORES</div>
          {d.bottomMargens.map((m, i) => <MargemCard key={m.processo} item={m} rank={i} type="bottom" />)}
          {d.bottomMargens.length === 0 && <div style={{ color: C.muted, textAlign: "center", fontSize: 14 }}>Sem dados de margem no mês</div>}
        </div>
      </div>
    </div>
  );
}

const PIE_COLORS = ["#00e5ff", "#2979ff", "#ffab00", "#00e676", "#ff6b6b", "#ab47bc", "#26a69a", "#ff7043", "#78909c", "#5c6bc0", "#8d6e63", "#ef5350"];

function SlideProdutos({ d }) {
  const linhas = Object.entries(d.produtosPorLinha);
  const linhaColors = { "Import": C.blue, "Feed Meal": C.cyan, "Meat": "#ff6b6b" };

  return (
    <div style={{ flex: 1, padding: "0 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: FONT, textAlign: "center" }}>🥧 PRODUTOS POR LINHA DE NEGÓCIO — {d.currentMonthName.toUpperCase()}</div>
      <div style={{ display: "flex", gap: 16, flex: 1, justifyContent: "center", alignItems: "center" }}>
        {linhas.map(([linha, produtos]) => {
          const entries = Object.entries(produtos).sort((a, b) => b[1].lob - a[1].lob);
          const totalLob = entries.reduce((s, [, v]) => s + v.lob, 0);
          const pieData = entries.map(([name, v]) => ({ name: name.length > 25 ? name.substring(0, 25) + "..." : name, fullName: name, value: Math.max(v.lob, 0.01), count: v.count, pct: totalLob > 0 ? ((v.lob / totalLob) * 100).toFixed(1) : 0 }));
          const color = linhaColors[linha] || C.amber;
          const isSingle = pieData.length === 1;

          return (
            <div key={linha} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, maxWidth: linhas.length > 2 ? "33%" : "50%" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: FONT }}>{linha}</div>
              <div style={{ fontSize: 16, color: "#fff", fontWeight: 700, fontFamily: FONT }}>{fmtUSD(totalLob)}</div>
              <ResponsiveContainer width="100%" height={isSingle ? 180 : 240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={isSingle ? 70 : 90} innerRadius={isSingle ? 30 : 40} paddingAngle={isSingle ? 0 : 2} startAngle={90} endAngle={-270} label={isSingle ? false : ({ pct }) => `${pct}%`} labelLine={isSingle ? false : { stroke: C.muted, strokeWidth: 1 }}>
                    {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtUSD(v)} contentStyle={{ background: "#1a2332ee", border: `1px solid ${C.panelBorder}`, borderRadius: 6, fontFamily: FONT }} itemStyle={{ color: "#fff" }} labelStyle={{ color: C.muted }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflow: "auto", width: "100%" }}>
                {pieData.map((p, idx) => (
                  <div key={p.fullName} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#fff", fontFamily: FONT }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[idx % PIE_COLORS.length], flexShrink: 0, display: "inline-block" }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.fullName}</span>
                    <span style={{ fontWeight: 700, flexShrink: 0 }}>{p.pct}%</span>
                    <span style={{ color: C.muted, flexShrink: 0 }}>({p.count} proc.)</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN DASHBOARD WITH CAROUSEL
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [tvMode, setTvMode] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [paused, setPaused] = useState(false);
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
      if (e.message === "TOKEN_EXPIRED") {
        setLoggedIn(false);
        setAccessToken(null);
      } else {
        setError("Erro ao carregar dados: " + e.message);
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    loadData();
    const iv = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(iv);
  }, [loggedIn, loadData]);

  useEffect(() => {
    if (!tvMode || paused || !data) return;
    const iv = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % SLIDE_NAMES.length);
    }, SLIDE_INTERVAL);
    return () => clearInterval(iv);
  }, [tvMode, paused, data]);

  const goNext = () => setCurrentSlide(prev => (prev + 1) % SLIDE_NAMES.length);
  const goPrev = () => setCurrentSlide(prev => (prev - 1 + SLIDE_NAMES.length) % SLIDE_NAMES.length);

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
        <button onClick={loadData} style={{ marginTop: 16, padding: "10px 24px", background: C.blue, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontWeight: 700 }}>Tentar novamente</button>
      </div>
    </div>
  );

  if (!data) return null;
  const d = data;
  const maxTraderLob = d.traderRanking.length > 0 ? Math.max(...d.traderRanking.map(t => config.viewMode === "ano" ? t.lobAno : t.lobMes)) : 1;

  // ── TV MODE ──
  if (tvMode) {
    const slides = [<SlideOverview d={d} />, <SlideTraders d={d} />, <SlideLinhas d={d} />, <SlideStatus d={d} />, <SlideGauges d={d} />, <SlideMargens d={d} />, <SlideProdutos d={d} />];
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.white, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
        <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box;margin:0;padding:0}`}</style>
        <div style={{ padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.panelBorder}`, background: `linear-gradient(180deg, #0d1220, ${C.bg})` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 2 }}>
              <svg viewBox="0 0 100 100" width="34" height="34" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="96" height="96" fill="white" stroke="#111" strokeWidth="8"/><text x="50" y="68" textAnchor="middle" fontFamily={FONT} fontSize="52" fontWeight="900" fill="#111">IB</text></svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: FONT, color: "#fff" }}>INDEPENDENT BRAZIL</div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT }}>Trading Desk • {d.currentMonthName} {new Date().getFullYear()}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", gap: 5 }}>{SLIDE_NAMES.map((name, i) => (<div key={i} onClick={() => setCurrentSlide(i)} title={name} style={{ width: i === currentSlide ? 22 : 8, height: 8, borderRadius: 4, background: i === currentSlide ? C.cyan : C.panelBorder, cursor: "pointer", transition: "all 0.3s" }} />))}</div>
            <button onClick={goPrev} style={{ background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "4px 10px", color: "#fff", cursor: "pointer", fontSize: 14 }}>◀</button>
            <button onClick={() => setPaused(!paused)} style={{ background: paused ? C.green : "none", border: `1px solid ${paused ? C.green : C.panelBorder}`, borderRadius: 6, padding: "4px 10px", color: "#fff", cursor: "pointer", fontSize: 14, minWidth: 32 }}>{paused ? "▶" : "⏸"}</button>
            <button onClick={goNext} style={{ background: "none", border: `1px solid ${C.panelBorder}`, borderRadius: 6, padding: "4px 10px", color: "#fff", cursor: "pointer", fontSize: 14 }}>▶</button>
            <button onClick={() => { setTvMode(false); setPaused(false); }} style={{ background: `linear-gradient(135deg, ${C.red}cc, ${C.red})`, border: "none", borderRadius: 6, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: FONT, fontWeight: 700 }}>✕ Sair do Modo TV</button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s ease-in-out infinite", boxShadow: `0 0 8px ${C.green}80` }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.green, fontFamily: FONT }}>LIVE</span>
            </div>
            <Clock />
          </div>
        </div>
        {!paused && (<div style={{ height: 3, background: C.panelBorder }}><div key={currentSlide} style={{ height: "100%", background: C.cyan, animation: `progress ${SLIDE_INTERVAL}ms linear`, width: "100%" }} /><style>{`@keyframes progress{from{width:0}to{width:100%}}`}</style></div>)}
        <div key={currentSlide} style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 0", animation: "fadeIn 0.5s ease" }}>{slides[currentSlide]}</div>
        <div style={{ padding: "6px 24px", borderTop: `1px solid ${C.panelBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.dimText, fontFamily: FONT }}>
          <span>🔗 Google Sheets • Atualização a cada 1 min</span>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>📺 {SLIDE_NAMES[currentSlide]} ({currentSlide + 1}/{SLIDE_NAMES.length})</span>
          <span>Último update: {lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : "—"} • INDEPENDENT BRAZIL v4.0</span>
        </div>
      </div>
    );
  }

  // ── DASHBOARD MODE (Home) ──
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.white, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.panelBorder};border-radius:4px}`}</style>
      {settingsOpen && <SettingsPanel config={config} setConfig={setConfig} onClose={() => setSettingsOpen(false)} />}
      {/* Header */}
      <div style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.panelBorder}`, background: `linear-gradient(180deg, #0d1220, ${C.bg})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 3 }}>
            <svg viewBox="0 0 100 100" width="38" height="38" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="96" height="96" fill="white" stroke="#111" strokeWidth="8"/><text x="50" y="68" textAnchor="middle" fontFamily={FONT} fontSize="52" fontWeight="900" fill="#111">IB</text></svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: FONT, color: "#fff" }}>INDEPENDENT BRAZIL</div>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: FONT }}>Trading Desk • {d.currentMonthName} {new Date().getFullYear()}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { setTvMode(true); setCurrentSlide(0); setPaused(false); }} style={{ background: `linear-gradient(135deg, ${C.blue}, ${C.cyan})`, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: "#fff", fontFamily: FONT, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>📺 Modo TV</button>
          <button onClick={() => setSettingsOpen(true)} style={{ background: C.panelBorder, border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 16, color: C.muted }} title="Configurações">⚙️</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 2s ease-in-out infinite", boxShadow: `0 0 8px ${C.green}80` }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.green, fontFamily: FONT }}>LIVE</span>
          </div>
          <Clock />
        </div>
      </div>
      {/* KPIs with mini gauges */}
      {config.showKPIs && (
        <div style={{ display: "flex", gap: 12, padding: "14px 20px" }}>
          {[
            { label: `LOB ${d.currentMonthName}`, value: d.lobMesAtual, meta: d.metaMesAtual, color: C.green, icon: "💰" },
            { label: "LOB Trimestral", value: d.lobTrimestral, meta: d.metaTrimestral, color: C.cyan, icon: "📊" },
            { label: "LOB Anual", value: d.lobAnoTotal, meta: d.metaAnoTotal, color: C.amber, icon: "🏆" },
          ].map((kpi, idx) => {
            const pct = kpi.meta > 0 ? (kpi.value / kpi.meta * 100) : 0;
            const arcPct = Math.min(pct, 100);
            return (
              <div key={idx} style={{ background: `linear-gradient(135deg, ${C.panel}, ${kpi.color}08)`, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "12px 16px", flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ position: "relative", width: 56, height: 40, flexShrink: 0 }}>
                  <svg viewBox="0 0 120 75" style={{ width: "100%", height: "100%" }}>
                    <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={C.panelBorder} strokeWidth="8" strokeLinecap="round" />
                    <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke={pct >= 100 ? C.green : kpi.color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(arcPct / 100) * 157} 157`} />
                  </svg>
                  <div style={{ position: "absolute", top: "38%", left: "50%", transform: "translate(-50%, -10%)", fontSize: 9, fontWeight: 800, color: pct >= 100 ? C.green : "#fff", fontFamily: FONT }}>{pct.toFixed(0)}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#fff", textTransform: "uppercase", fontFamily: FONT, marginBottom: 2 }}>{kpi.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{fmtUSD(kpi.value)}</div>
                  <div style={{ fontSize: 11, color: C.green, fontWeight: 700, fontFamily: FONT }}>Meta: {fmtUSD(kpi.meta)}</div>
                </div>
              </div>
            );
          })}
          <div style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.blue}08)`, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "12px 16px", flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#fff", textTransform: "uppercase", fontFamily: FONT, marginBottom: 4 }}>Processos do Mês</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{d.totalOps}</div>
            <div style={{ fontSize: 11, color: C.green, fontWeight: 700, fontFamily: FONT }}>Ano: {d.totalOpsAno} processos</div>
          </div>
        </div>
      )}
      {/* Main Grid */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", gap: 12, padding: "0 20px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {config.showChart && (
            <Panel title="LOB Mensal vs Meta" icon="📈" style={{ flex: 1 }}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={d.monthlyLOB} margin={{ top: 35, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.panelBorder} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#fff", fontFamily: FONT }} tickLine={false} axisLine={{ stroke: C.panelBorder }} />
                  <YAxis tick={{ fontSize: 11, fill: "#fff", fontFamily: FONT }} tickLine={false} axisLine={false} tickFormatter={fmtUSD} width={75} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="embarcado" name="Embarcado" stackId="lob" fill="#ffffff" maxBarSize={32} />
                  <Bar dataKey="outros" name="Outros Status" stackId="lob" fill="#4a5568" radius={[3, 3, 0, 0]} maxBarSize={32} label={(props) => { const { x, y, width, index } = props; const item = d.monthlyLOB[index]; if (!item) return null; const total = item.embarcado + item.outros; if (total <= 0) return null; return <text x={x + width / 2} y={y - 8} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700} fontFamily={FONT}>{fmtUSD(total)}</text>; }} />
                  <Line type="monotone" dataKey="meta" name="Meta" stroke={C.red} strokeWidth={2} dot={{ fill: C.red, r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 18, justifyContent: "center", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "#fff", display: "flex", alignItems: "center", gap: 5, fontFamily: FONT }}><span style={{ width: 12, height: 3, background: "#fff", borderRadius: 2, display: "inline-block" }} /> Embarcado</span>
                <span style={{ fontSize: 11, color: "#fff", display: "flex", alignItems: "center", gap: 5, fontFamily: FONT }}><span style={{ width: 12, height: 3, background: "#4a5568", borderRadius: 2, display: "inline-block" }} /> Outros</span>
                <span style={{ fontSize: 11, color: "#fff", display: "flex", alignItems: "center", gap: 5, fontFamily: FONT }}><span style={{ width: 12, height: 3, background: C.red, borderRadius: 2, display: "inline-block" }} /> Meta</span>
              </div>
            </Panel>
          )}
          {config.showLinhas && (
            <Panel title={`Linhas de Negócio — ${config.viewMode === "ano" ? "Anual" : d.currentMonthName}`} icon="🏷️">
              <div style={{ display: "flex", gap: 12 }}>
                {d.linhaRanking.map(l => <div key={l.name} style={{ flex: 1 }}><LinhaRow l={l} viewMode={config.viewMode} /></div>)}
              </div>
            </Panel>
          )}
          {config.showStatus && Object.keys(d.statusData).length > 0 && (
            <Panel title={`Status dos Processos — ${d.currentMonthName}`} icon="📦">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {Object.entries(d.statusData).sort((a, b) => b[1].lob - a[1].lob).map(([status, sdata]) => (
                  <div key={status} style={{ background: `${C.blue}15`, border: `1px solid ${C.blue}30`, borderRadius: 8, padding: "12px 16px", minWidth: 130, flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, fontFamily: FONT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{status}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: FONT }}>{fmtUSD(sdata.lob)}</div>
                    <div style={{ fontSize: 11, color: C.cyan, fontWeight: 600, fontFamily: FONT }}>{sdata.count} {sdata.count === 1 ? "processo" : "processos"}</div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
        {config.showTraders && (
          <Panel title={`Ranking de Traders — ${config.viewMode === "ano" ? "Anual" : d.currentMonthName}`} icon="🏆" style={{ overflow: "hidden" }}>
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
              {d.traderRanking.map((t, i) => <TraderRow key={t.name} rank={i} t={t} maxLob={maxTraderLob} viewMode={config.viewMode} />)}
            </div>
            <div style={{ borderTop: `1px solid ${C.panelBorder}`, paddingTop: 10, marginTop: 4, display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, fontFamily: FONT }}>
              <span>Total: <span style={{ color: C.white, fontWeight: 700 }}>{fmtUSD(d.traderRanking.reduce((s, t) => s + (config.viewMode === "ano" ? t.lobAno : t.lobMes), 0))}</span></span>
              <span>Processos: <span style={{ color: C.white, fontWeight: 700 }}>{d.traderRanking.reduce((s, t) => s + (config.viewMode === "ano" ? t.ops : t.opsMes), 0)}</span></span>
            </div>
          </Panel>
        )}
      </div>
      <div style={{ padding: "8px 24px", borderTop: `1px solid ${C.panelBorder}`, display: "flex", justifyContent: "space-between", fontSize: 10, color: C.dimText, fontFamily: FONT }}>
        <span>🔗 Google Sheets • Atualização a cada 1 min</span>
        <span>Último update: {lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : "—"}</span>
        <span>INDEPENDENT BRAZIL • Trading Desk v4.0 • {new Date().getFullYear()}</span>
      </div>
    </div>
  );
}
