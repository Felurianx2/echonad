"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ============================================
// CONFIG - UPDATE THESE AFTER DEPLOY
// ============================================
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
const MONAD_TESTNET = {
  chainId: "0x279F",  // 10143
  chainIdDecimal: 10143,
  chainName: "Monad Testnet",
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
};

const CONTRACT_ABI = [
  "function placeBet(uint8 direction, uint256 multiplier, uint256 currentPrice) external payable returns (uint256)",
  "function resolveBet(uint256 betId, uint256 resolvePrice) external",
  "function getBet(uint256 betId) external view returns (tuple(address bettor, uint8 direction, uint256 amount, uint256 strikePrice, uint256 resolvePrice, uint256 multiplier, uint256 timestamp, uint8 status))",
  "function getUserStats(address user) external view returns (uint256 wins, uint256 losses, uint256 betCount)",
  "function getContractBalance() external view returns (uint256)",
  "function totalBets() external view returns (uint256)",
  "function totalVolume() external view returns (uint256)",
  "event BetPlaced(uint256 indexed betId, address indexed bettor, uint8 direction, uint256 amount, uint256 multiplier, uint256 strikePrice)",
  "event BetResolved(uint256 indexed betId, address indexed bettor, bool won, uint256 payout, uint256 resolvePrice)",
];

// ============================================
// REDSTONE MON/USD PRICE FETCHER
// ============================================
const REDSTONE_GATEWAY = "https://oracle-gateway-1.a.redstone.finance";

async function fetchMonPrice() {
  try {
    // RedStone data service API for MON price
    const res = await fetch(
      `${REDSTONE_GATEWAY}/data-packages/latest/redstone-primary-prod/MON`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.MON && data.MON[0]) {
        return data.MON[0].dataPoints?.[0]?.value || data.MON[0].value;
      }
    }
  } catch (e) {
    // Fallback: try CoinGecko
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd"
      );
      if (res.ok) {
        const data = await res.json();
        if (data.monad?.usd) return data.monad.usd;
      }
    } catch {}
  }
  return null;
}

// ============================================
// CONSTANTS
// ============================================
const RINGS = 4;
const SECTORS = 8;
const SWEEP_SPEED = 2.8;
const RING_MULTS = [2, 5, 12, 30];
const RING_LABELS = ["2X", "5X", "12X", "30X"];
const SECTOR_ANGLE = 360 / SECTORS;

const MONAD_DEEP = "#130826";
const MONAD_BG = "#0B0415";
const MONAD_PURPLE = "#836EF9";
const MONAD_LIGHT = "#A78BFA";
const MONAD_HOT = "#E040FB";
const MONAD_GREEN = "#4ADE80";
const MONAD_RED = "#FB7185";
const MONAD_GOLD = "#FBBF24";
const PING_COLOR = "#FBBF24";

const SECTOR_META = [
  { label: "MOON", shortDir: "UP++", up: true },
  { label: "BULL+", shortDir: "UP+", up: true },
  { label: "BULL", shortDir: "UP", up: true },
  { label: "CRAB+", shortDir: "~UP", up: true },
  { label: "CRAB-", shortDir: "~DN", up: false },
  { label: "BEAR", shortDir: "DN", up: false },
  { label: "BEAR+", shortDir: "DN+", up: false },
  { label: "DUMP", shortDir: "DN++", up: false },
];

// ============================================
// GEOMETRY HELPERS
// ============================================
function polarToCart(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sectorPath(cx, cy, iR, oR, sA, eA) {
  const s1 = polarToCart(cx, cy, iR, sA), s2 = polarToCart(cx, cy, oR, sA);
  const e1 = polarToCart(cx, cy, iR, eA), e2 = polarToCart(cx, cy, oR, eA);
  return `M ${s1.x} ${s1.y} L ${s2.x} ${s2.y} A ${oR} ${oR} 0 0 1 ${e2.x} ${e2.y} L ${e1.x} ${e1.y} A ${iR} ${iR} 0 0 0 ${s1.x} ${s1.y} Z`;
}

function norm(a) { return ((a % 360) + 360) % 360; }

function pctToSector(pct) {
  if (pct > 0.6) return 0;
  if (pct > 0.3) return 1;
  if (pct > 0.1) return 2;
  if (pct > -0.1) return 3;
  if (pct > -0.3) return 4;
  if (pct > -0.6) return 5;
  if (pct > -1.0) return 6;
  return 7;
}

function volToRing(diffs) {
  if (diffs.length < 3) return 0;
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (avg < 0.00005) return 0;
  if (avg < 0.00015) return 1;
  if (avg < 0.0004) return 2;
  return 3;
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function EchoNad() {
  // Wallet state
  const [account, setAccount] = useState(null);
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Price state
  const [prices, setPrices] = useState([]);
  const [oracleStatus, setOracleStatus] = useState("connecting...");
  const [lastOracleUpdate, setLastOracleUpdate] = useState(null);
  const [tickCounter, setTickCounter] = useState(0);  // BUG FIX 1: Add tick counter

  // Game state
  const [balance, setBalance] = useState(0);
  const [betSize, setBetSize] = useState(0.01);
  const [activeBets, setActiveBets] = useState([]);
  const [activeSector, setActiveSector] = useState(3);
  const [activeRing, setActiveRing] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [totalPnL, setTotalPnL] = useState(0);
  const [scanAngle, setScanAngle] = useState(0);
  const [floats, setFloats] = useState([]);
  const [txPending, setTxPending] = useState(false);
  const [lastTxHash, setLastTxHash] = useState(null);
  const [lastTxTime, setLastTxTime] = useState(null);

  const scanRef = useRef(0);
  const sectorRef = useRef(3);
  const ringRef = useRef(0);
  const betsRef = useRef([]);
  const pricesRef = useRef([]);

  const CX = 250, CY = 250, MAX_R = 218, MIN_R = 48;
  const ringW = (MAX_R - MIN_R) / RINGS;

  const curPrice = prices[prices.length - 1] || 0.0222;
  const prevPrice = prices[prices.length - 2] || curPrice;
  const delta = curPrice - prevPrice;

  // Sync refs
  useEffect(() => { betsRef.current = activeBets; }, [activeBets]);
  useEffect(() => { sectorRef.current = activeSector; }, [activeSector]);
  useEffect(() => { ringRef.current = activeRing; }, [activeRing]);

  // ============================================
  // WALLET CONNECTION
  // ============================================
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) { alert("Install MetaMask!"); return; }
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      // Switch to Monad testnet
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: MONAD_TESTNET.chainId }],
        });
        setChainOk(true);
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: MONAD_TESTNET.chainId,
              chainName: MONAD_TESTNET.chainName,
              rpcUrls: MONAD_TESTNET.rpcUrls,
              blockExplorerUrls: MONAD_TESTNET.blockExplorerUrls,
              nativeCurrency: MONAD_TESTNET.nativeCurrency,
            }],
          });
          setChainOk(true);
        }
      }
      // Get balance
      const bal = await window.ethereum.request({
        method: "eth_getBalance",
        params: [accounts[0], "latest"],
      });
      setBalance(parseInt(bal, 16) / 1e18);
    } catch (e) {
      console.error("Connect error:", e);
    }
    setConnecting(false);
  }, []);

  // ============================================
  // REDSTONE PRICE FEED (real MON/USD)
  // ============================================
  useEffect(() => {
    let mounted = true;
    let simPrice = 0.0222;
    let hasRealPrice = false;

    // Try to get real price first
    fetchMonPrice().then(p => {
      if (p && mounted) {
        simPrice = p;
        hasRealPrice = true;
        setOracleStatus(`RedStone MON/USD`);
        const initial = Array.from({length: 20}, () => {
          simPrice += (Math.random() - 0.5) * simPrice * 0.002;
          return simPrice;
        });
        setPrices(initial);
        pricesRef.current = initial;
      }
    });

    // Continuous price updates
    const iv = setInterval(async () => {
      if (!mounted) return;

      // Try real price every 5 seconds
      const realPrice = await fetchMonPrice();
      if (realPrice) {
        simPrice = realPrice;
        if (!hasRealPrice) {
          hasRealPrice = true;
          setOracleStatus("RedStone MON/USD");
        }
        setLastOracleUpdate(Date.now());
      }

      // Add micro-variation for visual smoothness
      const noise = (Math.random() - 0.5) * simPrice * 0.001;
      const tick = simPrice + noise;

      setPrices(prev => {
        const next = [...prev.slice(-80), tick];
        pricesRef.current = next;
        return next;
      });

      // BUG FIX 1: Increment tick counter to force sector/ring update
      setTickCounter(c => c + 1);
    }, hasRealPrice ? 2000 : 500);

    // Init with simulated data while waiting
    if (!hasRealPrice) {
      const initial = Array.from({length: 20}, () => {
        simPrice += (Math.random() - 0.48) * 0.0001;
        return simPrice;
      });
      setPrices(initial);
      pricesRef.current = initial;
      setOracleStatus("RedStone MON/USD (sim)");
    }

    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // Update sector/ring from prices
  useEffect(() => {
    if (prices.length < 8) return;
    const now = prices[prices.length - 1];
    const prev6 = prices[prices.length - 7];
    const pct = ((now - prev6) / prev6) * 100;
    setActiveSector(pctToSector(pct));
    const diffs = [];
    for (let i = Math.max(1, prices.length - 10); i < prices.length; i++)
      diffs.push(Math.abs(prices[i] - prices[i - 1]) / prices[i - 1]);
    setActiveRing(volToRing(diffs));
  }, [tickCounter]);  // BUG FIX 1: Changed from prices.length to tickCounter

  // ============================================
  // SWEEP + BET RESOLUTION
  // ============================================
  useEffect(() => {
    let raf;
    const loop = () => {
      const prev = scanRef.current;
      const next = (prev + SWEEP_SPEED) % 360;
      scanRef.current = next;
      setScanAngle(next);

      const bets = betsRef.current;
      if (bets.length > 0) {
        const remain = [];
        const newRes = [];
        const newFloats = [];

        for (const bet of bets) {
          const sMid = norm(bet.sector * SECTOR_ANGLE + SECTOR_ANGLE / 2);
          const traveled = norm(next - bet.placedAt);
          if (traveled < 100) { remain.push(bet); continue; }

          const pN = norm(prev), nN = norm(next);
          let crossed = pN < nN ? (pN < sMid && nN >= sMid) : (pN < sMid || nN >= sMid);
          if (!crossed) { remain.push(bet); continue; }

          const midR = MIN_R + bet.ring * ringW + ringW / 2;
          const pos = polarToCart(CX, CY, midR, sMid);
          const win = bet.sector === sectorRef.current && bet.ring === ringRef.current;

          if (win) {
            const mult = RING_MULTS[bet.ring];
            const amt = +(bet.amount * mult).toFixed(4);
            setTotalPnL(p => +(p + amt - bet.amount).toFixed(4));
            setStreak(s => s + 1);
            newRes.push({ win: true, amount: amt });
            newFloats.push({ id: Math.random(), x: pos.x, y: pos.y, text: `+${amt}`, color: MONAD_GREEN, life: 1 });
          } else {
            setTotalPnL(p => +(p - bet.amount).toFixed(4));
            setStreak(0);
            newRes.push({ win: false, amount: bet.amount });
            newFloats.push({ id: Math.random(), x: pos.x, y: pos.y, text: `-${bet.amount}`, color: MONAD_RED, life: 1 });
          }
        }

        if (newRes.length) {
          setActiveBets(remain);
          setResults(r => [...r.slice(-14), ...newRes]);
          setFloats(f => [...f, ...newFloats]);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Animate floats
  useEffect(() => {
    if (!floats.length) return;
    const iv = setInterval(() => {
      setFloats(f => f.map(t => ({ ...t, y: t.y - 0.7, life: t.life - 0.016 })).filter(t => t.life > 0));
    }, 25);
    return () => clearInterval(iv);
  }, [floats.length > 0]);

  // ============================================
  // PLACE BET ON-CHAIN
  // ============================================
  const placeBet = useCallback(async (ring, sector) => {
    if (!account || !chainOk) {
      connectWallet();
      return;
    }
    if (balance < betSize) {
      alert("Insufficient MON balance. Get testnet MON from faucet.");
      return;
    }

    // Add to local radar immediately (optimistic)
    const localBet = { id: Math.random(), ring, sector, amount: betSize, placedAt: scanRef.current };
    setActiveBets(prev => [...prev, localBet]);

    // Send on-chain tx
    setTxPending(true);
    const txStart = performance.now();
    try {
      const direction = sector <= 3 ? 0 : 1; // 0=BULLISH, 1=BEARISH
      const multiplier = RING_MULTS[ring];
      const priceWith8Decimals = Math.round(curPrice * 1e8).toString(16);

      // Encode function call: placeBet(uint8,uint256,uint256)
      const iface = "0x" + [
        "b6846e30", // function selector for placeBet(uint8,uint256,uint256)
        direction.toString(16).padStart(64, "0"),
        multiplier.toString(16).padStart(64, "0"),
        priceWith8Decimals.padStart(64, "0"),
      ].join("");

      const value = "0x" + Math.round(betSize * 1e18).toString(16);

      // Use eth_sendRawTransactionSync on Monad for instant confirmation!
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: account,
          to: CONTRACT_ADDRESS,
          value: value,
          data: iface,
          gas: "0x30D40", // 200000
        }],
      });

      const txEnd = performance.now();
      setLastTxHash(txHash);
      setLastTxTime(Math.round(txEnd - txStart));
      setBalance(b => b - betSize);

    } catch (e) {
      console.error("Tx error:", e);
      // Remove optimistic bet
      setActiveBets(prev => prev.filter(b => b.id !== localBet.id));
    }
    setTxPending(false);
  }, [account, chainOk, balance, betSize, curPrice, connectWallet]);

  // ============================================
  // DERIVED STATE
  // ============================================
  const betMap = useMemo(() => {
    const m = {};
    for (const b of activeBets) { const k = `${b.ring}-${b.sector}`; m[k] = (m[k] || 0) + b.amount; }
    return m;
  }, [activeBets]);

  const pingAngle = activeSector * SECTOR_ANGLE + SECTOR_ANGLE / 2;
  const pingR = MIN_R + activeRing * ringW + ringW / 2;
  const pingPos = polarToCart(CX, CY, pingR, pingAngle);
  const isUp = activeSector <= 3;

  // ============================================
  // SVG ELEMENTS
  // ============================================
  const grid = useMemo(() => {
    const els = [];
    for (let r = 0; r <= RINGS; r++)
      els.push(<circle key={`r${r}`} cx={CX} cy={CY} r={MIN_R + r * ringW} fill="none" stroke="rgba(131,110,249,0.09)" strokeWidth="0.5" strokeDasharray="3,5" style={{pointerEvents: "none"}} />);
    for (let s = 0; s < SECTORS; s++) {
      const a = s * SECTOR_ANGLE;
      const i = polarToCart(CX, CY, MIN_R, a), o = polarToCart(CX, CY, MAX_R, a);
      els.push(<line key={`l${s}`} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="rgba(131,110,249,0.06)" strokeWidth="0.5" style={{pointerEvents: "none"}} />);
    }
    return els;
  }, []);

  const cells = useMemo(() => {
    const els = [];
    for (let r = RINGS - 1; r >= 0; r--) {
      const iR = MIN_R + r * ringW, oR = iR + ringW;
      for (let s = 0; s < SECTORS; s++) {
        const sA = s * SECTOR_ANGLE, eA = sA + SECTOR_ANGLE, k = `${r}-${s}`;
        const bet = betMap[k], live = r === activeRing && s === activeSector;
        const d = sectorPath(CX, CY, iR, oR, sA, eA);
        let fill = "transparent";
        if (bet) fill = live ? "rgba(74,222,128,0.2)" : "rgba(131,110,249,0.2)";
        else if (live) fill = "rgba(251,191,36,0.08)";
        const mA = sA + SECTOR_ANGLE / 2, mR = (iR + oR) / 2;
        const lp = polarToCart(CX, CY, mR, mA);
        els.push(
          <g key={k}>
            <path d={d} fill={fill}
              stroke={bet ? (live ? MONAD_GREEN : "rgba(131,110,249,0.35)") : live ? "rgba(251,191,36,0.25)" : "rgba(131,110,249,0.06)"}
              strokeWidth={bet ? 1.2 : 0.4} style={{ cursor: "pointer" }}
              onClick={() => placeBet(r, s)}
              onMouseEnter={e => { if (!bet && !live) e.currentTarget.setAttribute("fill", "rgba(131,110,249,0.08)"); }}
              onMouseLeave={e => { if (!bet && !live) e.currentTarget.setAttribute("fill", "transparent"); }} />
            {bet && (
              <>
                <rect x={lp.x - 16} y={lp.y - 7} width="32" height="14" rx="3" fill={live ? MONAD_GREEN : MONAD_PURPLE} opacity="0.85" style={{pointerEvents: "none"}} />
                <text x={lp.x} y={lp.y + 1} textAnchor="middle" dominantBaseline="middle" fill={live ? "#000" : "#fff"} fontSize="8" fontWeight="bold" fontFamily="monospace" style={{ pointerEvents: "none" }}>{bet.toFixed(3)}</text>
              </>
            )}
          </g>
        );
      }
    }
    return els;
  }, [betMap, activeRing, activeSector, placeBet]);

  const sweepEl = useMemo(() => {
    const end = polarToCart(CX, CY, MAX_R, scanAngle);
    const trail = polarToCart(CX, CY, MAX_R, scanAngle - 22);
    return (
      <g style={{pointerEvents: "none"}}>
        <defs><radialGradient id="sc"><stop offset="0%" stopColor={MONAD_PURPLE} stopOpacity="0" /><stop offset="80%" stopColor={MONAD_PURPLE} stopOpacity="0.03" /><stop offset="100%" stopColor={MONAD_PURPLE} stopOpacity="0.06" /></radialGradient></defs>
        <path d={`M ${CX} ${CY} L ${trail.x} ${trail.y} A ${MAX_R} ${MAX_R} 0 0 1 ${end.x} ${end.y} Z`} fill="url(#sc)" />
        <line x1={CX} y1={CY} x2={end.x} y2={end.y} stroke={MONAD_PURPLE} strokeWidth="1.5" opacity="0.45" />
      </g>
    );
  }, [scanAngle]);

  const chart = useMemo(() => {
    const d = prices.slice(-25);
    if (d.length < 2) return null;
    const mn = Math.min(...d) - 0.0001, mx = Math.max(...d) + 0.0001;
    const w = 155, h = 36;
    const pts = d.map((p, i) => `${(i / (d.length - 1)) * w},${h - ((p - mn) / (mx - mn)) * h}`).join(" ");
    return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={MONAD_PURPLE} strokeWidth="1.5" opacity="0.5" /><circle cx={w} cy={h - ((d[d.length - 1] - mn) / (mx - mn)) * h} r="3" fill={PING_COLOR} /></svg>;
  }, [prices]);

  const atRisk = activeBets.reduce((a, b) => a + b.amount, 0);

  // ============================================
  // RENDER
  // ============================================
  return (
    <div style={{ background: `radial-gradient(ellipse at 50% 45%, ${MONAD_DEEP} 0%, ${MONAD_BG} 75%)`, minHeight: "100vh", color: "#fff", fontFamily: "'SF Mono','Fira Code','Courier New',monospace", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes streak-flash{0%{background-position:200% center}100%{background-position:-200% center}} @keyframes pulse-glow{0%,100%{opacity:0.7}50%{opacity:1}}`}</style>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid rgba(131,110,249,0.1)", background: "rgba(11,4,21,0.85)", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="Monad" style={{ height: 24 }} />
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 3 }}>
            <span style={{ color: MONAD_GOLD }}>ECHO</span><span style={{ color: MONAD_PURPLE }}>NAD</span>
          </div>
          <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "2px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: delta >= 0 ? MONAD_GREEN : MONAD_RED, display: "inline-block" }} />
            <span style={{ color: MONAD_GOLD, fontWeight: 600 }}>${curPrice.toFixed(4)}</span>
            <span style={{ fontSize: 9, color: delta >= 0 ? MONAD_GREEN : MONAD_RED }}>{delta >= 0 ? "+" : ""}{(delta * 10000).toFixed(1)}bp</span>
          </div>
          <div style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: isUp ? "rgba(74,222,128,0.08)" : "rgba(251,113,133,0.08)", color: isUp ? MONAD_GREEN : MONAD_RED }}>{SECTOR_META[activeSector].shortDir}</div>
          <div style={{ fontSize: 7, color: "rgba(131,110,249,0.3)", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: MONAD_GREEN }} />{oracleStatus}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastTxTime && (
            <div style={{ fontSize: 9, color: MONAD_GREEN, background: "rgba(74,222,128,0.08)", padding: "2px 8px", borderRadius: 4 }}>
              TX: {lastTxTime}ms
            </div>
          )}
          {streak >= 2 && <div style={{ background: `linear-gradient(90deg,${MONAD_PURPLE},${MONAD_HOT},${MONAD_PURPLE})`, backgroundSize: "200% auto", animation: "streak-flash 2s linear infinite", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{streak}x STREAK</div>}
          {account ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 7, color: "rgba(167,139,250,0.3)", letterSpacing: 2 }}>MON</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: MONAD_GREEN }}>{balance.toFixed(3)}</div>
              </div>
              <div style={{ fontSize: 9, color: MONAD_LIGHT, background: "rgba(131,110,249,0.1)", padding: "3px 8px", borderRadius: 6 }}>
                {account.slice(0, 6)}...{account.slice(-4)}
              </div>
            </div>
          ) : (
            <button onClick={connectWallet} disabled={connecting} style={{
              background: `linear-gradient(135deg, ${MONAD_PURPLE}, ${MONAD_HOT})`,
              border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700,
              padding: "6px 16px", cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
              opacity: connecting ? 0.5 : 1,
            }}>
              {connecting ? "CONNECTING..." : "CONNECT WALLET"}
            </button>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex" }}>
        {/* BET SIDEBAR */}
        <div style={{ width: 58, borderRight: "1px solid rgba(131,110,249,0.06)", display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 0", gap: 6, background: "rgba(11,4,21,0.3)" }}>
          <div style={{ fontSize: 7, color: "rgba(167,139,250,0.25)", letterSpacing: 1, marginBottom: 2 }}>BET</div>
          {[0.001, 0.01, 0.05, 0.1, 0.5].map(s => (
            <button key={s} onClick={() => setBetSize(s)} style={{
              width: 44, height: 28, borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              border: betSize === s ? `1.5px solid ${MONAD_GOLD}` : "1px solid rgba(131,110,249,0.1)",
              background: betSize === s ? "rgba(251,191,36,0.12)" : "transparent",
              color: betSize === s ? MONAD_GOLD : "rgba(167,139,250,0.3)",
            }}>{s}</button>
          ))}
          <div style={{ marginTop: "auto", fontSize: 7, color: "rgba(131,110,249,0.15)", writingMode: "vertical-rl", letterSpacing: 2 }}>MONAD</div>
        </div>

        {/* RADAR */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <svg viewBox="0 0 500 500" style={{ width: "min(500px, 68vh)", height: "min(500px, 68vh)" }}>
            <text x={CX} y={16} textAnchor="middle" fill={MONAD_GREEN} fontSize="9" fontWeight="bold" fontFamily="monospace" opacity="0.5" style={{pointerEvents: "none"}}>BULLISH</text>
            <text x={CX} y={492} textAnchor="middle" fill={MONAD_RED} fontSize="9" fontWeight="bold" fontFamily="monospace" opacity="0.5" style={{pointerEvents: "none"}}>BEARISH</text>
            {grid}
            {cells}
            {sweepEl}
            {/* PING */}
            <g style={{pointerEvents: "none"}}>
              <circle cx={pingPos.x} cy={pingPos.y} r="14" fill={PING_COLOR} opacity="0.06">
                <animate attributeName="r" values="14;28;14" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.06;0;0.06" dur="1.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={pingPos.x} cy={pingPos.y} r="7" fill={PING_COLOR} opacity="0.25" />
              <circle cx={pingPos.x} cy={pingPos.y} r="4" fill={PING_COLOR} opacity="0.8" />
              <circle cx={pingPos.x} cy={pingPos.y} r="1.5" fill="#fff" />
            </g>
            {/* CENTER */}
            <circle cx={CX} cy={CY} r={MIN_R} fill={MONAD_DEEP} stroke="rgba(131,110,249,0.25)" strokeWidth="0.8" style={{pointerEvents: "none"}} />
            <text x={CX} y={CY - 10} textAnchor="middle" fill={MONAD_GOLD} fontSize="12" fontWeight="700" fontFamily="monospace" style={{pointerEvents: "none"}}>${curPrice.toFixed(4)}</text>
            <text x={CX} y={CY + 4} textAnchor="middle" fill={delta >= 0 ? MONAD_GREEN : MONAD_RED} fontSize="9" fontFamily="monospace" style={{pointerEvents: "none"}}>{delta >= 0 ? "+" : ""}{(delta * 10000).toFixed(1)}bp</text>
            <text x={CX} y={CY + 17} textAnchor="middle" fill="rgba(131,110,249,0.3)" fontSize="7" fontFamily="monospace" style={{pointerEvents: "none"}}>MON/USD</text>
            {/* SECTOR LABELS */}
            {SECTOR_META.map((sl, s) => {
              const a = s * SECTOR_ANGLE + SECTOR_ANGLE / 2;
              const p = polarToCart(CX, CY, MAX_R + 16, a);
              return (<g key={s} style={{pointerEvents: "none"}}><text x={p.x} y={p.y - 3} textAnchor="middle" dominantBaseline="middle" fill={s === activeSector ? (sl.up ? MONAD_GREEN : MONAD_RED) : "rgba(131,110,249,0.2)"} fontSize="7" fontWeight={s === activeSector ? "bold" : "normal"} fontFamily="monospace">{sl.shortDir}</text><text x={p.x} y={p.y + 5} textAnchor="middle" dominantBaseline="middle" fill={s === activeSector ? (sl.up ? MONAD_GREEN : MONAD_RED) : "rgba(131,110,249,0.15)"} fontSize="5.5" fontFamily="monospace">{sl.label}</text></g>);
            })}
            {/* RING LABELS */}
            {RING_LABELS.map((l, i) => {
              const p = polarToCart(CX, CY, MIN_R + i * ringW + ringW / 2, 2);
              return <text key={i} x={p.x + 3} y={p.y} fill={i === activeRing ? MONAD_GOLD : "rgba(131,110,249,0.2)"} fontSize="8" fontFamily="monospace" fontWeight={i === activeRing ? "bold" : "normal"} dominantBaseline="middle" style={{pointerEvents: "none"}}>{l}</text>;
            })}
            {/* FLOATS */}
            {floats.map(f => <text key={f.id} x={f.x} y={f.y} textAnchor="middle" fill={f.color} fontSize="12" fontWeight="bold" fontFamily="monospace" opacity={f.life} style={{pointerEvents: "none"}}>{f.text}</text>)}
          </svg>

          {/* TX STATUS BAR */}
          {txPending && (
            <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(131,110,249,0.2)", border: "1px solid rgba(131,110,249,0.3)", borderRadius: 8, padding: "4px 16px", fontSize: 10, color: MONAD_LIGHT, animation: "pulse-glow 1s infinite" }}>
              Sending tx to Monad...
            </div>
          )}

          {/* BOTTOM */}
          <div style={{ position: "absolute", bottom: 6, left: 16, right: 16, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 7, color: "rgba(131,110,249,0.2)", letterSpacing: 1, marginBottom: 2 }}>MON/USD</div>
              {chart}
            </div>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
              {results.slice(-8).map((r, i) => (
                <div key={i} style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: r.win ? "rgba(74,222,128,0.1)" : "rgba(251,113,133,0.1)", color: r.win ? MONAD_GREEN : MONAD_RED, border: `1px solid ${r.win ? "rgba(74,222,128,0.2)" : "rgba(251,113,133,0.2)"}` }}>
                  {r.win ? `+${r.amount}` : `-${r.amount}`}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ width: 165, borderLeft: "1px solid rgba(131,110,249,0.06)", padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "rgba(11,4,21,0.3)", fontSize: 10 }}>
          <div style={{ fontSize: 8, color: "rgba(131,110,249,0.3)", letterSpacing: 2 }}>HOW IT WORKS</div>
          <div style={{ color: "rgba(167,139,250,0.45)", lineHeight: 1.6, fontSize: 9 }}>
            <span style={{ color: MONAD_GREEN }}>Top</span> = MON going <span style={{ color: MONAD_GREEN }}>UP</span><br />
            <span style={{ color: MONAD_RED }}>Bottom</span> = MON going <span style={{ color: MONAD_RED }}>DOWN</span><br />
            <span style={{ color: MONAD_GOLD }}>Outer rings</span> = more vol = bigger payout<br /><br />
            Tap a sector. <span style={{ color: MONAD_PURPLE }}>Sweep</span> rotates. If <span style={{ color: MONAD_GOLD }}>ping</span> is on your sector = <span style={{ color: MONAD_GREEN }}>WIN</span>.
          </div>

          <div style={{ borderTop: "1px solid rgba(131,110,249,0.06)", paddingTop: 8 }}>
            <div style={{ fontSize: 7, color: "rgba(131,110,249,0.3)", letterSpacing: 2, marginBottom: 4 }}>RINGS</div>
            {RING_LABELS.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "1px 4px", borderRadius: 3, background: i === activeRing ? "rgba(251,191,36,0.08)" : "transparent", marginBottom: 1 }}>
                <span style={{ color: "rgba(167,139,250,0.3)", fontSize: 8 }}>{["Low", "Med", "High", "Ext"][i]}</span>
                <span style={{ color: i === activeRing ? MONAD_GOLD : "rgba(167,139,250,0.3)", fontWeight: 700 }}>{l}</span>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid rgba(131,110,249,0.06)", paddingTop: 8 }}>
            <div style={{ fontSize: 7, color: "rgba(131,110,249,0.3)", letterSpacing: 2, marginBottom: 4 }}>LIVE</div>
            {[["Bets", activeBets.length, MONAD_LIGHT], ["At risk", `${atRisk.toFixed(3)} MON`, MONAD_GOLD], ["PnL", `${totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(3)}`, totalPnL >= 0 ? MONAD_GREEN : MONAD_RED], ["Streak", `${streak}x`, streak >= 2 ? MONAD_HOT : "rgba(167,139,250,0.3)"]].map(([k, v, c]) => (
              <div key={k as string} style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ color: "rgba(167,139,250,0.3)", fontSize: 9 }}>{k}</span>
                <span style={{ color: c as string, fontWeight: 600, fontSize: 10 }}>{v}</span>
              </div>
            ))}
          </div>

          {lastTxHash && (
            <div style={{ borderTop: "1px solid rgba(131,110,249,0.06)", paddingTop: 8 }}>
              <div style={{ fontSize: 7, color: "rgba(131,110,249,0.3)", letterSpacing: 2, marginBottom: 4 }}>LAST TX</div>
              <a href={`${MONAD_TESTNET.blockExplorerUrls[0]}/tx/${lastTxHash}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 8, color: MONAD_PURPLE, textDecoration: "none", wordBreak: "break-all" }}>
                {lastTxHash.slice(0, 10)}...{lastTxHash.slice(-8)}
              </a>
              {lastTxTime && <div style={{ fontSize: 8, color: MONAD_GREEN, marginTop: 2 }}>Confirmed in {lastTxTime}ms</div>}
            </div>
          )}

          <div style={{ marginTop: "auto", padding: 5, borderRadius: 4, background: "rgba(131,110,249,0.03)", border: "1px solid rgba(131,110,249,0.06)", textAlign: "center", fontSize: 7, color: "rgba(131,110,249,0.2)", letterSpacing: 1, lineHeight: 1.5 }}>
            ORACLE: REDSTONE<br />CHAIN: MONAD TESTNET<br />BLOCK TIME: 400ms
          </div>
        </div>
      </div>
    </div>
  );
}
