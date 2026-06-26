import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  User, 
  ChefHat, 
  CheckCircle2, 
  Loader2, 
  Check, 
  Bell, 
  Play, 
  UtensilsCrossed,
  Filter,
  Flame,
  CheckCircle,
  Building2,
  Lock,
  AlertTriangle,
  ArrowUpDown,
  Volume2,
  VolumeX
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface CartItemData {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  originalPrice: number;
  cost: number;
  unit?: string;
  foodVariant?: 'Full' | 'Half' | null;
  cookingInstruction?: string | null;
}

interface Sale {
  id: string;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  items: CartItemData[];
  totalAmount: number;
  discount: number;
  taxRate?: number;
  taxAmount?: number;
  finalAmount: number;
  paidAmount: number;
  dueAmount: number;
  previousBalance?: number;
  paymentMethod: string;
  timestamp: any;
  sellerId: string;
  branchId?: string; // Branch binding tag
  tableNo?: string | null;
  waiterId?: string | null;
  waiterName?: string | null;
  kitchenStatus?: 'Pending' | 'Preparing' | 'Ready' | 'Served' | null;
  priority?: 'low' | 'medium' | 'high' | null;
}

export function KitchenDisplay({ 
  sales, 
  setNotification,
  isOnline,
  activeBranchId,
  branches
}: { 
  sales: Sale[], 
  setNotification: (n: any) => void,
  isOnline?: boolean,
  activeBranchId: string,
  branches: any[]
}) {
  const [filter, setFilter] = useState<'All_Active' | 'Pending' | 'Preparing' | 'Ready' | 'Served'>('All_Active');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'priority'>('priority');
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem('kds_chime_muted') === 'true';
    } catch {
      return false;
    }
  });
  const [now, setNow] = useState(new Date());

  const previousOrderIdsRef = useRef<Set<string>>(new Set());
  const isFirstMountRef = useRef(true);

  // Update current time every 1 second to keep waiting timers exact and tick in real-time
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Soft notification chime using Web Audio API
  const playChime = () => {
    if (isMuted) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      // First note: Warm bell ding (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.8);
      
      // Second note: A higher pitch (A5) slightly delayed
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.12);
      gain2.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 1.0);
    } catch (e) {
      console.warn('Web Audio chime playback failed or was blocked by browser autoplay policy:', e);
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => {
      const next = !prev;
      try {
        localStorage.setItem('kds_chime_muted', String(next));
      } catch (err) {
        console.error(err);
      }
      return next;
    });
  };

  // Detect when a new active kitchen order arrives
  useEffect(() => {
    const currentActiveOrders = sales.filter(sale => {
      if (!sale.kitchenStatus || sale.kitchenStatus === 'Served') return false;
      if (activeBranchId && activeBranchId !== 'all' && sale.branchId !== activeBranchId) return false;
      return true;
    });

    const currentActiveIds = new Set(currentActiveOrders.map(sale => sale.id));

    if (isFirstMountRef.current) {
      previousOrderIdsRef.current = currentActiveIds;
      isFirstMountRef.current = false;
      return;
    }

    // Identify if any completely new ticket IDs have appeared
    let hasNewOrder = false;
    for (const id of currentActiveIds) {
      if (!previousOrderIdsRef.current.has(id)) {
        hasNewOrder = true;
        break;
      }
    }

    if (hasNewOrder) {
      playChime();
    }

    previousOrderIdsRef.current = currentActiveIds;
  }, [sales, activeBranchId, isMuted]);

  const getSalePriority = (sale: Sale): 'low' | 'medium' | 'high' => {
    return sale.priority || 'medium';
  };

  const activeChefOrders = useMemo(() => {
    let filtered = sales.filter(sale => {
      // Only include sales that have a designated kitchenStatus
      if (!sale.kitchenStatus) return false;
      
      // Filter by current branch
      if (activeBranchId && activeBranchId !== 'all') {
        if (sale.branchId !== activeBranchId) return false;
      }

      if (filter === 'All_Active') {
        if (sale.kitchenStatus === 'Served') return false;
      } else {
        if (sale.kitchenStatus !== filter) return false;
      }

      // Filter by Priority
      if (priorityFilter !== 'all') {
        if (getSalePriority(sale) !== priorityFilter) return false;
      }

      return true;
    });

    // Sort
    if (sortBy === 'priority') {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      filtered.sort((a, b) => {
        const weightA = priorityWeight[getSalePriority(a)];
        const weightB = priorityWeight[getSalePriority(b)];
        
        if (weightB !== weightA) {
          return weightB - weightA; // High priority first
        }
        
        // Secondary sort: oldest first
        const dateA = a.timestamp ? (typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime()) : 0;
        const dateB = b.timestamp ? (typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime()) : 0;
        return dateA - dateB;
      });
    } else {
      // Sort by time: oldest first (FIFO)
      filtered.sort((a, b) => {
        const dateA = a.timestamp ? (typeof a.timestamp.toDate === 'function' ? a.timestamp.toDate().getTime() : new Date(a.timestamp).getTime()) : 0;
        const dateB = b.timestamp ? (typeof b.timestamp.toDate === 'function' ? b.timestamp.toDate().getTime() : new Date(b.timestamp).getTime()) : 0;
        return dateA - dateB;
      });
    }

    return filtered;
  }, [sales, filter, activeBranchId, priorityFilter, sortBy]);

  const updateOrderPriority = async (saleId: string, priority: 'low' | 'medium' | 'high') => {
    try {
      const saleRef = doc(db, 'sales', saleId);
      await updateDoc(saleRef, { priority });
      setNotification({
        type: 'success',
        message: `⚡ Ticket priority changed to ${priority.toUpperCase()}`
      });
    } catch (e) {
      console.error("Error updating order priority", e);
      setNotification({
        type: 'error',
        message: 'Could not change ticket priority.'
      });
    }
  };

  const updateKitchenStatus = async (saleId: string, newStatus: 'Pending' | 'Preparing' | 'Ready' | 'Served') => {
    try {
      const saleRef = doc(db, 'sales', saleId);
      await updateDoc(saleRef, {
        kitchenStatus: newStatus
      });
      
      let msg = '';
      if (newStatus === 'Preparing') msg = '🍔 Order is now cooking!';
      if (newStatus === 'Ready') msg = '🔔 Order is ready to serve!';
      if (newStatus === 'Served') msg = '✅ Order successfully served and cleared!';

      setNotification({
        type: 'success',
        message: msg
      });
    } catch (e) {
      console.error("Error updating kitchen status", e);
      setNotification({
        type: 'error',
        message: 'Could not update state of cooking ticket.'
      });
    }
  };

  const getElapsedTime = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    let date: Date;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} hr ago`;
  };

  const getElapsedSecondsText = (timestamp: any, isCompleted = false) => {
    if (isCompleted || !timestamp) return '00:00';
    let date: Date;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return '00:00';
    const diffSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(diffSecs / 60);
    const secs = diffSecs % 60;
    
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${pad(mins)}:${pad(secs)}`;
  };

  const getTimerSeverity = (timestamp: any, isCompleted = false) => {
    if (isCompleted || !timestamp) return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 shadow-sm shadow-emerald-100 dark:shadow-none';
    let date: Date;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    const diffMs = now.getTime() - date.getTime();
    const diffMins = diffMs / 60000;

    if (diffMins >= 15) {
      return 'text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 shadow-sm shadow-rose-100 dark:shadow-none animate-pulse font-bold';
    }
    if (diffMins >= 10) {
      return 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 shadow-sm shadow-amber-100 dark:shadow-none font-bold';
    }
    return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 shadow-sm shadow-emerald-100 dark:shadow-none font-bold';
  };

  const getIsDelayed = (timestamp: any) => {
    if (!timestamp) return false;
    let date: Date;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins >= 15;
  };

  // If activeBranchId is 'all', block kitchen display to ensure physical separation is clear
  if (activeBranchId === 'all') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[70vh] bg-slate-50 dark:bg-slate-900/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-6 shadow-lg shadow-indigo-600/5 animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight mb-2">
          KDS (Kitchen Display System) is Blocked in All-Branch Mode
        </h2>
        <p className="text-slate-500 text-xs max-w-md leading-relaxed mb-6">
          Physical layout isolation prevents viewing combined kitchen tasks. Please select a specific active branch from the top dropdown selector to display the live kitchen cooking monitors.
        </p>
        <div className="flex items-center gap-2 text-[10px] font-black text-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 px-4 py-2 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30 uppercase tracking-widest">
          <Building2 className="w-4 h-4" />
          <span>Select Branch to Continue</span>
        </div>
      </div>
    );
  }

  const selectedBranchName = branches?.find(b => b.id === activeBranchId)?.name || 'Selected Branch';

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ChefHat className="w-5 h-5 text-indigo-600" />
              Kitchen Display System (KDS)
            </h1>
            <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 px-2 py-0.5 rounded uppercase tracking-wider">
              {selectedBranchName}
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Real-time live kitchen tickets monitor. Toggle statuses, sort by priority, and monitor active cooking timers.
          </p>
        </div>

        {/* Filters and controls */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Status filters */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Order Status</span>
            <div className="flex flex-wrap gap-1 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
              {(['All_Active', 'Pending', 'Preparing', 'Ready'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    filter === f
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-700/60'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                >
                  {f === 'All_Active' ? 'Active Tasks' : f}
                </button>
              ))}
            </div>
          </div>

          {/* Priority filter */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Priority Filter</span>
            <div className="flex gap-1 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
              {(['all', 'high', 'medium', 'low'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                    priorityFilter === p
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-700/60'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Sorting control */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Sort By</span>
            <div className="flex gap-1 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
              <button
                onClick={() => setSortBy('priority')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                  sortBy === 'priority'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-700/60'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" /> Priority
              </button>
              <button
                onClick={() => setSortBy('time')}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                  sortBy === 'time'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-700/60'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                <Clock className="w-3.5 h-3.5" /> Time
              </button>
            </div>
          </div>

          {/* Mute/Unmute chime toggle */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Chime</span>
            <button
              onClick={toggleMute}
              title={isMuted ? "Unmute new order chimes" : "Mute new order chimes"}
              className={`p-2.5 rounded-xl border transition-all flex items-center justify-center ${
                isMuted
                  ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/20 dark:border-rose-900/30'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-900/30'
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Grid of cards */}
      {activeChefOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800/80 rounded-2xl min-h-[40vh]">
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mb-4">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
            All tickets cleared!
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            No active cooking orders in queue for {selectedBranchName}.
          </p>
        </div>
      ) : (
        <div id="kds-container" className="relative w-full">
          <div className="orders-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {activeChefOrders.map(sale => {
                const isDelayed = getIsDelayed(sale.timestamp);
                const isCompleted = sale.kitchenStatus === 'Served';
                return (
                  <div id="kds-order-card" key={sale.id} className="relative">
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                      className={`order-card-container bg-white dark:bg-slate-900 border rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between transition-all duration-300 ${
                        isDelayed 
                          ? 'border-rose-500/80 shadow-lg ring-2 ring-rose-500/20' 
                          : 'border-slate-100 dark:border-slate-800/80'
                      }`}
                    >
                      {/* Overdue Warning Banner */}
                      {isDelayed && (
                        <div className="bg-rose-500 text-white text-[9px] font-black uppercase tracking-widest py-1.5 px-4 text-center animate-pulse flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>OVERDUE COOKING TICKET (&gt; 15 mins)</span>
                        </div>
                      )}

                      {/* Header card info */}
                  <div>
                    <div className={`p-4 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between ${
                      sale.kitchenStatus === 'Pending'
                        ? 'bg-amber-500/5'
                        : sale.kitchenStatus === 'Preparing'
                          ? 'bg-indigo-500/5'
                          : 'bg-emerald-500/5'
                    }`}>
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-black font-mono tracking-wider text-slate-400 dark:text-slate-500 block uppercase">
                            Ticket #{sale.id.slice(-6).toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                            sale.kitchenStatus === 'Pending'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                              : sale.kitchenStatus === 'Preparing'
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                          }`}>
                            {sale.kitchenStatus}
                          </span>
                        </div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mt-0.5">
                          {sale.tableNo ? (
                            <>🍽️ {sale.tableNo}</>
                          ) : (
                            <>🛍️ Takeaway / Delivery</>
                          )}
                        </h3>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {sale.waiterName && (
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                            <User className="w-2.5 h-2.5 text-slate-500" />
                            <span className="text-[8px] font-bold text-slate-600 dark:text-slate-400 truncate max-w-[80px]">{sale.waiterName}</span>
                          </div>
                        )}

                        {/* Priority Selector */}
                        <select
                          value={getSalePriority(sale)}
                          onChange={(e) => updateOrderPriority(sale.id, e.target.value as 'low' | 'medium' | 'high')}
                          className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border focus:outline-none cursor-pointer transition-all ${
                            getSalePriority(sale) === 'high'
                              ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-400'
                              : getSalePriority(sale) === 'medium'
                                ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400'
                                : 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/30 dark:border-sky-900/40 dark:text-sky-400'
                          }`}
                        >
                          <option value="low">Low Priority</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>

                  {/* Body items lists */}
                  <div className="p-4 space-y-3">
                    {sale.items.map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex gap-2 min-w-0">
                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono leading-none bg-indigo-50 dark:bg-indigo-950/50 w-5 h-5 rounded-lg flex items-center justify-center shrink-0">
                              {item.quantity}
                            </span>
                            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate leading-none">
                              {item.productName}
                              {item.foodVariant && (
                                <span className="text-[10px] font-medium text-slate-400 ml-1">({item.foodVariant})</span>
                              )}
                            </span>
                          </div>
                        </div>

                        {item.cookingInstruction && (
                          <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-100/40 dark:border-red-900/20 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5">
                            <Flame className="w-3 h-3 text-red-500 shrink-0" />
                            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 leading-normal">{item.cookingInstruction}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer and elapsed time */}
                <div>
                  {/* Elapsed Timer and actions */}
                  <div className="p-4 pt-3 border-t border-slate-50 dark:border-slate-800/60 flex items-center justify-between gap-3 bg-slate-50/40 dark:bg-slate-900/40">
                    <div className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1 ${getTimerSeverity(sale.timestamp, isCompleted)}`}>
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black tracking-tight font-mono leading-none">
                        {getElapsedSecondsText(sale.timestamp, isCompleted)}
                      </span>
                    </div>

                    <div className="flex gap-1">
                      {sale.kitchenStatus === 'Pending' && (
                        <button
                          onClick={() => updateKitchenStatus(sale.id, 'Preparing')}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" /> Cook
                        </button>
                      )}
                      
                      {sale.kitchenStatus === 'Preparing' && (
                        <button
                          onClick={() => updateKitchenStatus(sale.id, 'Ready')}
                          className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors"
                        >
                          <Bell className="w-3 h-3" /> Ready
                        </button>
                      )}

                      {sale.kitchenStatus === 'Ready' && (
                        <button
                          onClick={() => updateKitchenStatus(sale.id, 'Served')}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors"
                        >
                          <Check className="w-3 h-3" /> Serve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )})}
        </AnimatePresence>
      </div>
    </div>
      )}
    </div>
  );
}
