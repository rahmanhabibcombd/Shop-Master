import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pill, 
  Search, 
  Plus, 
  Trash, 
  Edit3, 
  Calendar, 
  AlertOctagon, 
  BadgeCheck, 
  Sparkles, 
  Layers, 
  ShieldAlert, 
  ChevronRight, 
  RefreshCw, 
  Filter, 
  FileSpreadsheet, 
  AlertTriangle 
} from 'lucide-react';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

interface Product {
  id: string;
  serialNumber: number;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  unit: 'kg' | 'unit' | 'dozen' | 'hali';
  barcode: string;
  expiryDate?: string;
  location?: string;
  department?: string;
  warehouse?: string;
  company?: string;
  brand?: string;
  damaged?: number;
  imageUrl?: string;
  warranty?: string;
  
  // Pharmacy/Medicine extensions
  genericName?: string;
  batchNumber?: string;
  drugType?: 'Tablet' | 'Syrup' | 'Capsule' | 'Drop' | 'Injection' | 'Ointment' | 'Inhaler' | 'Other';
  stripSize?: number; // tablets/capsules per strip
}

interface PharmacyModuleViewProps {
  products: Product[];
  onAddProduct: (newProduct: Partial<Product>) => Promise<string | undefined>;
  settings: any;
  user: any;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' }) => void;
}

export function PharmacyModuleView({ 
  products, 
  onAddProduct, 
  settings, 
  user, 
  setNotification 
}: PharmacyModuleViewProps) {
  const isBn = settings?.systemLanguage === 'bn';
  const currencySymbol = settings?.currency || '৳';

  // State Management
  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'expiry_alarm' | 'batch_tracker'>('inventory');
  const [searchText, setSearchText] = useState('');
  const [selectedGenericDetails, setSelectedGenericDetails] = useState<string | null>(null);

  // Form states for Add/Edit Medicine
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Product | null>(null);

  const [medName, setMedName] = useState('');
  const [medGeneric, setMedGeneric] = useState('');
  const [medBatch, setMedBatch] = useState('');
  const [medExpiry, setMedExpiry] = useState('');
  const [medType, setMedType] = useState<Product['drugType']>('Tablet');
  const [medCost, setMedCost] = useState('');
  const [medPrice, setMedPrice] = useState('');
  const [medStock, setMedStock] = useState('');
  const [medBarcode, setMedBarcode] = useState('');
  const [medCompany, setMedCompany] = useState('');
  const [medStripSize, setMedStripSize] = useState('10');

  // Filter pharmacy categories
  const pharmacyProducts = useMemo(() => {
    return products.filter(p => 
      p.category === 'Medicine' || 
      p.category === 'Pharmacy' || 
      p.category === 'ওষুধ' || 
      !!p.genericName || 
      !!p.batchNumber || 
      !!p.drugType
    );
  }, [products]);

  // Search filter
  const filteredProducts = useMemo(() => {
    const term = searchText.toLowerCase().trim();
    if (!term) return pharmacyProducts;
    return pharmacyProducts.filter(p => 
      p.name.toLowerCase().includes(term) ||
      (p.genericName && p.genericName.toLowerCase().includes(term)) ||
      (p.batchNumber && p.batchNumber.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.includes(term)) ||
      (p.company && p.company.toLowerCase().includes(term))
    );
  }, [pharmacyProducts, searchText]);

  // Find Alternative Medicines containing the same Generic name
  const alternativeProductsMap = useMemo(() => {
    const map: Record<string, Product[]> = {};
    pharmacyProducts.forEach(p => {
      if (p.genericName) {
        const genNormalized = p.genericName.toLowerCase().trim();
        if (!map[genNormalized]) {
          map[genNormalized] = [];
        }
        map[genNormalized].push(p);
      }
    });
    return map;
  }, [pharmacyProducts]);

  // Expiry Calculations
  const expiryStatuses = useMemo(() => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const expired: Product[] = [];
    const nearExpiry: Product[] = [];
    const healthy: Product[] = [];

    pharmacyProducts.forEach(p => {
      if (!p.expiryDate) return;
      const expDate = new Date(p.expiryDate);
      if (isNaN(expDate.getTime())) return;

      if (expDate <= now) {
        expired.push(p);
      } else if (expDate <= thirtyDaysFromNow) {
        nearExpiry.push(p);
      } else {
        healthy.push(p);
      }
    });

    return { expired, nearExpiry, healthy };
  }, [pharmacyProducts]);

  // Critical Stock List
  const criticalStockList = useMemo(() => {
    return pharmacyProducts.filter(p => p.stock <= 5);
  }, [pharmacyProducts]);

  // Reset form helper
  const resetForm = () => {
    setMedName('');
    setMedGeneric('');
    setMedBatch('');
    setMedExpiry('');
    setMedType('Tablet');
    setMedCost('');
    setMedPrice('');
    setMedStock('');
    setMedBarcode('');
    setMedCompany('');
    setMedStripSize('10');
    setEditingMedicine(null);
    setIsFormOpen(false);
  };

  // Open Form to Edit
  const handleEditClick = (med: Product) => {
    setEditingMedicine(med);
    setMedName(med.name);
    setMedGeneric(med.genericName || '');
    setMedBatch(med.batchNumber || '');
    setMedExpiry(med.expiryDate || '');
    setMedType(med.drugType || 'Tablet');
    setMedCost(med.cost ? med.cost.toString() : '');
    setMedPrice(med.price ? med.price.toString() : '');
    setMedStock(med.stock ? med.stock.toString() : '');
    setMedBarcode(med.barcode || '');
    setMedCompany(med.company || '');
    setMedStripSize(med.stripSize ? med.stripSize.toString() : '10');
    setIsFormOpen(true);
  };

  // Save / Update Medicine
  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medName.trim()) {
      setNotification({ message: isBn ? "ওষুধের নাম অবশ্যই দিতে হবে" : "Medicine Name is required", type: 'error' });
      return;
    }

    const payload: Partial<Product> = {
      name: medName.trim(),
      genericName: medGeneric.trim() || undefined,
      batchNumber: medBatch.trim() || undefined,
      expiryDate: medExpiry || undefined,
      drugType: medType,
      category: 'Medicine',
      cost: Number(medCost) || 0,
      price: Number(medPrice) || 0,
      stock: Number(medStock) || 0,
      unit: 'unit',
      barcode: medBarcode.trim() || `MED-${Date.now()}`,
      company: medCompany.trim() || undefined,
      stripSize: Number(medStripSize) || 10
    };

    try {
      if (editingMedicine) {
        await updateDoc(doc(db, 'products', editingMedicine.id), payload);
        setNotification({ 
          message: isBn ? "ওষুধের তথ্য সফলভাবে আপডেট হয়েছে" : "Medicine updated successfully", 
          type: 'success' 
        });
      } else {
        await onAddProduct(payload);
        setNotification({ 
          message: isBn ? "নতুন ওষুধ সফলভাবে যুক্ত হয়েছে" : "Medicine registered successfully", 
          type: 'success' 
        });
      }
      resetForm();
    } catch (err: any) {
      setNotification({ message: err.message || "Failed to save medicine", type: 'error' });
    }
  };

  // Unit Conversion Calculator helper
  const [conversionType, setConversionType] = useState<'strip_to_unit' | 'unit_to_strip'>('strip_to_unit');
  const [calcStrips, setCalcStrips] = useState('1');
  const [calcStripSize, setCalcStripSize] = useState('10');
  const [calcResult, setCalcResult] = useState<number | null>(null);

  const calculateConversion = () => {
    const strips = parseFloat(calcStrips) || 0;
    const size = parseFloat(calcStripSize) || 10;
    if (conversionType === 'strip_to_unit') {
      setCalcResult(strips * size);
    } else {
      setCalcResult(strips / size);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Professional Showcase Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 border border-emerald-800/40 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        
        <div className="z-10 space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30 text-emerald-300">
              <Pill className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">
                {isBn ? "স্মার্ট ফার্মেসি ও মেডিসিন ম্যানেজমেন্ট" : "Smart Pharmacy & Medicine Suite"}
              </h1>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">
                Formula Matcher • Expiry Alarm • Batch Regulator
              </span>
            </div>
          </div>
          <p className="text-slate-300 text-xs font-semibold max-w-xl">
            {isBn 
              ? "ওষুধের জেনেরিক নাম দিয়ে বিকল্প ব্র্যান্ড খোঁজা, ব্যাচ ও অত্যন্ত সংবেদনশীল এক্সপায়ারি অ্যালার্ম ট্র্যাকিং এবং ট্যাবলেট স্ট্রিপ-টু-পিস ইউনিট কনভারসন ক্যালকুলেশন ফিচার সম্বলিত প্রফেশনাল ফার্মেসি হাব।"
              : "Locate alternative brands by Generic Formula, track medicine Batch codes, receive real-time Expiry Alarm warnings, and handle modular Strip-to-Unit quantity conversions effortlessly."}
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-950/40 p-1.5 rounded-2xl border border-slate-800/80 self-start md:self-auto overflow-x-auto shrink-0 scrollbar-none z-10">
          {[
            { id: 'inventory', label: isBn ? 'মেডিসিন স্টক' : 'Medicine Catalog', icon: Pill },
            { id: 'expiry_alarm', label: isBn ? 'এক্সপায়ারি অ্যালার্ম' : 'Expiry Alarm', icon: Calendar },
            { id: 'batch_tracker', label: isBn ? 'ব্যাচ ট্র্যাকার' : 'Batch Tracker', icon: Layers },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
                  active 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Critical Status Mini Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Expiring (30 days) Panel */}
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-5 rounded-3xl flex items-center gap-4">
          <div className="p-3.5 bg-red-100 dark:bg-red-950/40 rounded-2xl text-red-600 dark:text-red-400 shrink-0">
            <ShieldAlert className="w-6 h-6 animate-bounce" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-red-500">
              {isBn ? "মেয়াদ উত্তীর্ণ এবং অতি সন্নিকটে" : "Expired / Expiring Soon"}
            </div>
            <div className="text-2xl font-black text-red-900 dark:text-red-200 mt-1">
              {expiryStatuses.expired.length + expiryStatuses.nearExpiry.length} <span className="text-xs font-bold text-red-500">{isBn ? "টি ওষুধ" : "Items"}</span>
            </div>
            <p className="text-[11px] text-red-600/80 font-bold truncate mt-0.5">
              {expiryStatuses.expired.length} expired • {expiryStatuses.nearExpiry.length} expiring within 30 days
            </p>
          </div>
        </div>

        {/* Low Stock Alert Panel */}
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-5 rounded-3xl flex items-center gap-4">
          <div className="p-3.5 bg-amber-100 dark:bg-amber-950/40 rounded-2xl text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-amber-600">
              {isBn ? "ক্রিটিক্যাল স্টক এলার্ট" : "Low Stock Level Warnings"}
            </div>
            <div className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-1">
              {criticalStockList.length} <span className="text-xs font-bold text-amber-600">{isBn ? "টি ওষুধ" : "Items"}</span>
            </div>
            <p className="text-[11px] text-amber-600/80 font-bold mt-0.5">
              {isBn ? "৫ বা তার কম পরিমাণে স্টক অবশিষ্টাংশ রয়েছে।" : "Medicines left with stock level 5 units or below."}
            </p>
          </div>
        </div>

        {/* Unit & Dosage Converter Module */}
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-4 rounded-3xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600">{isBn ? "ইউনিট কনভারশন ক্যালকুলেটর" : "Strip Unit Conversion"}</span>
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600 cursor-pointer hover:rotate-180 transition-transform duration-500" onClick={calculateConversion} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] font-bold text-emerald-800 uppercase block mb-1">{isBn ? "মেডিসিন স্ট্রিপ সংখ্যা" : "Number of Strips"}</label>
              <input
                type="number"
                size={5}
                value={calcStrips}
                onChange={(e) => setCalcStrips(e.target.value)}
                className="w-full text-xs font-bold px-2 py-1 bg-white border border-emerald-100 rounded-lg outline-none text-emerald-900"
              />
            </div>
            <div>
              <label className="text-[8px] font-bold text-emerald-800 uppercase block mb-1">{isBn ? "প্রতি স্ট্রিপে পিস সংখ্যা" : "Pcs / Strip Size"}</label>
              <input
                type="number"
                size={5}
                value={calcStripSize}
                onChange={(e) => setCalcStripSize(e.target.value)}
                className="w-full text-xs font-bold px-2 py-1 bg-white border border-emerald-100 rounded-lg outline-none text-emerald-900"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200/50">
            <span className="font-bold text-emerald-700/90">{isBn ? "মোট মেডিসিন পিস:" : "Total Single Pieces:"}</span>
            <span className="font-mono font-black text-emerald-800 text-sm bg-white px-2 py-0.5 rounded-md border border-emerald-100">
              {(parseFloat(calcStrips) || 0) * (parseFloat(calcStripSize) || 10)} Pcs
            </span>
          </div>
        </div>

      </div>

      {/* Main Tab Views Canvas */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl shadow-sm overflow-hidden">
        
        {/* SUBTAB 1: PHARMACY CATALOG AND SEARCH HUB */}
        {activeSubTab === 'inventory' && (
          <div className="p-6 space-y-6">
            
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={isBn ? "ওষুধের নাম, জেনেরিক বা ব্যাচ দিয়ে খুঁজুন..." : "Search brands, generic formulas or batch..."}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800/80 rounded-2xl outline-none text-xs font-semibold focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div className="flex gap-2.5 w-full md:w-auto">
                <button
                  onClick={() => {
                    resetForm();
                    setIsFormOpen(true);
                  }}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/10 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  {isBn ? "নতুন মেডিসিন যুক্ত করুন" : "Add Medicine / Drug"}
                </button>
              </div>
            </div>

            {/* Alternative Search Warning Indicator */}
            {searchText && (
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/60 dark:border-emerald-900/20 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <Sparkles className="w-4.5 h-4.5 text-emerald-500 animate-spin" />
                  <span>
                    {isBn 
                      ? "জেনেরিক অনুসন্ধান সক্রিয়: টাইপ করা কিওয়ার্ড জেনেরিক ফর্মুলার সাথে মিলিয়ে অল্টারনেটিভ ব্র্যান্ড খুঁজে দিচ্ছে।"
                      : "Generic-match active: Searches map both Brand and Generic Formula to surface alternative options instantly."}
                  </span>
                </div>
                <button 
                  onClick={() => setSearchText('')} 
                  className="text-slate-400 hover:text-slate-600 text-xs font-semibold hover:underline"
                >
                  Clear filter
                </button>
              </div>
            )}

            {/* Form Drawer (Absolute overlays or Inline dynamic card) */}
            <AnimatePresence>
              {isFormOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="p-5 bg-slate-50 dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800 rounded-3xl"
                >
                  <form onSubmit={handleSaveMedicine} className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800 pb-2">
                      <h3 className="font-black text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Pill className="w-4.5 h-4.5 text-emerald-500" />
                        {editingMedicine ? (isBn ? "মেডিসিন এডিট ফরম" : "Modify Registered Medicine") : (isBn ? "নতুন মেডিসিন রেজিস্ট্রেশন" : "Register New Drug Formula")}
                      </h3>
                      <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600 font-extrabold text-xs">Close [X]</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Name */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "ওষুধের নাম (ব্র্যান্ড)" : "Medicine Name (Brand)"} *</label>
                        <input
                          type="text"
                          placeholder="e.g. Napa Extend"
                          value={medName}
                          onChange={(e) => setMedName(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                          required
                        />
                      </div>

                      {/* Generic formula */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "জেনেরিক ফর্মুলা" : "Generic Name (Formula)"}</label>
                        <input
                          type="text"
                          placeholder="e.g. Paracetamol"
                          value={medGeneric}
                          onChange={(e) => setMedGeneric(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>

                      {/* Batch */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "ড্রাগ ব্যাচ নাম্বার" : "Batch Number"}</label>
                        <input
                          type="text"
                          placeholder="e.g. BATCH-202B"
                          value={medBatch}
                          onChange={(e) => setMedBatch(e.target.value)}
                          className="w-full text-xs font-mono font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>

                      {/* Expiry date */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "মেয়াদ উত্তীর্ণের তারিখ" : "Expiration Date"}</label>
                        <input
                          type="date"
                          value={medExpiry}
                          onChange={(e) => setMedExpiry(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Formulation */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "টাইপ / ফর্মুলেশন" : "Drug Formulation Type"}</label>
                        <select
                          value={medType}
                          onChange={(e) => setMedType(e.target.value as any)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        >
                          <option value="Tablet">Tablet (ট্যাবলেট)</option>
                          <option value="Syrup">Syrup (সিরাপ)</option>
                          <option value="Capsule">Capsule (ক্যাপসুল)</option>
                          <option value="Drop">Drop (ড্রপ)</option>
                          <option value="Injection">Injection (ইনজেকশন)</option>
                          <option value="Ointment">Ointment (মলম)</option>
                          <option value="Inhaler">Inhaler (ইনহেলার)</option>
                          <option value="Other">Other (অন্যান্য)</option>
                        </select>
                      </div>

                      {/* Buying Cost */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "কেনা দাম (ক্রয়মূল্য)" : "Purchase Cost"}</label>
                        <input
                          type="number"
                          step="any"
                          value={medCost}
                          onChange={(e) => setMedCost(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>

                      {/* Price */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "বিক্রয় মূল্য" : "Retail Price"}</label>
                        <input
                          type="number"
                          step="any"
                          value={medPrice}
                          onChange={(e) => setMedPrice(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>

                      {/* Stock */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "স্টক পরিমাণ (পিস)" : "Available Stock (Pcs)"}</label>
                        <input
                          type="number"
                          value={medStock}
                          onChange={(e) => setMedStock(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Barcode */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "বারকোড / স্ক্যান কোড" : "Barcode / SKU"}</label>
                        <input
                          type="text"
                          value={medBarcode}
                          onChange={(e) => setMedBarcode(e.target.value)}
                          className="w-full text-xs font-mono font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>

                      {/* Company */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "ফার্মাসিউটিক্যাল কোম্পানি" : "Pharmaceutical mfg"}</label>
                        <input
                          type="text"
                          placeholder="e.g. Square Pharma"
                          value={medCompany}
                          onChange={(e) => setMedCompany(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>

                      {/* Strip Size */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "স্ট্রিপ সাইজ (পিস / স্ট্রিপ)" : "Strip Size (pcs/strip)"}</label>
                        <input
                          type="number"
                          value={medStripSize}
                          onChange={(e) => setMedStripSize(e.target.value)}
                          className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={resetForm}
                        className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl"
                      >
                        {isBn ? "বাতিল" : "Cancel"}
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl transition-all active:scale-95 shadow-md"
                      >
                        {editingMedicine ? (isBn ? "সম্পন্ন করুন" : "Save Changes") : (isBn ? "যুক্ত করুন" : "Add to Catalog")}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Medicine Inventory Grid/Table */}
            <div className="border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-950/20">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ওষুধের নাম ও কোম্পানি" : "Medicine & Brand"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "জেনেরিক ফর্মুলা" : "Generic Name"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ড্রাগ ব্যাচ" : "Drug Batch"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "সংরক্ষিত মেয়াদ" : "Expiry Date"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{isBn ? "টাইপ" : "Form"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{isBn ? "মূল্য" : "Retail Price"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{isBn ? "স্টক (পিস)" : "Stock Balance"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{isBn ? "অ্যাকশন" : "Modify"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredProducts.map(med => {
                    // Check near expiry or expired to paint warning
                    const isExpired = med.expiryDate ? new Date(med.expiryDate) < new Date() : false;
                    const isNearExp = med.expiryDate ? (new Date(med.expiryDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && !isExpired) : false;

                    return (
                      <tr key={med.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors">
                        <td className="p-4">
                          <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{med.name}</div>
                          {med.company && <div className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{med.company}</div>}
                        </td>
                        <td className="p-4">
                          {med.genericName ? (
                            <span 
                              onClick={() => setSelectedGenericDetails(med.genericName || null)}
                              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1 rounded-full cursor-pointer hover:underline inline-flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3" />
                              {med.genericName}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px] italic">Not set</span>
                          )}
                        </td>
                        <td className="p-4 text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
                          {med.batchNumber || 'N/A'}
                        </td>
                        <td className="p-4">
                          {med.expiryDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span className={`text-xs font-mono font-bold ${
                                isExpired ? 'text-rose-600' : isNearExp ? 'text-amber-600' : 'text-slate-600 dark:text-slate-300'
                              }`}>
                                {med.expiryDate}
                              </span>
                              {isExpired && <span className="text-[8px] font-black uppercase bg-rose-100 text-rose-700 px-1 py-0.5 rounded ml-1">{isBn ? "মেয়াদ উত্তীর্ণ" : "Expired"}</span>}
                              {isNearExp && <span className="text-[8px] font-black uppercase bg-amber-100 text-amber-700 px-1 py-0.5 rounded ml-1">{isBn ? "মেয়াদ শেষমুখী" : "Alert"}</span>}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">N/A</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <span className="text-[10px] font-black px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full">
                            {med.drugType || 'Tablet'}
                          </span>
                        </td>
                        <td className="p-4 text-right font-mono font-black text-xs text-slate-800 dark:text-slate-100">
                          {currencySymbol}{med.price}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded-full ${
                            med.stock <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}>
                            {med.stock} Pcs
                          </span>
                          {med.stripSize && med.stock >= med.stripSize && (
                            <div className="text-[9px] text-slate-400 font-bold mt-1">
                              ({Math.floor(med.stock / med.stripSize)} strips + {med.stock % med.stripSize} pcs)
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleEditClick(med)}
                            className="p-1 px-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            {isBn ? "এডিট" : "Edit"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400 text-xs">
                        {isBn ? "কোনো মেডিসিন পাওয়া যায়নি" : "No registered medicines match your search."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Alternating Brand Finder Bottom Dialog */}
            <AnimatePresence>
              {selectedGenericDetails && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-5 bg-emerald-950 text-white rounded-3xl border border-emerald-800 relative shadow-2xl"
                >
                  <div className="absolute top-4 right-4 cursor-pointer text-emerald-400 hover:text-white font-extrabold text-sm" onClick={() => setSelectedGenericDetails(null)}>
                    [X] Dismiss
                  </div>
                  <h3 className="text-base font-black flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    {isBn ? `জেনেরিক সূত্র: "${selectedGenericDetails}" এর বিকল্পসমূহ` : `Alternative Brands for Formula: "${selectedGenericDetails}"`}
                  </h3>
                  <p className="text-xs text-emerald-300 font-semibold mt-1">
                    {isBn 
                      ? "আপনার ইনভেন্টরিতে থাকা চমৎকার কিছু বিকল্প ব্র্যান্ডের ঔষধ নিচে দেওয়া রয়েছে যা একই মেডিকেল সমস্যা সমাধান করে।"
                      : "The following registered brands share this biological ingredient formula and can be served as duplicates/substitutes."}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {(alternativeProductsMap[selectedGenericDetails.toLowerCase().trim()] || []).map(alt => (
                      <div key={alt.id} className="p-3 bg-emerald-900/60 rounded-2xl border border-emerald-800/80 hover:border-emerald-500 transition-all">
                        <div className="font-extrabold text-sm">{alt.name}</div>
                        <div className="text-[10px] text-emerald-300 mt-1 uppercase font-bold">{alt.company || 'Unknown Mfg'}</div>
                        <div className="flex justify-between items-center mt-3 text-xs">
                          <span className="font-bold text-emerald-100">{currencySymbol}{alt.price}</span>
                          <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            alt.stock > 0 ? 'bg-emerald-800 text-emerald-200' : 'bg-rose-900/40 text-rose-300'
                          }`}>
                            Stock: {alt.stock}
                          </span>
                        </div>
                      </div>
                    ))}
                    {(alternativeProductsMap[selectedGenericDetails.toLowerCase().trim()] || []).length <= 1 && (
                      <div className="col-span-3 text-center py-4 text-emerald-400 text-xs italic">
                        {isBn ? "অন্য কোনো বিকল্প ব্র্যান্ডের ওষধ নিবন্ধিত নেই।" : "No additional brand alternatives exist with this generic ingredient formula."}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        )}

        {/* SUBTAB 2: HIGH-ALERT EXPIRY MODULE */}
        {activeSubTab === 'expiry_alarm' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-500" />
                {isBn ? "লাইভ এক্সপায়ারি ও মেয়াদোত্তীর্ণ এলার্ম সিস্টেম" : "Live Expiry Alarm Notification Console"}
              </h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                {isBn 
                  ? "যেসব ওষুধের মেয়াদ সন্নিকটে বা ইতোমধ্যেই শেষ হয়ে গেছে সেগুল বিস্তারিত ব্যাচ সহ লাল ও হলুদ ওয়ার্নিং সিগন্যালে সতর্ক করা হচ্ছে" 
                  : "Review upcoming product closures. Automatically flags medicines whose shelf life is already spent or within 30 days."}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Expired Row (Critical Red) */}
              <div className="space-y-4">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-950/40 rounded-2xl flex items-center justify-between">
                  <span className="text-xs font-black text-rose-600 uppercase tracking-wider flex items-center gap-1.5 text-center">
                    <span className="w-2.5 h-2.5 bg-rose-600 rounded-full animate-ping"></span>
                    {isBn ? "ইতিমধ্যে মেয়াদোত্তীর্ণ ওষুধ সমূহ" : "Already Expired Drugs"}
                  </span>
                  <span className="text-xs font-black px-2.5 py-1 bg-rose-200 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400 rounded-lg">
                    {expiryStatuses.expired.length}
                  </span>
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                  {expiryStatuses.expired.map(xp => (
                    <div key={xp.id} className="p-4 bg-white dark:bg-slate-900 border-2 border-rose-100 dark:border-rose-950 rounded-2xl flex items-center justify-between shadow-sm">
                      <div>
                        <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{xp.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold mt-1">Batch: <span className="font-mono text-slate-700 dark:text-slate-200 font-extrabold">{xp.batchNumber || 'N/A'}</span></div>
                        <div className="text-[10px] text-rose-600 font-black mt-0.5">Expired on: {xp.expiryDate}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] block font-extrabold text-slate-400 uppercase tracking-widest">Wasted stock</span>
                        <span className="text-sm font-black text-rose-600 font-mono">{xp.stock} Pcs</span>
                      </div>
                    </div>
                  ))}
                  {expiryStatuses.expired.length === 0 && (
                    <div className="p-8 border border-dashed border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400 italic rounded-2xl">
                      {isBn ? "কোনো মেয়াদোত্তীর্ণ ওষুধ নেই।" : "Hooray! No expired medicines recorded."}
                    </div>
                  )}
                </div>
              </div>

              {/* Expiring (Critical Orange 30 days) */}
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-950/40 rounded-2xl flex items-center justify-between">
                  <span className="text-xs font-black text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"></span>
                    {isBn ? "মেয়াদ শেষমুখী ওষুধ সমূহ (৩০ দিনের মধ্যে)" : "Expiring Within 30 Days"}
                  </span>
                  <span className="text-xs font-black px-2.5 py-1 bg-amber-200 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 rounded-lg">
                    {expiryStatuses.nearExpiry.length}
                  </span>
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                  {expiryStatuses.nearExpiry.map(xp => {
                    const daysLeft = Math.ceil((new Date(xp.expiryDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={xp.id} className="p-4 bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-950/40 rounded-2xl flex items-center justify-between shadow-sm">
                        <div>
                          <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{xp.name}</div>
                          <div className="text-[10px] text-slate-400 font-bold mt-1">Batch: <span className="font-mono text-slate-700 dark:text-slate-200 font-extrabold">{xp.batchNumber || 'N/A'}</span></div>
                          <div className="text-[10px] text-amber-600 font-black mt-0.5">Expires in: {daysLeft} Days ({xp.expiryDate})</div>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] block font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "আশু স্টক" : "Active Stock"}</span>
                          <span className="text-sm font-black text-slate-800 dark:text-slate-200 font-mono">{xp.stock} Pcs</span>
                        </div>
                      </div>
                    );
                  })}
                  {expiryStatuses.nearExpiry.length === 0 && (
                    <div className="p-8 border border-dashed border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400 italic rounded-2xl">
                      {isBn ? "৩০ দিনের মধ্যে মেয়াদ শেষ হবে এমন কোনো ওষুধ নেই।" : "No items expiring in the next 30 days."}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* SUBTAB 3: DRUG BATCH MOVEMENT & CODES */}
        {activeSubTab === 'batch_tracker' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-500" />
                {isBn ? "ওষুধের ব্যাচ ও কার্টন স্ট্যাটাস ট্র্যাকিং" : "Dynamic Drug Batch / Carton Tracker"}
              </h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                {isBn 
                  ? "ওষুধের ব্যাচ নম্বর অনুযায়ী আলাদা আলাদা ড্রাগ গ্রুপ ট্র্যাক করুন যাতে মেডিকেল কমপ্লায়েন্স এবং ফুড এন্ড ড্রাগ রেগুলেশনস সহজেই মানা যায়।"
                  : "Audit medicinal groups by physical product batch numbers. Easily locate batch IDs and partition carton volumes safely."}
              </p>
            </div>

            <div className="border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ব্যাচ কোড / আইডি" : "Drug Batch ID"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "সংযুক্ত ঔষধের নাম" : "Medicine Drug"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "মেডিকেল ফর্মুলা (জেনেরিক)" : "Generic Formulation"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "প্রস্তুতকারক কোম্পানি" : "Pharmaceutical"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{isBn ? "মেয়াদ উত্তীর্ণ" : "Expiry"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{isBn ? "স্টক লেভেল" : "Carton Stock"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {pharmacyProducts.filter(p => !!p.batchNumber).map(bp => {
                    const expired = bp.expiryDate ? new Date(bp.expiryDate) < new Date() : false;
                    return (
                      <tr key={bp.id} className="hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                        <td className="p-4">
                          <span className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1 rounded-lg border border-emerald-100/50">
                            {bp.batchNumber}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-extrabold text-slate-800 dark:text-slate-100">{bp.name}</td>
                        <td className="p-4 text-xs font-bold text-slate-600 dark:text-slate-400">{bp.genericName || 'N/A'}</td>
                        <td className="p-4 text-xs font-semibold text-slate-500 uppercase">{bp.company || 'N/A'}</td>
                        <td className="p-4 text-center">
                          <span className={`text-xs font-mono font-extrabold ${expired ? 'text-rose-600' : 'text-slate-600 dark:text-slate-300'}`}>
                            {bp.expiryDate || 'N/A'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <span className="text-xs font-black font-mono text-slate-800 dark:text-slate-200">{bp.stock} Pcs</span>
                        </td>
                      </tr>
                    );
                  })}
                  {pharmacyProducts.filter(p => !!p.batchNumber).length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-400 text-xs italic">
                        {isBn ? "কোনো ব্যাচ নম্বর এখনো ট্র্যাকিং এ যোগ করা হয়নি।" : "No batch trackers registered yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
