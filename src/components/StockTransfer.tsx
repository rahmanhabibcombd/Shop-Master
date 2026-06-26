import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, addDoc, onSnapshot, query, where, doc, updateDoc, increment } from '../firebase';
import { ArrowLeftRight, CheckCircle2, AlertTriangle, HelpCircle, Package, Send, Calendar, Users, ClipboardList } from 'lucide-react';

interface StockTransferProps {
  products: any[];
  branches: any[];
  branchStocks: any[];
  user: any;
  shopSettings: any;
  setNotification: (n: { message: string, type: 'success' | 'error' | 'info' }) => void;
  updateBranchStock: (productId: string, branchId: string, quantityChange: number) => Promise<void>;
}

export default function StockTransfer({
  products,
  branches,
  branchStocks,
  user,
  shopSettings,
  setNotification,
  updateBranchStock
}: StockTransferProps) {
  const isBn = shopSettings?.systemLanguage === 'bn';
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [destBranchId, setDestBranchId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter out 'all' option from branches for transfer purposes
  const actualBranches = branches.filter(b => b.id !== 'all');

  // Load stock transfer ledger
  useEffect(() => {
    const shopId = user?.shopId;
    if (!shopId) return;

    const q = query(
      collection(db, 'stock_transfers'),
      where('shopId', '==', shopId)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      // Sort by transferDate desc
      fetched.sort((a: any, b: any) => {
        const tA = a.transferDate ? new Date(a.transferDate).getTime() : 0;
        const tB = b.transferDate ? new Date(b.transferDate).getTime() : 0;
        return tB - tA;
      });
      setTransfers(fetched);
      setLoading(false);
    }, (err) => {
      console.error("Error reading stock transfers:", err);
      setLoading(false);
    });

    return unsub;
  }, [user?.shopId]);

  // Determine current available stock of the selected product at the source branch
  const sourceStock = React.useMemo(() => {
    if (!selectedProductId || !sourceBranchId) return 0;
    const match = branchStocks.find(
      bs => bs.productId === selectedProductId && bs.branchId === sourceBranchId
    );
    return match ? match.quantity : 0;
  }, [selectedProductId, sourceBranchId, branchStocks]);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sourceBranchId || !destBranchId || !selectedProductId) {
      setNotification({
        message: isBn ? 'অনুগ্রহ করে সব তথ্য পূরণ করুন!' : 'Please fill out all required fields!',
        type: 'error'
      });
      return;
    }

    if (sourceBranchId === destBranchId) {
      setNotification({
        message: isBn ? 'উৎস এবং গন্তব্য ব্রাঞ্চ একই হতে পারবে না!' : 'Source and Destination branch cannot be the same!',
        type: 'error'
      });
      return;
    }

    if (quantity <= 0) {
      setNotification({
        message: isBn ? 'স্থানান্তর কোয়ান্টিটি অবশ্যই ০ এর বেশি হতে হবে!' : 'Transfer quantity must be greater than 0!',
        type: 'error'
      });
      return;
    }

    if (quantity > sourceStock) {
      setNotification({
        message: isBn 
          ? `উৎস ব্রাঞ্চে পর্যাপ্ত স্টক নেই! উপলব্ধ স্টক: ${sourceStock}` 
          : `Insufficient stock in source branch! Available stock: ${sourceStock}`,
        type: 'error'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const product = products.find(p => p.id === selectedProductId);
      const sourceBranch = actualBranches.find(b => b.id === sourceBranchId);
      const destBranch = actualBranches.find(b => b.id === destBranchId);

      // 1. Deduct stock from source branch
      await updateBranchStock(selectedProductId, sourceBranchId, -quantity);

      // 2. Add stock to destination branch
      await updateBranchStock(selectedProductId, destBranchId, quantity);

      // 3. Write record to Firestore stock_transfers collection
      const transferRecord = {
        shopId: user.shopId,
        productId: selectedProductId,
        productName: product?.name || 'Unknown Product',
        sourceBranchId,
        sourceBranchName: sourceBranch?.name || 'Source Branch',
        destBranchId,
        destBranchName: destBranch?.name || 'Destination Branch',
        quantity,
        transferDate: new Date().toISOString(),
        remarks: remarks.trim(),
        initiatedBy: user?.name || user?.email || 'Store Admin',
        status: 'completed'
      };

      await addDoc(collection(db, 'stock_transfers'), transferRecord);

      // 4. Create stock records logs for both branches for general stock auditing
      await addDoc(collection(db, 'stockRecords'), {
        shopId: user.shopId,
        branchId: sourceBranchId,
        productId: selectedProductId,
        productName: product?.name || 'Unknown Product',
        quantity: -quantity,
        type: 'adjustment',
        timestamp: new Date().toISOString(),
        note: `Transferred to branch: ${destBranch?.name}`
      });

      await addDoc(collection(db, 'stockRecords'), {
        shopId: user.shopId,
        branchId: destBranchId,
        productId: selectedProductId,
        productName: product?.name || 'Unknown Product',
        quantity: quantity,
        type: 'adjustment',
        timestamp: new Date().toISOString(),
        note: `Transferred from branch: ${sourceBranch?.name}`
      });

      setNotification({
        message: isBn ? 'স্টক সফলভাবে স্থানান্তর করা হয়েছে!' : 'Stock transferred successfully!',
        type: 'success'
      });

      // Reset form fields
      setSelectedProductId('');
      setQuantity(1);
      setRemarks('');
    } catch (err) {
      console.error("Transfer failed:", err);
      setNotification({
        message: isBn ? 'স্টক স্থানান্তরে ব্যর্থ হয়েছে।' : 'Failed to transfer stock.',
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 p-6 bg-slate-50 dark:bg-slate-900/40">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                <ArrowLeftRight className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">
                  {isBn ? 'স্টক ট্রান্সফার লেজার' : 'Stock Transfer Ledger'}
                </h1>
                <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                  {isBn 
                    ? 'এক ব্রাঞ্চ থেকে অন্য ব্রাঞ্চে সহজেই স্টক স্থানান্তর এবং ট্র্যাক করুন' 
                    : 'Easily transfer and track product stock between different branches'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form and info split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Transfer Form Card */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700/60 shadow-sm h-fit">
            <h2 className="text-sm font-black uppercase text-gray-400 tracking-wider mb-5 flex items-center gap-2">
              <Send className="w-4 h-4 text-indigo-500" />
              {isBn ? 'নতুন স্টক ট্রান্সফার' : 'New Stock Transfer'}
            </h2>

            <form onSubmit={handleTransfer} className="space-y-4">
              
              {/* Source Branch Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {isBn ? 'উৎস ব্রাঞ্চ (From)' : 'Source Branch (From)'} <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={sourceBranchId}
                  onChange={(e) => {
                    setSourceBranchId(e.target.value);
                    setSelectedProductId('');
                  }}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700/60 rounded-2xl text-sm font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{isBn ? '-- ব্রাঞ্চ সিলেক্ট করুন --' : '-- Select Source Branch --'}</option>
                  {actualBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Destination Branch Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {isBn ? 'গন্তব্য ব্রাঞ্চ (To)' : 'Destination Branch (To)'} <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={destBranchId}
                  onChange={(e) => setDestBranchId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700/60 rounded-2xl text-sm font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{isBn ? '-- ব্রাঞ্চ সিলেক্ট করুন --' : '-- Select Destination Branch --'}</option>
                  {actualBranches.filter(b => b.id !== sourceBranchId).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Product Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {isBn ? 'প্রোডাক্ট সিলেক্ট করুন' : 'Select Product'} <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  disabled={!sourceBranchId}
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setQuantity(1);
                  }}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-750 disabled:opacity-50 border border-slate-200 dark:border-slate-700/60 rounded-2xl text-sm font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{isBn ? '-- প্রোডাক্ট সিলেক্ট করুন --' : '-- Select Product --'}</option>
                  {products.map(p => {
                    // Check if there is stock in source branch to display nicely
                    const bsMatch = branchStocks.find(bs => bs.productId === p.id && bs.branchId === sourceBranchId);
                    const qtyInSource = bsMatch ? bsMatch.quantity : 0;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {sourceBranchId ? `(${isBn ? 'স্টক' : 'Stock'}: ${qtyInSource})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Stock Available Warning Banner */}
              {selectedProductId && sourceBranchId && (
                <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                  sourceStock > 0 
                    ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30 text-indigo-700 dark:text-indigo-400' 
                    : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30 text-rose-700 dark:text-rose-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">{isBn ? 'উপলব্ধ স্টক:' : 'Available Stock:'}</span>
                  </div>
                  <span className="text-lg font-black">{sourceStock}</span>
                </div>
              )}

              {/* Quantity Input */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {isBn ? 'স্থানান্তর পরিমাণ (Quantity)' : 'Transfer Quantity'} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={sourceStock || 1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                  placeholder="e.g. 10"
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700/60 rounded-2xl text-sm font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Remarks/Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                  {isBn ? 'রিমার্কস / নোট' : 'Remarks / Note'}
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={isBn ? 'স্থানান্তরের কোনো নোট...' : 'Reason or reference note...'}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-750 border border-slate-200 dark:border-slate-700/60 rounded-2xl text-sm font-semibold text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !selectedProductId || sourceStock <= 0}
                className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm tracking-wide shadow-lg shadow-indigo-600/20 dark:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <ArrowLeftRight className="w-4 h-4" />
                {isSubmitting 
                  ? (isBn ? 'স্থানান্তর হচ্ছে...' : 'Transferring...') 
                  : (isBn ? 'স্টক ট্রান্সফার সম্পন্ন করুন' : 'Confirm Stock Transfer')}
              </button>

            </form>
          </div>

          {/* Transfer History/Audits List */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700/60 shadow-sm flex flex-col">
            <h2 className="text-sm font-black uppercase text-gray-400 tracking-wider mb-5 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-emerald-500" />
              {isBn ? 'ট্রান্সফার হিস্ট্রি এবং ট্র্যাকিং' : 'Transfer Ledger & Tracking'}
            </h2>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-400">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm font-medium">{isBn ? 'লোডিং হচ্ছে...' : 'Loading transfer records...'}</p>
              </div>
            ) : transfers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-gray-400 border-2 border-dashed border-gray-100 dark:border-slate-700/60 rounded-3xl">
                <HelpCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-bold uppercase">{isBn ? 'কোনো রেকর্ড পাওয়া যায়নি!' : 'No transfer records found!'}</p>
                <p className="text-xs mt-1 max-w-xs">{isBn ? 'ব্রাঞ্চগুলোর মধ্যে এখনো কোনো পণ্য স্থানান্তর করা হয়নি।' : 'You have not made any internal branch stock transfers yet.'}</p>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto max-h-[500px] custom-scrollbar pr-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-slate-700/50 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                      <th className="py-3 px-2">{isBn ? 'তারিখ' : 'Date'}</th>
                      <th className="py-3 px-2">{isBn ? 'প্রোডাক্ট' : 'Product'}</th>
                      <th className="py-3 px-2 text-center">{isBn ? 'উৎস ব্রাঞ্চ' : 'From'}</th>
                      <th className="py-3 px-2 text-center">{isBn ? 'গন্তব্য ব্রাঞ্চ' : 'To'}</th>
                      <th className="py-3 px-2 text-right">{isBn ? 'পরিমাণ' : 'Qty'}</th>
                      <th className="py-3 px-2 text-center">{isBn ? 'স্ট্যাটাস' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100/50 dark:divide-slate-700/40 text-xs font-semibold text-gray-700 dark:text-slate-200">
                    {transfers.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-4 px-2 whitespace-nowrap text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(item.transferDate).toLocaleDateString(isBn ? 'bn-BD' : 'en-US')}
                          </span>
                        </td>
                        <td className="py-4 px-2">
                          <div>
                            <p className="font-bold text-gray-950 dark:text-slate-100">{item.productName}</p>
                            {item.remarks && <p className="text-[10px] text-indigo-500 font-medium mt-0.5 italic">{item.remarks}</p>}
                          </div>
                        </td>
                        <td className="py-4 px-2 text-center whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-100/45 dark:border-amber-900/30 rounded-lg">
                            {item.sourceBranchName}
                          </span>
                        </td>
                        <td className="py-4 px-2 text-center whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100/45 dark:border-indigo-900/30 rounded-lg">
                            {item.destBranchName}
                          </span>
                        </td>
                        <td className="py-4 px-2 text-right font-black text-sm text-indigo-600 dark:text-indigo-400">
                          {item.quantity}
                        </td>
                        <td className="py-4 px-2 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100/45 dark:border-emerald-900/30 rounded-lg">
                            <CheckCircle2 className="w-3 h-3" />
                            {isBn ? 'সম্পন্ন' : 'Completed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
