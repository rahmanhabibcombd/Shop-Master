import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  UserPlus, 
  Check, 
  Users, 
  Coffee, 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Save,
  UserCheck,
  Building2,
  Lock
} from 'lucide-react';
import { db, collection, addDoc } from '../firebase';

interface Employee {
  id: string;
  name: string;
  designation: string;
  phone: string;
  salary: number;
  status: 'active' | 'inactive';
  shopId?: string;
  branchId?: string;
}

interface TableRoomPageProps {
  settings: any;
  onSaveSettings: (settings: any) => Promise<void>;
  employees: Employee[];
  sales: any[];
  user: any;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' }) => void;
  activeBranchId: string;
  branches: any[];
}

export default function TableRoomPage({
  settings,
  onSaveSettings,
  employees,
  sales,
  user,
  setNotification,
  activeBranchId,
  branches
}: TableRoomPageProps) {
  const isBn = settings.systemLanguage === 'bn';

  // 1. ALL-BRANCH BLOCK: If activeBranchId is 'all', block booking and modification.
  const isAllBranchBlocked = activeBranchId === 'all';

  // 2. Load Branch-bound tables
  const tables = useMemo(() => {
    if (isAllBranchBlocked) return [];
    
    // Check if branch-specific tables exist
    if (settings.branchTables?.[activeBranchId]) {
      return settings.branchTables[activeBranchId] as string[];
    }
    
    // Fallback/Legacy tables
    return settings.tables && settings.tables.length > 0
      ? (settings.tables as string[])
      : ['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Table 7', 'Table 8', 'Table 9', 'Table 10'];
  }, [settings.branchTables, settings.tables, activeBranchId, isAllBranchBlocked]);

  // 3. Load Branch-bound table statuses
  const tableStatuses = useMemo(() => {
    if (isAllBranchBlocked) return {};
    return settings.branchTableStatuses?.[activeBranchId] || settings.tableStatuses || {};
  }, [settings.branchTableStatuses, settings.tableStatuses, activeBranchId, isAllBranchBlocked]);

  // 4. Load Branch-bound table waiters
  const tableWaiters = useMemo(() => {
    if (isAllBranchBlocked) return {};
    return settings.branchTableWaiters?.[activeBranchId] || settings.tableWaiters || {};
  }, [settings.branchTableWaiters, settings.tableWaiters, activeBranchId, isAllBranchBlocked]);

  // 5. Load Branch-bound bookings
  const tableBookings = useMemo(() => {
    if (isAllBranchBlocked) return {};
    return settings.branchTableBookings?.[activeBranchId] || settings.tableBookings || {};
  }, [settings.branchTableBookings, settings.tableBookings, activeBranchId, isAllBranchBlocked]);

  // Busy tables (filtered by active branch sales)
  const busyTables = useMemo(() => {
    if (!sales || isAllBranchBlocked) return [];
    return sales
      .filter(s => s.kitchenStatus && s.kitchenStatus !== 'Served' && s.tableNo && s.branchId === activeBranchId)
      .map(s => s.tableNo) as string[];
  }, [sales, activeBranchId, isAllBranchBlocked]);

  // Filter waiters by the active branch
  const waiters = useMemo(() => {
    return employees.filter(emp => {
      const isWaiter = emp.designation?.toLowerCase() === 'waiter' || emp.designation?.toLowerCase() === 'ওয়েটার';
      if (!isWaiter) return false;
      // Filter waiters assigned to the current active branch
      if (activeBranchId && activeBranchId !== 'all' && emp.branchId && emp.branchId !== activeBranchId) {
        return false;
      }
      return true;
    });
  }, [employees, activeBranchId]);

  // Input states
  const [newTableName, setNewTableName] = useState('');
  const [editingTableIndex, setEditingTableIndex] = useState<number | null>(null);
  const [editingTableName, setEditingTableName] = useState('');

  // Waiter quick add state
  const [newWaiterName, setNewWaiterName] = useState('');
  const [newWaiterPhone, setNewWaiterPhone] = useState('');
  const [isAddingWaiter, setIsAddingWaiter] = useState(false);

  // Table-Waiter assignment selection state
  const [selectedAssignmentWaiterId, setSelectedAssignmentWaiterId] = useState('');
  const [selectedAssignmentTable, setSelectedAssignmentTable] = useState('');

  // Add a new Table
  const handleAddTable = async () => {
    if (isAllBranchBlocked) return;
    if (!newTableName.trim()) {
      setNotification({
        message: isBn ? 'টেবিলের নাম খালি হতে পারে না!' : 'Table name cannot be empty!',
        type: 'error'
      });
      return;
    }
    if (tables.includes(newTableName.trim())) {
      setNotification({
        message: isBn ? 'এই নামের টেবিল ইতিমধ্যে রয়েছে!' : 'Table with this name already exists!',
        type: 'error'
      });
      return;
    }

    const updatedTables = [...tables, newTableName.trim()];
    try {
      const updatedBranchTables = {
        ...(settings.branchTables || {}),
        [activeBranchId]: updatedTables
      };
      await onSaveSettings({
        ...settings,
        branchTables: updatedBranchTables
      });
      setNewTableName('');
      setNotification({
        message: isBn ? 'টেবিল সফলভাবে যুক্ত করা হয়েছে।' : 'Table successfully added.',
        type: 'success'
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error saving settings',
        type: 'error'
      });
    }
  };

  // Start edit table
  const startEditTable = (index: number, name: string) => {
    if (isAllBranchBlocked) return;
    setEditingTableIndex(index);
    setEditingTableName(name);
  };

  // Save edited table
  const handleSaveEditTable = async (index: number) => {
    if (isAllBranchBlocked) return;
    if (!editingTableName.trim()) return;
    const updatedTables = [...tables];
    const oldName = updatedTables[index];
    updatedTables[index] = editingTableName.trim();

    // Preserve status key mapping
    const updatedStatuses = { ...tableStatuses };
    if (updatedStatuses[oldName]) {
      updatedStatuses[editingTableName.trim()] = updatedStatuses[oldName];
      delete updatedStatuses[oldName];
    }

    // Preserve waiter assignment mapping
    const updatedWaiters = { ...tableWaiters };
    if (updatedWaiters[oldName]) {
      updatedWaiters[editingTableName.trim()] = updatedWaiters[oldName];
      delete updatedWaiters[oldName];
    }

    // Preserve bookings
    const updatedBookings = { ...tableBookings };
    if (updatedBookings[oldName]) {
      updatedBookings[editingTableName.trim()] = updatedBookings[oldName];
      delete updatedBookings[oldName];
    }

    try {
      const updatedBranchTables = {
        ...(settings.branchTables || {}),
        [activeBranchId]: updatedTables
      };
      const updatedBranchTableStatuses = {
        ...(settings.branchTableStatuses || {}),
        [activeBranchId]: updatedStatuses
      };
      const updatedBranchTableWaiters = {
        ...(settings.branchTableWaiters || {}),
        [activeBranchId]: updatedWaiters
      };
      const updatedBranchTableBookings = {
        ...(settings.branchTableBookings || {}),
        [activeBranchId]: updatedBookings
      };

      await onSaveSettings({
        ...settings,
        branchTables: updatedBranchTables,
        branchTableStatuses: updatedBranchTableStatuses,
        branchTableWaiters: updatedBranchTableWaiters,
        branchTableBookings: updatedBranchTableBookings
      });
      setEditingTableIndex(null);
      setNotification({
        message: isBn ? 'টেবিলের নাম সফলভাবে পরিবর্তন করা হয়েছে।' : 'Table name successfully updated.',
        type: 'success'
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error updating settings',
        type: 'error'
      });
    }
  };

  // Delete a table
  const handleDeleteTable = async (tableName: string) => {
    if (isAllBranchBlocked) return;
    const updatedTables = tables.filter(t => t !== tableName);
    const updatedStatuses = { ...tableStatuses };
    delete updatedStatuses[tableName];

    const updatedWaiters = { ...tableWaiters };
    delete updatedWaiters[tableName];

    const updatedBookings = { ...tableBookings };
    delete updatedBookings[tableName];

    try {
      const updatedBranchTables = {
        ...(settings.branchTables || {}),
        [activeBranchId]: updatedTables
      };
      const updatedBranchTableStatuses = {
        ...(settings.branchTableStatuses || {}),
        [activeBranchId]: updatedStatuses
      };
      const updatedBranchTableWaiters = {
        ...(settings.branchTableWaiters || {}),
        [activeBranchId]: updatedWaiters
      };
      const updatedBranchTableBookings = {
        ...(settings.branchTableBookings || {}),
        [activeBranchId]: updatedBookings
      };

      await onSaveSettings({
        ...settings,
        branchTables: updatedBranchTables,
        branchTableStatuses: updatedBranchTableStatuses,
        branchTableWaiters: updatedBranchTableWaiters,
        branchTableBookings: updatedBranchTableBookings
      });
      setNotification({
        message: isBn ? 'টেবিল সফলভাবে মুছে ফেলা হয়েছে।' : 'Table successfully deleted.',
        type: 'success'
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error deleting table',
        type: 'error'
      });
    }
  };

  const [bookingModalTable, setBookingModalTable] = useState<string | null>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingName, setBookingName] = useState('');
  const [bookingPhone, setBookingPhone] = useState('');

  // Toggle pre-booked / reserved status
  const handleToggleReserve = async (tableName: string) => {
    if (isAllBranchBlocked) return;
    const currentStatus = tableStatuses[tableName] || 'Available';
    if (currentStatus !== 'Reserved') {
      setBookingModalTable(tableName);
      return;
    }
    
    const updatedStatuses = {
      ...tableStatuses,
      [tableName]: 'Available'
    };

    const updatedBookings = { ...tableBookings };
    delete updatedBookings[tableName];

    try {
      const updatedBranchTableStatuses = {
        ...(settings.branchTableStatuses || {}),
        [activeBranchId]: updatedStatuses
      };
      const updatedBranchTableBookings = {
        ...(settings.branchTableBookings || {}),
        [activeBranchId]: updatedBookings
      };

      await onSaveSettings({
        ...settings,
        branchTableStatuses: updatedBranchTableStatuses,
        branchTableBookings: updatedBranchTableBookings
      });
      setNotification({
        message: isBn 
          ? `টেবিল ফ্রি করা হয়েছে: ${tableName}` 
          : `Table freed: ${tableName}`,
        type: 'success'
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error updating status',
        type: 'error'
      });
    }
  };

  const handleSaveBooking = async () => {
    if (isAllBranchBlocked || !bookingModalTable) return;
    if (!bookingDate || !bookingTime) {
      setNotification({
        message: isBn ? 'বুকিং তারিখ এবং সময় আবশ্যক।' : 'Date and Time are required.',
        type: 'error'
      });
      return;
    }

    const updatedStatuses = {
      ...tableStatuses,
      [bookingModalTable]: 'Reserved'
    };

    const updatedBookings = {
      ...tableBookings,
      [bookingModalTable]: {
        date: bookingDate,
        time: bookingTime,
        name: bookingName,
        phone: bookingPhone
      }
    };

    try {
      const updatedBranchTableStatuses = {
        ...(settings.branchTableStatuses || {}),
        [activeBranchId]: updatedStatuses
      };
      const updatedBranchTableBookings = {
        ...(settings.branchTableBookings || {}),
        [activeBranchId]: updatedBookings
      };

      await onSaveSettings({
        ...settings,
        branchTableStatuses: updatedBranchTableStatuses,
        branchTableBookings: updatedBranchTableBookings
      });
      setNotification({
        message: isBn ? 'টেবিল বুকিং সফল হয়েছে।' : 'Table successfully booked.',
        type: 'success'
      });
      setBookingModalTable(null);
      setBookingDate('');
      setBookingTime('');
      setBookingName('');
      setBookingPhone('');
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error saving booking',
        type: 'error'
      });
    }
  };

  // Add quick waiter bound to this branch
  const handleAddQuickWaiter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAllBranchBlocked) return;
    if (!newWaiterName.trim()) {
      setNotification({
        message: isBn ? 'ওয়েটারের নাম লিখুন!' : 'Please enter waiter name!',
        type: 'error'
      });
      return;
    }

    setIsAddingWaiter(true);
    try {
      await addDoc(collection(db, 'employees'), {
        name: newWaiterName.trim(),
        phone: newWaiterPhone.trim() || 'N/A',
        designation: 'Waiter',
        salary: 0,
        status: 'active',
        shopId: user.shopId,
        branchId: activeBranchId // Lock to active branch!
      });
      setNewWaiterName('');
      setNewWaiterPhone('');
      setNotification({
        message: isBn ? 'নতুন ওয়েটার সফলভাবে যুক্ত করা হয়েছে।' : 'New Waiter successfully added.',
        type: 'success'
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Database error occurred',
        type: 'error'
      });
    } finally {
      setIsAddingWaiter(false);
    }
  };

  // Clear all reservations / status
  const handleClearAllReservations = async () => {
    if (isAllBranchBlocked) return;
    try {
      const updatedBranchTableStatuses = {
        ...(settings.branchTableStatuses || {}),
        [activeBranchId]: {}
      };
      const updatedBranchTableBookings = {
        ...(settings.branchTableBookings || {}),
        [activeBranchId]: {}
      };

      await onSaveSettings({
        ...settings,
        branchTableStatuses: updatedBranchTableStatuses,
        branchTableBookings: updatedBranchTableBookings
      });
      setNotification({
        message: isBn ? 'সকল বুকিং স্ট্যাটাস সফলভাবে ক্লিয়ার করা হয়েছে।' : 'All table bookings cleared.',
        type: 'success'
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error clearing bookings',
        type: 'error'
      });
    }
  };

  // If in all-branch mode, render a highly stylized and helpful lock / branch selection overlay
  if (isAllBranchBlocked) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[70vh] bg-slate-50 dark:bg-slate-900/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-6 shadow-lg shadow-indigo-600/5 animate-pulse">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight mb-2">
          {isBn ? 'অল-ব্রাঞ্চ টেবিল বুকিং ও ম্যানেজমেন্ট লকড' : 'All-Branch Physical Layout Blocked'}
        </h2>
        <p className="text-slate-500 text-xs max-w-md leading-relaxed mb-6">
          {isBn 
            ? 'ফিজিক্যাল অ্যাসেট যেমন টেবিল বা রুম প্রতিটি নির্দিষ্ট শাখার সাথে ওতপ্রোতভাবে জড়িত। টেবিল ম্যানেজমেন্ট করতে অনুগ্রহ করে উপরের ড্রপডাউন থেকে একটি নির্দিষ্ট শাখা নির্বাচন করুন।' 
            : 'Dine-in tables and room physical assets are bound to specific branches. Please choose a specific active branch from the top dropdown selector to manage bookings and physical layout.'}
        </p>
        <div className="flex items-center gap-2 text-[10px] font-black text-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 px-4 py-2 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30 uppercase tracking-widest">
          <Building2 className="w-4 h-4" />
          <span>{isBn ? 'শাখা নির্বাচন আবশ্যক' : 'Select Branch to Continue'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Quick stats */}
      <div className="bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Coffee className="w-5 h-5 text-indigo-600" />
                {isBn ? 'টেবিল ও রুম ম্যানেজমেন্ট ড্যাশবোর্ড' : 'Table & Room Logistics Map'}
              </h1>
              <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 px-2 py-0.5 rounded uppercase tracking-wider">
                {branches?.find(b => b.id === activeBranchId)?.name || 'Active Branch'}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              {isBn 
                ? 'লাইভ টেবিল বুকিং ট্র্যাকিং করুন এবং কোড পরিবর্তন না করেই নতুন টেবিল যুক্ত করুন।' 
                : 'Track real-time checkout activities, toggle table statuses, and add customized floor tables/VIP cabins.'}
            </p>
          </div>
          <button
            onClick={handleClearAllReservations}
            className="self-start md:self-auto px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 dark:text-rose-400 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {isBn ? 'সকল বুকিং ক্লিয়ার করুন' : 'Clear All Bookings'}
          </button>
        </div>

        {/* Status Indicators bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800/50">
          <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 block">
                {isBn ? 'খালি টেবিলে বসা যাবে' : 'Available (FREE)'}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                {tables.filter(t => !busyTables.includes(t) && tableStatuses[t] !== 'Reserved').length} {isBn ? 'টি টেবিল খালি' : 'Tables free'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-rose-500/10 border border-rose-500/25 rounded-2xl">
            <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse" />
            <div>
              <span className="text-xs font-black text-rose-800 dark:text-rose-300 block">
                {isBn ? 'খাবার অর্ডার বা ব্যস্ত টেবিল' : 'Busy (Active Orders)'}
              </span>
              <span className="text-[10px] text-rose-600 dark:text-rose-400">
                {tables.filter(t => busyTables.includes(t)).length} {isBn ? 'টি টেবিল ব্যস্ত' : 'Tables busy'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <div>
              <span className="text-xs font-black text-amber-800 dark:text-amber-300 block">
                {isBn ? 'অগ্রিম বুক করা বা সংরক্ষিত' : 'Reserved / Pre-booked'}
              </span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                {tables.filter(t => !busyTables.includes(t) && tableStatuses[t] === 'Reserved').length} {isBn ? 'টি সংরক্ষিত' : 'Tables reserved'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Tables dynamic list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                {isBn ? 'টেবিল গ্রিড ম্যাপ' : 'Interactive Tables Layout'}
              </h2>
              {/* Inline input to add a new table */}
              <div className="flex gap-2 max-w-sm">
                <input
                  type="text"
                  placeholder={isBn ? 'টেবিলের নাম (যেমন: VIP 3)' : 'Table name (e.g. Table 11)'}
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 placeholder-slate-400 text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddTable}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-xl text-xs font-black flex items-center justify-center transition-all shadow-md shadow-indigo-600/10"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tables Grid Layout */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {tables.map((table, idx) => {
                const isBusy = busyTables.includes(table);
                const isReserved = !isBusy && tableStatuses[table] === 'Reserved';
                const isAvailable = !isBusy && !isReserved;

                return (
                  <div
                    key={table || idx}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-h-[145px] relative group ${
                      isBusy
                        ? 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/10 dark:border-rose-900/40 text-rose-800'
                        : isReserved
                          ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/10 dark:border-amber-900/40 text-amber-800'
                          : 'bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/5 dark:border-emerald-900/30 text-emerald-800'
                    }`}
                  >
                    {/* Top actions/status bar */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${isBusy ? 'bg-rose-500 animate-pulse' : isReserved ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          {isBusy 
                            ? (isBn ? 'ব্যস্ত (Busy)' : 'BUSY') 
                            : isReserved 
                              ? (isBn ? 'সংরক্ষিত (Reserved)' : 'RESERVED') 
                              : (isBn ? 'খালি (Available)' : 'FREE')}
                        </span>
                      </div>
                      
                      {/* Delete table */}
                      <button
                        type="button"
                        onClick={() => handleDeleteTable(table)}
                        className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 p-1 rounded-lg hover:bg-slate-150 dark:hover:bg-slate-800 transition-all"
                        title="Delete Table"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Table Name */}
                    {editingTableIndex === idx ? (
                      <div className="flex gap-1.5 mt-2">
                        <input
                          type="text"
                          value={editingTableName}
                          onChange={(e) => setEditingTableName(e.target.value)}
                          className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs px-2 py-1 rounded-lg border border-slate-300 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveEditTable(idx)}
                          className="bg-emerald-600 text-white p-1 rounded-lg hover:bg-emerald-700"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-col gap-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <h3 className="text-base font-black text-slate-800 dark:text-slate-100 truncate">
                            {table}
                          </h3>
                          {/* Inline rename icon */}
                          <button
                            onClick={() => startEditTable(idx, table)}
                            className="text-slate-400 hover:text-indigo-600 p-0.5 shrink-0"
                            title="Rename Table"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Waiter assigned to this table badge */}
                        {tableWaiters?.[table] && (
                          <div className="flex items-center justify-between bg-indigo-50/70 dark:bg-indigo-950/40 px-2 py-0.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                            <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1 min-w-0">
                              <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="truncate">{tableWaiters[table]}</span>
                            </span>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const updatedWaiters = { ...tableWaiters };
                                delete updatedWaiters[table];
                                
                                const updatedBranchTableWaiters = {
                                  ...(settings.branchTableWaiters || {}),
                                  [activeBranchId]: updatedWaiters
                                };

                                await onSaveSettings({
                                  ...settings,
                                  branchTableWaiters: updatedBranchTableWaiters
                                });
                              }}
                              className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-colors"
                              title="Clear waiter"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Booking Details if Reserved */}
                    {isReserved && tableBookings[table] && (
                      <div className="mt-2 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-900/20 p-1.5 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
                        <div className="flex gap-1 items-center font-bold">
                          🕒 {tableBookings[table].date} | {tableBookings[table].time}
                        </div>
                        {tableBookings[table].name && (
                          <div className="flex gap-1 items-center mt-0.5 truncate">
                            👤 {tableBookings[table].name} {tableBookings[table].phone ? `(${tableBookings[table].phone})` : ''}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer options: Toggle booking status */}
                    <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 block uppercase tracking-wide">
                        {isBusy ? (isBn ? 'অর্ডার চলছে' : 'Order active') : (isBn ? 'বুকিং স্ট্যাটাস টগল' : 'Reserve/Free toggle')}
                      </span>
                      {!isBusy && (
                        <button
                          type="button"
                          onClick={() => handleToggleReserve(table)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                            isReserved
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200'
                          }`}
                        >
                          {isReserved ? (isBn ? 'ফ্রি করুন' : 'FREE TABLE') : (isBn ? 'সংরক্ষিত করুন' : 'RESERVE')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Booking Dialog Modal */}
        {bookingModalTable && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-900/80 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                  {isBn ? `বুকিং: ${bookingModalTable}` : `Book: ${bookingModalTable}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setBookingModalTable(null)}
                  className="text-slate-400 hover:text-rose-500 rounded-lg p-1 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">
                    {isBn ? 'তারিখ *' : 'Date *'}
                  </label>
                  <input
                     type="date"
                     value={bookingDate}
                     onChange={(e) => setBookingDate(e.target.value)}
                     className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">
                    {isBn ? 'সময় *' : 'Time *'}
                  </label>
                  <input
                    type="time"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">
                    {isBn ? 'গ্রাহকের নাম (ঐচ্ছিক)' : 'Customer Name (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={bookingName}
                    onChange={(e) => setBookingName(e.target.value)}
                    placeholder={isBn ? 'কাস্টমারের নাম' : 'Name'}
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-slate-500 mb-1">
                    {isBn ? 'মোবাইল নং (ঐচ্ছিক)' : 'Phone (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={bookingPhone}
                    onChange={(e) => setBookingPhone(e.target.value)}
                    placeholder={isBn ? '০১৭...' : '017...'}
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveBooking}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-2.5 rounded-xl uppercase tracking-wider transition-colors mt-2"
                >
                  {isBn ? 'বুকিং চূড়ান্ত করুন' : 'Confirm Booking'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right Side: Waiter Registry */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6">
            <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              {isBn ? 'ওয়েটার এবং গেস্ট কেয়ার টিম' : 'Waitstaff Registration'}
            </h2>
            <p className="text-slate-500 text-xs mb-6 leading-relaxed">
              {isBn 
                ? 'টেবিলে বা কেবিনে ওয়েটার অ্যাসাইন করুন।'
                : 'Manage waitstaff team and assign them to tables or cabins.'}
            </p>

            {/* Table-Waiter Assignment Module */}
            <div className="mb-6 p-4 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 space-y-4">
              <h3 className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                {isBn ? 'ওয়েটার ও টেবিল অ্যাসাইনমেন্ট' : 'Waiter & Table Assignment'}
              </h3>
              
              <div className="space-y-3">
                {/* Waiter Dropdown */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    {isBn ? '১. ওয়েটার সেট করুন:' : '1. Choose Waiter / Server:'}
                  </label>
                  <select
                    value={selectedAssignmentWaiterId}
                    onChange={(e) => setSelectedAssignmentWaiterId(e.target.value)}
                    className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full font-bold"
                  >
                    <option value="">{isBn ? '-- ওয়েটার নির্বাচন করুন --' : '-- Select Waiter --'}</option>
                    {waiters.map(waiter => (
                      <option key={waiter.id} value={waiter.id}>
                        {waiter.name} {waiter.phone && waiter.phone !== 'N/A' ? `(${waiter.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Table Dropdown */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                    {isBn ? '২. টেবিল সেট করুন:' : '2. Select Table / Cabin:'}
                  </label>
                  <select
                    value={selectedAssignmentTable}
                    onChange={(e) => setSelectedAssignmentTable(e.target.value)}
                    className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full font-bold"
                  >
                    <option value="">{isBn ? '-- টেবিল নির্বাচন করুন --' : '-- Select Table --'}</option>
                    {tables.map(table => (
                      <option key={table} value={table}>
                        {table}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Submit Assignment Button */}
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedAssignmentWaiterId) {
                      setNotification({
                        message: isBn ? 'দয়া করে একজন ওয়েটার সিলেক্ট করুন!' : 'Please select a waiter first!',
                        type: 'error'
                      });
                      return;
                    }
                    if (!selectedAssignmentTable) {
                      setNotification({
                        message: isBn ? 'দয়া করে একটি টেবিল সিলেক্ট করুন!' : 'Please select a table first!',
                        type: 'error'
                      });
                      return;
                    }

                    const selectedWaiterObj = waiters.find(w => w.id === selectedAssignmentWaiterId);
                    if (!selectedWaiterObj) return;

                    const updatedAssignments = {
                      ...tableWaiters,
                      [selectedAssignmentTable]: selectedWaiterObj.name
                    };

                    try {
                      const updatedBranchTableWaiters = {
                        ...(settings.branchTableWaiters || {}),
                        [activeBranchId]: updatedAssignments
                      };

                      await onSaveSettings({
                        ...settings,
                        branchTableWaiters: updatedBranchTableWaiters
                      });
                      setNotification({
                        message: isBn 
                          ? `সফলভাবে ${selectedWaiterObj.name}-কে ${selectedAssignmentTable}-এ অ্যাসাইন করা হয়েছে।` 
                          : `Successfully assigned ${selectedWaiterObj.name} to ${selectedAssignmentTable}.`,
                        type: 'success'
                      });
                      // Reset selections
                      setSelectedAssignmentWaiterId('');
                      setSelectedAssignmentTable('');
                    } catch (err: any) {
                      setNotification({
                        message: err.message || 'Error saving assignment',
                        type: 'error'
                      });
                    }
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-2 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/10"
                >
                  <Check className="w-4 h-4" />
                  {isBn ? 'টেবিলে ওয়েটার অ্যাসাইন করুন' : 'Assign to Selected Table'}
                </button>
              </div>
            </div>

            {/* Waiter List */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {isBn ? 'নিবন্ধিত ওয়েটার সমূহ' : 'Our Active Servers'}
              </h3>
              
              <div className="max-h-[220px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
                {waiters.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs italic bg-slate-50 dark:bg-slate-800/20 rounded-xl">
                    {isBn ? 'কোনো ক্যাটারিং ওয়েটার পাওয়া যায়নি।' : 'No waiters found in records.'}
                  </div>
                ) : (
                  waiters.map(waiter => (
                    <div
                      key={waiter.id}
                      className="flex items-center justify-between p-3 bg-white dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 rounded-xl transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs uppercase shrink-0">
                          {waiter.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 block truncate">{waiter.name}</span>
                          <span className="text-[9px] text-slate-400 block truncate">📞 {waiter.phone || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-wider rounded">
                          {isBn ? 'সক্রিয়' : 'Active'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
