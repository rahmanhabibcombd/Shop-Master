import React, { useEffect, useState } from 'react';
import { db, doc, onSnapshot } from '../firebase';
import { ShieldCheck, Printer, AlertCircle, FileText, Calendar, CheckCircle, User, Award, Check } from 'lucide-react';
import { motion } from 'motion/react';

interface DocumentVerificationPageProps {
  docId: string;
}

export function DocumentVerificationPage({ docId }: DocumentVerificationPageProps) {
  const [docData, setDocData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // Realtime fetch from hrm_records
    const docRef = doc(db, 'hrm_records', docId);
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setDocData({ id: snapshot.id, ...snapshot.data() });
        setError(null);
      } else {
        setError('Document not found or verification ID is invalid.');
        setDocData(null);
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Error connecting to verification server.');
      setLoading(false);
    });

    return () => unsub();
  }, [docId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 font-sans p-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mb-4"
        />
        <p className="text-slate-600 text-sm font-semibold">Verifying Document Signature...</p>
      </div>
    );
  }

  if (error || !docData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 font-sans p-6 text-center">
        <div className="bg-white p-8 rounded-3xl border border-red-100 shadow-xl max-w-md w-full space-y-5">
          <div className="mx-auto w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Verification Failed</h3>
            <p className="text-slate-500 text-xs font-semibold mt-2 leading-relaxed">
              {error || 'This document has not been registered or the security hash has been altered.'}
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => window.location.href = window.location.origin}
              className="w-full py-3 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
            >
              Go to Homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Determine Type Labels
  const getDocTypeLabel = (type: string) => {
    switch (type) {
      case 'payslip': return { en: 'Salary Pay Slip', bn: 'বেতন পরিশোধ স্লিপ' };
      case 'noc_visa': return { en: 'NOC for Visa', bn: 'ভিসার অনাপত্তিপত্র (NOC)' };
      case 'noc_bank': return { en: 'NOC for Banking/Loan', bn: 'ব্যাংক লোনের অনাপত্তিপত্র' };
      case 'experience': return { en: 'Job Experience Certificate', bn: 'অভিজ্ঞতা সনদপত্র' };
      case 'contract': return { en: 'Employment Agreement / Contract', bn: 'কর্মসংস্থান চুক্তিপত্র' };
      default: return { en: 'Official Document', bn: 'অফিশিয়াল ডকুমেন্ট' };
    }
  };

  const label = getDocTypeLabel(docData.type);

  return (
    <div className="min-h-screen bg-slate-100 font-sans py-12 px-4 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Secure Ribbon Header */}
        <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-100" />
            <span className="text-xs uppercase font-black tracking-widest text-emerald-100">
              Verified Cloud Document
            </span>
          </div>
          <span className="bg-emerald-700 text-emerald-100 px-2.5 py-1 rounded text-[10px] font-mono tracking-widest font-bold select-all">
            ID: {docData.id.slice(0, 10).toUpperCase()}
          </span>
        </div>

        {/* Audit Receipt Panel */}
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-dashed border-slate-200 pb-5">
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {label.en}
              </h2>
              <p className="text-xs font-bold text-indigo-600 mt-0.5">
                {label.bn}
              </p>
            </div>
            <div className="text-left md:text-right">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">
                Issued On / তারিখ
              </span>
              <span className="text-xs font-mono font-bold text-slate-700">
                {docData.date || docData.createdAt?.slice(0,10)}
              </span>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border">
              <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block mb-1">
                Employee / কর্মচারী
              </span>
              <p className="text-sm font-black text-slate-800 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                {docData.employeeName}
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border">
              <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block mb-1">
                Role / পদবি
              </span>
              <p className="text-sm font-bold text-slate-700 flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-indigo-500" />
                {docData.details?.designation || docData.employeeDesignation || 'Staff'}
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border col-span-2 md:col-span-1">
              <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block mb-1">
                Status / অবস্থা
              </span>
              <p className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Authentic & Active
              </p>
            </div>
          </div>

          {/* Document Content Box */}
          <div className="border rounded-2xl p-6 bg-slate-50/50 space-y-4">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
              <FileText className="w-4 h-4 text-slate-500" />
              Document Verification Summary / সারাংশ
            </h4>
            
            {docData.type === 'payslip' ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between font-semibold border-b pb-1.5">
                  <span className="text-slate-500">Pay Period / মাস:</span>
                  <span className="font-mono text-slate-900 font-bold">{docData.details?.month}</span>
                </div>
                <div className="flex justify-between font-semibold border-b pb-1.5">
                  <span className="text-slate-500">Earnings / উপার্জন:</span>
                  <span className="font-mono text-slate-900 font-bold">{(docData.details?.base + docData.details?.bonus).toLocaleString()}৳</span>
                </div>
                <div className="flex justify-between font-semibold border-b pb-1.5">
                  <span className="text-slate-500">Deductions / কর্তন:</span>
                  <span className="font-mono text-red-650 font-bold">{(docData.details?.payoutDeductions).toLocaleString()}৳</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1 text-slate-950">
                  <span>Net Disbursed / মোট পরিশোধিত:</span>
                  <span className="font-mono text-indigo-650 font-black">{docData.details?.netSalaryPayable?.toLocaleString()}৳</span>
                </div>
                {docData.details?.amountInWordsBn && (
                  <div className="bg-slate-100 p-2.5 rounded-lg text-slate-700 text-[11px] font-medium leading-relaxed">
                    <strong>কথায় (বাংলা):</strong> {docData.details?.amountInWordsBn}
                  </div>
                )}
                {docData.details?.amountInWordsEn && (
                  <div className="bg-slate-100 p-2.5 rounded-lg text-slate-700 text-[11px] font-mono leading-relaxed mt-1">
                    <strong>In Words:</strong> {docData.details?.amountInWordsEn}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed font-sans">
                {docData.type === 'experience' && (
                  <p>
                    This verifies that <strong>{docData.employeeName}</strong> served as a <strong>{docData.details?.designation}</strong>. 
                    Tenure completed on <strong>{docData.details?.leavingDate}</strong>. 
                    Release Reason: {docData.details?.leavingReason}.
                    Appraisal remarks: "{docData.details?.certPraise}"
                  </p>
                )}
                {docData.type === 'contract' && (
                  <p>
                    This verifies the non-disclosure employment agreement for <strong>{docData.employeeName}</strong> as a <strong>{docData.details?.designation}</strong> with a core monthly salary of <strong>{docData.details?.salary?.toLocaleString()}৳</strong> and working schedule of {docData.details?.schedule}.
                  </p>
                )}
                {docData.type.startsWith('noc') && (
                  <p>
                    This verifies that an official **No Objection Certificate** was granted to <strong>{docData.employeeName}</strong> (Designation: <strong>{docData.details?.designation}</strong>, Salary: <strong>{docData.details?.salary?.toLocaleString()}৳</strong>) for {docData.type === 'noc_visa' ? 'Visa Application and travel' : 'Banking credit facility and credit verification purposes'}.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Secure Signature Badges */}
          <div className="grid grid-cols-2 gap-4 border-t pt-5">
            <div className="text-center p-3 border border-slate-100 rounded-xl bg-slate-50/50">
              <div className="h-10 flex items-center justify-center">
                {docData.details?.signatureUrl ? (
                  <img src={docData.details.signatureUrl} alt="Proprietor Signature" className="max-h-10 object-contain" />
                ) : (
                  <span className="text-[10px] text-slate-400 font-bold italic">Digitally Signed</span>
                )}
              </div>
              <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider mt-1 border-t pt-1">
                Authorized Signature
              </p>
            </div>
            <div className="text-center p-3 border border-slate-100 rounded-xl bg-slate-50/50">
              <div className="h-10 flex items-center justify-center">
                {docData.details?.sealUrl ? (
                  <img src={docData.details.sealUrl} alt="Official Seal" className="max-h-10 object-contain" />
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-dashed border-indigo-400 flex items-center justify-center text-[8px] text-indigo-500 font-bold">SEAL</div>
                )}
              </div>
              <p className="text-[9px] uppercase font-black text-slate-400 tracking-wider mt-1 border-t pt-1">
                Official Stamp
              </p>
            </div>
          </div>
        </div>

        {/* Action footer */}
        <div className="bg-slate-50 px-6 py-4 flex flex-col sm:flex-row gap-3 justify-between items-center border-t border-slate-100">
          <p className="text-[10px] text-slate-400 font-bold text-center sm:text-left">
            Secured via Cloud Firestore Cryptography • © {new Date().getFullYear()}
          </p>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-400" />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
