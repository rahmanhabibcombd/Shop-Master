import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, DollarSign, TrendingUp, AlertCircle, ShoppingCart, 
  CheckCircle2, Smartphone, MonitorIcon, AlertTriangle, Package, Users, X, Info,
  Pill, Coffee, Truck, Sparkles, Star, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { db, collection, query, where, onSnapshot, addDoc, updateDoc, getDocs, doc } from '../firebase';

// Helper for localizing key UI elements
const LOCAL_TRANSLATIONS = {
  en: {
    welcome: "Welcome to ShopMaster Dashboard",
    dashboardSubtitle: "Real-time analytics & business intelligence console.",
    totalSales: "Total Sales",
    totalProfit: "Net Profit",
    totalExpense: "Total Expenses",
    lowStock: "Low Stock Products",
    outOfStock: "Out Of Stock",
    receivables: "Total Receivables",
    noSales: "No Sales Record",
    noSalesDesc: "Once you complete transactions via POS, your sales and profit lifecycle analytics will appear here automatically.",
    chartTitle: "Performance Chart",
    viewRevenue: "View Revenue",
    viewProfit: "View Profit",
    day: "Day",
    week: "Week",
    month: "Month",
    year: "Year",
    inventoryHealth: "Inventory Health",
    expiringAlert: "Expiry Alert",
    expiringDays: "days",
    expiringBanner: "The following products are nearing their expiry date.",
    actionNeeded: "Action needed",
    criticalIssue: "Critical issue",
    receivablesSubtitle: "Outstanding Customer Balance",
    online: "Online",
    offline: "Offline",
    cogs: "Cost of Goods Sold (COGS)",
    grossProfit: "Gross Profit",
    merchant: "Merchant Console",
  },
  bn: {
    welcome: "শপমাস্টার ড্যাশবোর্ড-এ স্বাগতম",
    dashboardSubtitle: "রিয়েল-টাইম এনালাইটিক্স এবং বিজনেস ইন্টেলিজেন্স কনসোল।",
    totalSales: "মোট বিক্রয়",
    totalProfit: "নিট লাভ (Net Profit)",
    totalExpense: "মোট খরচ (Expense)",
    lowStock: "কম স্টক পণ্য",
    outOfStock: "স্টক শেষ",
    receivables: "মোট বকেয়া পাওনা",
    noSales: "কোন বিক্রয়ের রেকর্ড নেই",
    noSalesDesc: "পিওএস (POS) থেকে কোনো সেল সম্পন্ন হলে, এখানে বিক্রয় এবং মুনাফা পরিসংখ্যান স্বয়ংক্রিয়ভাবে আসবে।",
    chartTitle: "পারফর্মেন্স চার্ট",
    viewRevenue: "রেভিনিউ দেখুন",
    viewProfit: "প্রফিট দেখুন",
    day: "আজ",
    week: "এই সপ্তাহে",
    month: "এই মাস",
    year: "এই বছর",
    inventoryHealth: "ইনভেন্টরি হেলথ",
    expiringAlert: "মেয়াদ শেষ হওয়ার সতর্কবার্তা",
    expiringDays: "দিন",
    expiringBanner: "নিচের পণ্যগুলোর মেয়াদ শীঘ্রই শেষ হয়ে যাচ্ছে।",
    actionNeeded: "দ্রুত ব্যবস্থা প্রয়োজন",
    criticalIssue: "গুরুতর সমস্যা",
    receivablesSubtitle: "ক্রেতাদের কাছে মোট বকেয়া পাওনা",
    online: "অনলাইন",
    offline: "অফলাইন",
    cogs: "বিক্রিত পণ্যের উৎপাদন ব্যয়",
    grossProfit: "মোট লাভ (Gross Profit)",
    merchant: "মার্চেন্ট কনসোল",
  },
};

export interface Product {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  price: number;
  cost: number;
  barcode?: string;
  expiryDate?: string;
  shopId: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  cost?: number;
}

export interface Sale {
  id: string;
  invoiceId: string;
  customerName?: string;
  customerId?: string;
  items: SaleItem[];
  totalAmount: number;
  discount: number;
  tax: number;
  finalAmount: number;
  paidAmount: number;
  dueAmount: number;
  timestamp: any;
  shopId: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  currentDue: number;
  totalSpent: number;
  shopId: string;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  shopId: string;
  timestamp: any;
}

export interface DailyClosing {
  id: string;
  totalSales: number;
  totalExpenses: number;
  cashInHand: number;
  shopId: string;
  timestamp: any;
}

export interface ShopSettings {
  shopId: string;
  systemLanguage?: 'en' | 'bn';
  currencySymbol?: string;
  shopName?: string;
  businessType?: 'Retail' | 'Restaurant' | 'Electronics' | 'Pharmacy' | 'Dealer';
  name?: string;
}

interface DashboardProps {
  settings: any;
  onDelete?: (closing: DailyClosing) => void;
  onViewProductHistory: (p: any) => void;
  isOnline: boolean;
  user: any;
  period: 'day' | 'week' | 'month' | 'year';
  setPeriod: (p: 'day' | 'week' | 'month' | 'year') => void;
  viewMetric: 'revenue' | 'profit';
  setViewMetric: (v: 'revenue' | 'profit') => void;
  onSaveSettings?: (s: any) => void;
}

export function PerformanceChart({ chartData, viewMetric, primaryColor }: { chartData: any[], viewMetric: 'revenue' | 'profit', primaryColor: string }) {
  const barFill = primaryColor === 'blue-600' ? '#2563eb' : (primaryColor === 'emerald-600' ? '#10b981' : '#2563eb');
  
  return (
    <div className="w-full h-[350px]">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
          <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
          <Tooltip 
            cursor={{fill: '#f8fafc'}}
            contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
          />
          <Bar 
            dataKey={viewMetric === 'revenue' ? 'sales' : 'profit'} 
            radius={[8, 8, 0, 0]} 
            fill={barFill}
            animationDuration={1500}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const BUSINESS_MODELS = [
  {
    id: 'Retail',
    nameBn: 'মুদি ও খুচরা দোকান',
    nameEn: 'General Retail Store',
    descBn: 'সাধারণ খুচরা সেলস, বারকোড ইনভেন্টরি, কাস্টমার পিওএস বিলিং ও ক্যাশ ট্র্যাকিং।',
    descEn: 'Retail stock tracking, custom barcodes, rapid POS billing and client receipts.',
    icon: ShoppingCart,
    color: 'from-indigo-500 to-indigo-600',
    borderColor: 'border-indigo-150',
    textColor: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    accentColor: 'indigo'
  },
  {
    id: 'Restaurant',
    nameBn: 'রেস্টুরেন্ট ও ক্যাফে',
    nameEn: 'Restaurant & Café',
    descBn: 'কিচেন ডিসপ্লে সিস্টেম (KDS), কটেজ কেওটি কোড, ওয়েটার বিলিং এবং টেবিল ট্র্যাকিং।',
    descEn: 'Kitchen ticket monitors, table order mappings, waiter service logs, and fast KOTs.',
    icon: Coffee,
    color: 'from-amber-500 to-amber-600',
    borderColor: 'border-amber-150',
    textColor: 'text-amber-600',
    bgColor: 'bg-amber-50',
    accentColor: 'amber'
  },
  {
    id: 'Electronics',
    nameBn: 'মোবাইল ও ইলেকট্রনিক্স',
    nameEn: 'Mobile & Electronics',
    descBn: 'আইএমইআই (IMEI) ও সিরিয়াল ট্র্যাকিং, প্রোডাক্ট স্পেসিফিকেশন এবং ওয়ারেন্টি লাইফসাইকেল।',
    descEn: 'IMEI validation, unique physical serialization, hardware spec lists, and warranty lookup.',
    icon: Smartphone,
    color: 'from-blue-500 to-blue-600',
    borderColor: 'border-blue-150',
    textColor: 'text-blue-600',
    bgColor: 'bg-blue-50',
    accentColor: 'blue'
  },
  {
    id: 'Pharmacy',
    nameBn: 'ঔষধ ও ফার্মেসি',
    nameEn: 'Pharmacy & Medicine',
    descBn: 'জেনেরিক নাম সার্চ, কেমিক্যাল ফর্মুলা ইনডেক্স, এক্সপায়ারি সতর্কতা বার্তা ও ব্যাচ ট্র্যাকার।',
    descEn: 'Generic salt grouping, pharmacy batch matching, shelf tags, and medicine expiry warnings.',
    icon: Pill,
    color: 'from-emerald-500 to-emerald-600',
    borderColor: 'border-emerald-150',
    textColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    accentColor: 'emerald'
  },
  {
    id: 'Dealer',
    nameBn: 'ডিলারশিপ ও পাইকারি',
    nameEn: 'Dealership & Wholesale',
    descBn: 'বাল্ক এবং চালানি ট্র্যাকিং, অঞ্চলভিত্তিক ডিস্ট্রিবিউটর, এজেন্ট লেজার বুক ও হোলসেল রেট।',
    descEn: 'Bulk delivery Challan Sheets, territory mapping, dispatch agents, and wholesale rates.',
    icon: Truck,
    color: 'from-purple-500 to-purple-600',
    borderColor: 'border-purple-150',
    textColor: 'text-purple-600',
    bgColor: 'bg-purple-50',
    accentColor: 'purple'
  }
];

export default function Dashboard({ 
  settings, 
  onViewProductHistory, 
  isOnline, 
  user,
  period,
  setPeriod,
  viewMetric,
  setViewMetric,
  onSaveSettings
}: DashboardProps) {

  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [switchSuccess, setSwitchSuccess] = useState<string | null>(null);

  // Feedback & Review States
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [existingFeedback, setExistingFeedback] = useState<any>(null);
  const [isCheckingFeedback, setIsCheckingFeedback] = useState(false);
  const [localNotification, setLocalNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const systemLang = settings?.systemLanguage || 'en';
  const activeShopId = user?.shopId;

  // Fetch existing feedback in real-time for the active shop/user
  useEffect(() => {
    if (!activeShopId) {
      setExistingFeedback(null);
      return;
    }
    
    setIsCheckingFeedback(true);
    const q = query(
      collection(db, 'support_tickets'),
      where('shopId', '==', activeShopId),
      where('type', '==', 'feedback')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        setExistingFeedback({
          id: docSnap.id,
          ...docSnap.data()
        });
      } else {
        setExistingFeedback(null);
      }
      setIsCheckingFeedback(false);
    }, (err) => {
      console.error("Error subscribing to feedback:", err);
      setIsCheckingFeedback(false);
    });

    return () => unsubscribe();
  }, [activeShopId]);

  // Toast automatic clear
  useEffect(() => {
    if (localNotification) {
      const timer = setTimeout(() => {
        setLocalNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [localNotification]);

  const handleOpenFeedbackModal = () => {
    if (existingFeedback) {
      setFeedbackRating(existingFeedback.rating || 5);
      
      let desc = existingFeedback.description || '';
      let tags: string[] = [];
      if (desc.startsWith('[Tags: ')) {
        const tagEndIndex = desc.indexOf('] ');
        if (tagEndIndex !== -1) {
          const tagContent = desc.substring(7, tagEndIndex);
          tags = tagContent.split(', ').map((t: string) => t.trim());
          desc = desc.substring(tagEndIndex + 2);
        }
      }
      setSelectedTags(tags);
      setFeedbackText(desc);
    } else {
      setFeedbackRating(5);
      setSelectedTags([]);
      setFeedbackText('');
    }
    setShowFeedbackModal(true);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim() && selectedTags.length === 0) {
      setLocalNotification({
        type: 'error',
        message: systemLang === 'bn' ? 'দয়া করে কিছু মন্তব্য লিখুন অথবা অন্তত একটি ট্যাগ সিলেক্ট করুন!' : 'Please write comments or select at least one tag!'
      });
      return;
    }

    setIsSubmittingFeedback(true);

    try {
      const tagString = selectedTags.length > 0 ? `[Tags: ${selectedTags.join(', ')}] ` : '';
      const fullDescription = `${tagString}${feedbackText.trim()}`;

      if (existingFeedback) {
        const docRef = doc(db, 'support_tickets', existingFeedback.id);
        await updateDoc(docRef, {
          rating: feedbackRating,
          description: fullDescription,
          approved: false, // Must be approved again by the developer!
          status: 'open',
          updatedAt: new Date().toISOString()
        });

        setFeedbackSuccess(true);
        setLocalNotification({
          type: 'success',
          message: systemLang === 'bn' ? 'আপনার রিভিউ সফলভাবে এডিট ও সাবমিট হয়েছে! এটি পুনরায় অনুমোদনের জন্য পাঠানো হয়েছে।' : 'Your review was successfully edited & resubmitted! It has been sent for re-approval.'
        });
      } else {
        const payload = {
          shopId: activeShopId,
          userId: user?.uid || 'anonymous',
          userEmail: user?.email || 'anonymous',
          title: `Merchant Feedback (${feedbackRating} Stars)`,
          type: 'feedback',
          description: fullDescription,
          screenshot: '',
          rating: feedbackRating,
          status: 'open',
          approved: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          developerNote: ''
        };

        await addDoc(collection(db, 'support_tickets'), payload);

        setFeedbackSuccess(true);
        setLocalNotification({
          type: 'success',
          message: systemLang === 'bn' ? 'আপনার মূল্যবান রিভিউ সফলভাবে সাবমিট হয়েছে!' : 'Your valuable review was submitted successfully!'
        });
      }

      // Real-time Notification for the admin (stratproamz@gmail.com)
      try {
        const qAdmin = query(collection(db, 'shops'), where('ownerEmail', '==', 'stratproamz@gmail.com'));
        const adminSnap = await getDocs(qAdmin);
        if (!adminSnap.empty) {
          const adminUid = adminSnap.docs[0].data().ownerUid;
          if (adminUid && adminUid !== user?.uid) {
            const shopLabel = settings?.shopName || activeShopId || 'Merchant';
            const actionText = existingFeedback ? 'updated' : 'submitted';
            await addDoc(collection(db, 'community_notifications'), {
              recipientId: adminUid,
              title: `⭐ Merchant "${shopLabel}" ${actionText} a ${feedbackRating}-Star Review!`,
              type: 'info',
              createdAt: new Date().toISOString(),
              read: false
            });
          }
        }
      } catch (err) {
        console.error("Error sending admin review notification:", err);
      }

      setTimeout(() => {
        setShowFeedbackModal(false);
        setFeedbackRating(5);
        setFeedbackText('');
        setSelectedTags([]);
        setFeedbackSuccess(false);
      }, 3000);

    } catch (err: any) {
      console.error('Error saving feedback:', err);
      setLocalNotification({
        type: 'error',
        message: systemLang === 'bn' ? `রিভিউ সাবমিট করতে সমস্যা হয়েছে: ${err.message}` : `Error submitting review: ${err.message}`
      });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleModelSwitch = async (modelId: any) => {
    if (settings?.businessType === modelId) return;
    setSwitchingTo(modelId);
    setSwitchSuccess(null);
    try {
      if (onSaveSettings) {
        await onSaveSettings({
          ...settings,
          businessType: modelId
        });
        setSwitchSuccess(modelId);
      }
    } catch (err) {
      console.error("Error switching workspace model:", err);
    } finally {
      setTimeout(() => {
        setSwitchingTo(null);
        setTimeout(() => setSwitchSuccess(null), 4000);
      }, 800);
    }
  };

  const lt = LOCAL_TRANSLATIONS[systemLang === 'bn' ? 'bn' : 'en'];

  // Local state for full, reactive Firestore syncing matching the strict shopId rule
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync data securely based on logged in user's merchant shopId
  useEffect(() => {
    if (!activeShopId) {
      setSales([]);
      setProducts([]);
      setCustomers([]);
      setExpenses([]);
      setDailyClosings([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Sales sync
    const salesQuery = query(
      collection(db, 'sales'),
      where('shopId', '==', activeShopId)
    );
    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const fetchedSales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      fetchedSales.sort((a, b) => {
        const getMs = (ts: any) => {
          if (!ts) return 0;
          if (typeof ts.toDate === 'function') return ts.toDate().getTime();
          if (ts.seconds) return ts.seconds * 1000;
          return new Date(ts).getTime() || 0;
        };
        return getMs(b.timestamp) - getMs(a.timestamp);
      });
      setSales(fetchedSales);
      setLoading(false);
    }, (err) => {
      console.error("Dashboard Sales sync error:", err);
      setLoading(false);
    });

    // Products sync
    const productsQuery = query(
      collection(db, 'products'),
      where('shopId', '==', activeShopId)
    );
    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (err) => console.error("Dashboard Products sync error:", err));

    // Customers sync
    const customersQuery = query(
      collection(db, 'customers'),
      where('shopId', '==', activeShopId)
    );
    const unsubCustomers = onSnapshot(customersQuery, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (err) => console.error("Dashboard Customers sync error:", err));

    // Expenses sync
    const expensesQuery = query(
      collection(db, 'expenses'),
      where('shopId', '==', activeShopId)
    );
    const unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (err) => console.error("Dashboard Expenses sync error:", err));

    // Daily closings sync
    const closingsQuery = query(
      collection(db, 'daily_closings'),
      where('shopId', '==', activeShopId)
    );
    const unsubClosings = onSnapshot(closingsQuery, (snapshot) => {
      setDailyClosings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyClosing)));
    }, (err) => console.error("Dashboard Closings sync error:", err));

    return () => {
      unsubSales();
      unsubProducts();
      unsubCustomers();
      unsubExpenses();
      unsubClosings();
      // Synchronously clear memory-held variables on unmount or user change
      setSales([]);
      setProducts([]);
      setCustomers([]);
      setExpenses([]);
      setDailyClosings([]);
    };
  }, [activeShopId]);

  const fC = (num: number) => {
    const symbol = settings?.currencySymbol || 'TK';
    const lang = settings?.systemLanguage || 'en';
    if (!num && num !== 0) return `${symbol} 0`;
    return `${symbol} ${parseFloat(num.toFixed(2)).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}`;
  };

  const safeDate = (date: any) => {
    if (!date) return new Date();
    if (typeof date.toDate === 'function') return date.toDate();
    if (date.seconds) return new Date(date.seconds * 1000);
    return new Date(date);
  };

  // Trailing filter helper
  const now = useMemo(() => new Date(), [period]);
  
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const saleDate = safeDate(s.timestamp);
      if (period === 'day') {
        return saleDate.toDateString() === now.toDateString();
      }
      if (period === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return saleDate >= oneWeekAgo;
      }
      if (period === 'month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        return saleDate >= oneMonthAgo;
      }
      if (period === 'year') {
        const oneYearAgo = new Date();
        oneYearAgo.setDate(now.getDate() - 365);
        return saleDate >= oneYearAgo;
      }
      return true;
    });
  }, [sales, period, now]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const expenseDate = safeDate(e.timestamp);
      if (period === 'day') {
        return expenseDate.toDateString() === now.toDateString();
      }
      if (period === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return expenseDate >= oneWeekAgo;
      }
      if (period === 'month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        return expenseDate >= oneMonthAgo;
      }
      if (period === 'year') {
        const oneYearAgo = new Date();
        oneYearAgo.setDate(now.getDate() - 365);
        return expenseDate >= oneYearAgo;
      }
      return true;
    });
  }, [expenses, period, now]);

  // Aggregate stats
  const totalSalesCost = useMemo(() => {
    return filteredSales.reduce((sum, s) => {
      const itemsCost = s.items.reduce((itemSum, item) => {
        const costPrice = item.cost !== undefined ? item.cost : (item.price * 0.7); // Fallback to 70% if undef
        return itemSum + (costPrice * item.quantity);
      }, 0);
      return sum + itemsCost;
    }, 0);
  }, [filteredSales]);

  const periodSalesTotal = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + (s.finalAmount || 0), 0);
  }, [filteredSales]);

  const periodExpensesTotal = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [filteredExpenses]);

  const periodGrossProfit = useMemo(() => {
    return periodSalesTotal - totalSalesCost;
  }, [periodSalesTotal, totalSalesCost]);

  const periodNetProfit = useMemo(() => {
    return periodGrossProfit - periodExpensesTotal;
  }, [periodGrossProfit, periodExpensesTotal]);

  const totalMarketDue = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.currentDue || 0), 0);
  }, [customers]);

  // Expiring soon criteria (next 30 days)
  const expiringProducts = useMemo(() => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const today = new Date();
    return products.filter(p => p.expiryDate && new Date(p.expiryDate) <= thirtyDaysFromNow && new Date(p.expiryDate) >= today);
  }, [products]);

  // Chart data calculation
  const chartData = useMemo(() => {
    if (sales.length === 0) {
      const daysCount = period === 'year' ? 12 : (period === 'month' ? 4 : 7);
      return Array.from({ length: daysCount }, (_, i) => {
        let label = '';
        if (period === 'year') {
          const months = systemLang === 'bn' ? 
            ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'] :
            ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          label = months[i];
        } else if (period === 'month') {
          label = systemLang === 'bn' ? `সপ্তাহ ${i+1}` : `Week ${i+1}`;
        } else {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          label = d.toLocaleDateString(systemLang === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'short' });
        }
        return { name: label, sales: 0, profit: 0 };
      });
    }

    if (period === 'year') {
      const monthsData = Array.from({ length: 12 }, (_, i) => {
        const months = systemLang === 'bn' ? 
          ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'] :
          ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return { name: months[i], monthIndex: i, sales: 0, profit: 0 };
      });

      sales.forEach(s => {
        const d = safeDate(s.timestamp);
        const y = d.getFullYear();
        const currentYear = new Date().getFullYear();
        if (y === currentYear) {
          const m = d.getMonth();
          monthsData[m].sales += s.finalAmount || 0;
          const cost = s.items.reduce((sum, item) => {
            const costPrice = item.cost !== undefined ? item.cost : (item.price * 0.7);
            return sum + (costPrice * item.quantity);
          }, 0);
          monthsData[m].profit += (s.finalAmount || 0) - cost;
        }
      });

      return monthsData.map(item => ({
        name: item.name,
        sales: Math.max(0, parseFloat(item.sales.toFixed(2))),
        profit: Math.max(0, parseFloat(item.profit.toFixed(2)))
      }));
    } else if (period === 'month') {
      const weeksData = Array.from({ length: 4 }, (_, i) => {
        const label = systemLang === 'bn' ? `সপ্তাহ ${i+1}` : `Week ${i+1}`;
        return { name: label, weekIndex: i, sales: 0, profit: 0 };
      });

      sales.forEach(s => {
        const d = safeDate(s.timestamp);
        const m = d.getMonth();
        const currentMonth = new Date().getMonth();
        if (m === currentMonth) {
          const day = d.getDate();
          const weekIdx = Math.min(3, Math.floor((day - 1) / 7));
          weeksData[weekIdx].sales += s.finalAmount || 0;
          const cost = s.items.reduce((sum, item) => {
            const costPrice = item.cost !== undefined ? item.cost : (item.price * 0.7);
            return sum + (costPrice * item.quantity);
          }, 0);
          weeksData[weekIdx].profit += (s.finalAmount || 0) - cost;
        }
      });

      return weeksData.map(item => ({
        name: item.name,
        sales: Math.max(0, parseFloat(item.sales.toFixed(2))),
        profit: Math.max(0, parseFloat(item.profit.toFixed(2)))
      }));
    } else {
      const daysData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dayName = d.toLocaleDateString(systemLang === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'short' });
        return { name: dayName, dateString: d.toDateString(), sales: 0, profit: 0 };
      });

      sales.forEach(s => {
        const d = safeDate(s.timestamp);
        const dStr = d.toDateString();
        const targetDay = daysData.find(x => x.dateString === dStr);
        if (targetDay) {
          targetDay.sales += s.finalAmount || 0;
          const cost = s.items.reduce((sum, item) => {
            const costPrice = item.cost !== undefined ? item.cost : (item.price * 0.7);
            return sum + (costPrice * item.quantity);
          }, 0);
          targetDay.profit += (s.finalAmount || 0) - cost;
        }
      });

      return daysData.map(item => ({
        name: item.name,
        sales: Math.max(0, parseFloat(item.sales.toFixed(2))),
        profit: Math.max(0, parseFloat(item.profit.toFixed(2)))
      }));
    }
  }, [sales, period, systemLang]);

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0 }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-semibold text-gray-500">
          {systemLang === 'bn' ? 'ড্যাশবোর্ড তথ্য লোড হচ্ছে...' : 'Loading dashboard analytics...'}
        </p>
      </div>
    );
  }

  return (
    <motion.div 
      variants={{
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
      }}
      initial="hidden"
      animate="visible"
      className="space-y-10 pb-10"
    >
      {/* Header section with Welcome, Status Badge & Title Details */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-indigo-50/50 to-sky-50/20 p-8 rounded-[2.5rem] border border-indigo-100/40 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl"></div>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] bg-indigo-600 text-white font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
              {lt.merchant}
            </span>
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all duration-300 shadow-sm ${
              isOnline 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-emerald-150/10 hover:bg-emerald-100/50' 
                : 'bg-rose-50 text-rose-700 border border-rose-100 shadow-rose-150/10'
            }`}>
              {isOnline ? (
                <div className="relative flex h-2.5 w-2.5 items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </div>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              )}
              <span className="tracking-wide">
                {isOnline ? lt.online : lt.offline}
              </span>
            </div>
          </div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            {lt.welcome}, {user?.username || (systemLang === 'bn' ? 'মার্চেন্ট' : 'Merchant')}!
          </h2>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            {settings?.shopName ? `🏪 ${settings.shopName} | ` : ''}{lt.dashboardSubtitle}
          </p>
        </div>
        <div className="text-right flex flex-col items-start md:items-end justify-center shrink-0 gap-3">
          <div className="text-right flex flex-col items-start md:items-end justify-center shrink-0">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">
              {systemLang === 'bn' ? 'আজকের তারিখ' : 'TODAY'}
            </p>
            <p className="text-xl font-black text-indigo-600 mt-1.5 bg-white shadow-sm border border-gray-100 px-5 py-2.5 rounded-2xl">
              📅 {format(now, systemLang === 'bn' ? 'dd MMMM, yyyy' : 'MMMM dd, yyyy')}
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1.5 w-full">
            <button
              type="button"
              onClick={handleOpenFeedbackModal}
              className="w-full md:w-auto bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 active:scale-95 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 border border-amber-400/20"
            >
              <Star className="w-4 h-4 text-white fill-white animate-pulse" />
              {existingFeedback 
                ? (systemLang === 'bn' ? 'রিভিউ এডিট করুন' : 'Edit Review')
                : (systemLang === 'bn' ? 'রিভিউ দিন / মতামত পাঠান' : 'Give Feedback')
              }
            </button>
            {existingFeedback && (
              <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${
                existingFeedback.approved 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                  : existingFeedback.status === 'declined'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse'
              }`}>
                {existingFeedback.approved 
                  ? (systemLang === 'bn' ? '🌐 অনুমোদিত ও লাইভ' : '🌐 Approved & Live') 
                  : existingFeedback.status === 'declined'
                    ? (systemLang === 'bn' ? '❌ প্রত্যাখ্যান করা হয়েছে' : '❌ Declined')
                    : (systemLang === 'bn' ? '🔒 অনুমোদনের অপেক্ষায়' : '🔒 Pending Approval')
                }
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Master Workspace Selector */}
      <motion.div 
        variants={itemVariants}
        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-8 rounded-[2.5rem] shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)]"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
              {systemLang === 'bn' ? 'অ্যাক্টিভ বিজনেস ওয়ার্কস্পেস এবং সিস্টেম মডেল' : 'Active Business Workstation & System Model'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-semibold">
              {systemLang === 'bn' 
                ? 'স্বতন্ত্র ৫টি বিজনেস ক্যাটাগরির যেকোনো একটি সিলেক্ট করুন। মুহূর্তেই পিওএস, ইনভেন্টরি, থিম এবং ড্যাশবোর্ড সেই মডেলে পরিবর্তিত হয়ে যাবে।' 
                : 'Select any of the 5 distinct business models to instantly customize the active interfaces, POS views, theme accents, and parameters.'}
            </p>
          </div>
          {switchSuccess && (
            <div className="bg-emerald-50 text-emerald-800 text-xs font-black py-2 px-4 rounded-xl border border-emerald-100 shadow-sm animate-bounce flex items-center gap-1.5">
              <span>●</span>
              {systemLang === 'bn' ? 'ওয়ার্কস্পেস সফলভাবে পরিবর্তিত হয়েছে!' : 'Workspace synchronized successfully!'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {BUSINESS_MODELS.map((b) => {
            const isActive = settings?.businessType === b.id;
            const isSwitching = switchingTo === b.id;
            const IconComponent = b.icon;
            
            const activeBorderColor = isActive ? (
              b.id === 'Retail' ? 'bg-white dark:bg-slate-950 border-indigo-500 ring-2 ring-indigo-500/20 shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] transform translate-y-[-2px]' :
              b.id === 'Restaurant' ? 'bg-white dark:bg-slate-950 border-amber-500 ring-2 ring-amber-500/20 shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] transform translate-y-[-2px]' :
              b.id === 'Electronics' ? 'bg-white dark:bg-slate-950 border-blue-500 ring-2 ring-blue-500/20 shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] transform translate-y-[-2px]' :
              b.id === 'Pharmacy' ? 'bg-white dark:bg-slate-950 border-emerald-500 ring-2 ring-emerald-500/20 shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] transform translate-y-[-2px]' :
              'bg-white dark:bg-slate-950 border-purple-500 ring-2 ring-purple-500/20 shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] transform translate-y-[-2px]'
            ) : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-100/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-950 hover:shadow-md hover:translate-y-[-1px]';

            const activeBadgeStyle = isActive ? (
              b.id === 'Retail' ? 'bg-indigo-100 dark:bg-slate-800 text-indigo-700 dark:text-white border-indigo-200' :
              b.id === 'Restaurant' ? 'bg-amber-100 dark:bg-slate-800 text-amber-700 dark:text-white border-amber-200' :
              b.id === 'Electronics' ? 'bg-blue-100 dark:bg-slate-800 text-blue-700 dark:text-white border-blue-200' :
              b.id === 'Pharmacy' ? 'bg-emerald-100 dark:bg-slate-800 text-emerald-700 dark:text-white border-emerald-200' :
              'bg-purple-100 dark:bg-slate-800 text-purple-700 dark:text-white border-purple-200'
            ) : '';

            return (
              <button
                key={b.id}
                onClick={() => handleModelSwitch(b.id)}
                disabled={isSwitching}
                className={`relative flex flex-col items-start text-left p-5 rounded-2xl border-2 transition-all duration-300 outline-none select-none h-full ${activeBorderColor}`}
              >
                {/* Visual Accent Border */}
                {isActive && (
                  <span className={`absolute top-0 left-0 w-full h-1.5 rounded-t-lg bg-gradient-to-r ${b.color}`}></span>
                )}

                {/* Card Icon Header */}
                <div className="flex items-center justify-between w-full mb-3 mt-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors ${
                    isActive 
                      ? `bg-gradient-to-br ${b.color} text-white` 
                      : `${b.bgColor} ${b.textColor} dark:bg-slate-800`
                  }`}>
                    {isSwitching ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <IconComponent className="w-5 h-5" />
                    )}
                  </div>
                  
                  {isActive && (
                    <span className={`text-[9.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${activeBadgeStyle}`}>
                      {systemLang === 'bn' ? 'সচল (Active)' : 'Active'}
                    </span>
                  )}
                </div>

                {/* Model Title & Description */}
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">
                  {systemLang === 'bn' ? b.nameBn : b.nameEn}
                </h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 font-medium leading-relaxed mt-1.5 flex-grow">
                  {systemLang === 'bn' ? b.descBn : b.descEn}
                </p>

                {/* Workspace Indicator Badge */}
                <div className="w-full border-t border-slate-100/60 dark:border-slate-800/60 mt-4 pt-3 flex items-center justify-between text-[10px] text-slate-300 dark:text-slate-500 font-bold uppercase tracking-wider">
                  <span>{systemLang === 'bn' ? 'মডেল ধরন' : 'SYSTEM TYPE'}</span>
                  <span className={isActive ? `${b.textColor} font-black` : ""}>
                    {b.id}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Expiry alerts banner */}
      {expiringProducts.length > 0 && (
        <motion.div 
          variants={itemVariants}
          className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-rose-50 rounded-[2rem] border border-rose-100 shadow-sm gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle className="w-6 h-6 shrink-0" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-900 leading-snug">{lt.expiringAlert} ({expiringProducts.length})</p>
              <p className="text-xs text-rose-600 font-semibold leading-relaxed mt-0.5">{lt.expiringBanner}</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 overflow-x-auto max-w-full py-1">
            {expiringProducts.slice(0, 4).map(p => (
              <button
                key={p.id}
                onClick={() => onViewProductHistory(p)}
                className="bg-white hover:bg-rose-100 text-rose-800 font-bold text-[10px] transition-all px-3 py-1.5 rounded-xl border border-rose-200 shadow-sm whitespace-nowrap"
              >
                {p.name}
              </button>
            ))}
            {expiringProducts.length > 4 && (
              <span className="bg-rose-200 text-rose-900 font-bold text-[10px] px-3 py-1.5 rounded-xl flex items-center shadow-sm">
                +{expiringProducts.length - 4} More
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Grid containing high impact statistics */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6"
      >
        {/* Total Sales Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-md shadow-slate-100/50 hover:shadow-lg hover:border-indigo-100/50 transition-all group duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-20 h-20 bg-indigo-50 rounded-full group-hover:scale-125 transition-transform duration-500"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{lt.totalSales}</p>
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <ShoppingCart className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black font-mono tracking-tight text-slate-900 leading-none">{fC(periodSalesTotal)}</h3>
              <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                {period === 'day' ? lt.day : period === 'week' ? lt.week : period === 'month' ? lt.month : lt.year}
              </p>
            </div>
          </div>
        </div>

        {/* COGS Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-md shadow-slate-100/50 hover:shadow-lg transition-all group duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-20 h-20 bg-slate-50 rounded-full group-hover:scale-125 transition-transform duration-500"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{lt.cogs}</p>
              <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center shadow-sm">
                <Package className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black font-mono tracking-tight text-slate-900 leading-none">{fC(totalSalesCost)}</h3>
              <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                {period === 'day' ? lt.day : period === 'week' ? lt.week : period === 'month' ? lt.month : lt.year}
              </p>
            </div>
          </div>
        </div>

        {/* Gross Profit Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-md shadow-slate-100/50 hover:shadow-lg transition-all group duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-20 h-20 bg-teal-50 rounded-full group-hover:scale-125 transition-transform duration-500"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{lt.grossProfit}</p>
              <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center shadow-sm">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black font-mono tracking-tight text-teal-600 leading-none">{fC(periodGrossProfit)}</h3>
              <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                {period === 'day' ? lt.day : period === 'week' ? lt.week : period === 'month' ? lt.month : lt.year}
              </p>
            </div>
          </div>
        </div>

        {/* Expenses Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-md shadow-slate-100/50 hover:shadow-lg transition-all group duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-20 h-20 bg-rose-50 rounded-full group-hover:scale-125 transition-transform duration-500"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{lt.totalExpense}</p>
              <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shadow-sm">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black font-mono tracking-tight text-rose-600 leading-none">{fC(periodExpensesTotal)}</h3>
              <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                {period === 'day' ? lt.day : period === 'week' ? lt.week : period === 'month' ? lt.month : lt.year}
              </p>
            </div>
          </div>
        </div>

        {/* Net Profit Card */}
        <div className="bg-gradient-to-br from-emerald-600 to-green-700 p-6 rounded-3xl shadow-xl shadow-emerald-500/10 hover:shadow-2xl transition-all group duration-300 relative overflow-hidden text-white">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-20 h-20 bg-white/10 rounded-full group-hover:scale-125 transition-transform duration-500"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-bold text-emerald-100/80 uppercase tracking-wider">{lt.totalProfit}</p>
              <div className="w-10 h-10 bg-white/20 text-white rounded-xl flex items-center justify-center shadow-md">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div>
              <h3 className="text-2.5xl font-black font-mono tracking-tight text-white leading-none">
                {periodNetProfit >= 0 ? '+' : ''}{fC(periodNetProfit)}
              </h3>
              <p className="text-[10px] text-emerald-100 mt-2 font-bold uppercase tracking-wider">
                {period === 'day' ? lt.day : period === 'week' ? lt.week : period === 'month' ? lt.month : lt.year}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main performance chart with metrics Selector and trailing switcher */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-md shadow-gray-200/40 relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">{lt.chartTitle}</h3>
              <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-wider">
                {period === 'day' ? lt.day : period === 'week' ? lt.week : period === 'month' ? lt.month : lt.year}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 items-center">
              {/* Period toggle tabs */}
              <div className="bg-slate-100 p-1 rounded-2xl flex border border-slate-200 shadow-inner">
                {(['day', 'week', 'month', 'year'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-4 py-2 text-xs font-black rounded-xl transition-all leading-none ${
                      period === p 
                        ? 'bg-white text-indigo-600 shadow-md' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {lt[p]}
                  </button>
                ))}
              </div>

              {/* View metrics selector */}
              <div className="bg-slate-100 p-1 rounded-2xl flex border border-slate-200 shadow-inner">
                <button
                  onClick={() => setViewMetric('revenue')}
                  className={`px-4 py-2 text-xs font-black rounded-xl transition-all leading-none ${
                    viewMetric === 'revenue' 
                      ? 'bg-white text-indigo-600 shadow-md' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {lt.viewRevenue}
                </button>
                <button
                  onClick={() => setViewMetric('profit')}
                  className={`px-4 py-2 text-xs font-black rounded-xl transition-all leading-none ${
                    viewMetric === 'profit' 
                      ? 'bg-white text-indigo-600 shadow-md' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {lt.viewProfit}
                </button>
              </div>
            </div>
          </div>

          <div className="h-[350px] w-full relative">
            {sales.length === 0 && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center text-center z-10 p-6">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                  <TrendingUp className="w-8 h-8 text-slate-300" />
                </div>
                <h4 className="text-base font-black text-slate-800 mb-1">{lt.noSales}</h4>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed font-bold">
                  {lt.noSalesDesc}
                </p>
              </div>
            )}
            <PerformanceChart 
              chartData={chartData} 
              viewMetric={viewMetric} 
              primaryColor="blue-600" 
            />
          </div>
        </div>

        {/* Side columns: Inventory health & Receivables */}
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-md shadow-gray-200/40">
            <h3 className="text-xl font-black text-gray-900 tracking-tight mb-6">{lt.inventoryHealth}</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-5 bg-orange-50/70 rounded-3xl border border-orange-100/50 shadow-sm transition-all hover:bg-orange-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-orange-600">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-orange-950">{lt.lowStock}</p>
                    <p className="text-xs text-orange-500/80 font-bold">{lt.actionNeeded}</p>
                  </div>
                </div>
                <span className="text-2xl font-black text-orange-600 bg-white px-4 py-1.5 rounded-full border border-orange-100/30">
                  {products.filter(p => p.stock > 0 && p.stock < 10).length}
                </span>
              </div>

              <div className="flex items-center justify-between p-5 bg-rose-50/70 rounded-3xl border border-rose-100/50 shadow-sm transition-all hover:bg-rose-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-rose-600">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-rose-950">{lt.outOfStock}</p>
                    <p className="text-xs text-rose-500/80 font-bold">{lt.criticalIssue}</p>
                  </div>
                </div>
                <span className="text-2xl font-black text-rose-600 bg-white px-4 py-1.5 rounded-full border border-rose-100/30">
                  {products.filter(p => p.stock <= 0).length}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-tr from-indigo-600 to-violet-700 p-8 rounded-[2.5rem] shadow-xl shadow-indigo-600/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 -m-8 w-36 h-36 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-700"></div>
            <div className="relative z-10 text-white flex flex-col justify-between h-full">
              <div>
                <h3 className="text-slate-100 text-xs font-bold uppercase tracking-widest">{lt.receivables}</h3>
                <p className="text-4xl font-black mt-3 mb-2 tracking-tight">{fC(totalMarketDue)}</p>
                <p className="text-[11px] text-indigo-100 font-bold leading-normal">{lt.receivablesSubtitle}</p>
              </div>
              <div className="flex items-center gap-2 text-white bg-white/15 w-fit px-4 py-2 rounded-2xl border border-white/10 backdrop-blur-sm mt-6">
                <Users className="w-4 h-4 shrink-0" />
                <span className="font-extrabold uppercase tracking-wider text-[9px]">
                  {customers.length} Profiles Registered
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Toast Notification */}
      <AnimatePresence>
        {localNotification && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 border ${
              localNotification.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
            }`}
          >
            {localNotification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            )}
            <span className="text-xs font-bold">{localNotification.message}</span>
            <button
              onClick={() => setLocalNotification(null)}
              className="ml-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback & Review Modal */}
      <AnimatePresence>
        {showFeedbackModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 dark:border-slate-800 relative overflow-hidden"
            >
              {/* Background gradient flares */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between pb-4 border-b border-gray-150 dark:border-slate-800/80 mb-5 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/40 rounded-xl">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 dark:text-gray-100">
                      {existingFeedback 
                        ? (systemLang === 'bn' ? 'রিভিউ পরিবর্তন বা এডিট করুন' : 'Edit Your Review')
                        : (systemLang === 'bn' ? 'মতামত বা রিভিউ দিন' : 'Give Feedback / Review')
                      }
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                      {existingFeedback
                        ? (systemLang === 'bn' ? 'আপনার রিভিউটি পুনরায় মডারেশনের জন্য পাঠানো হবে' : 'Your updated review will be sent for approval')
                        : (systemLang === 'bn' ? 'আপনার মূল্যবান মতামত আমাদের অনুপ্রাণিত করে' : 'Help us make the system better')
                      }
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFeedbackModal(false)}
                  className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {feedbackSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-12 flex flex-col items-center text-center space-y-4"
                >
                  <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/40 rounded-full flex items-center justify-center text-emerald-500 relative shadow-inner animate-bounce">
                    <CheckCircle2 className="w-10 h-10" />
                    <Sparkles className="absolute -top-1 -right-1 w-6 h-6 text-amber-400 animate-pulse" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-lg font-black text-slate-850 dark:text-gray-100">
                      {systemLang === 'bn' ? 'রিভিউ সফলভাবে গৃহীত হয়েছে!' : 'Feedback Submitted!'}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium max-w-xs leading-relaxed">
                      {systemLang === 'bn' 
                        ? 'আপনার দেওয়া রিভিউর জন্য অসংখ্য ধন্যবাদ। এটি আমাদের প্ল্যাটফর্মকে আরও উন্নত করতে সাহায্য করবে এবং এডমিনের কাছে তা মডারেশনের জন্য চলে গিয়েছে।'
                        : 'Thank you for your valuable feedback. It has been submitted for admin approval.'}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <form onSubmit={handleFeedbackSubmit} className="space-y-5 relative z-10">
                  {/* Star rating selector */}
                  <div className="space-y-2 text-center py-2 bg-slate-50/50 dark:bg-slate-950/30 rounded-2xl border border-slate-100/50 dark:border-slate-850/40">
                    <span className="block text-[10px] uppercase font-black tracking-widest text-slate-400">
                      {systemLang === 'bn' ? 'রেটিং সিলেক্ট করুন' : 'Select Rating'}
                    </span>
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="p-1 hover:scale-125 active:scale-95 transition-all cursor-pointer"
                        >
                          <Star 
                            className={`w-8 h-8 transition-colors ${
                              star <= feedbackRating 
                                ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' 
                                : 'text-slate-300 dark:text-slate-700'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <span className="block text-xs font-black text-amber-500 mt-1">
                      {feedbackRating === 5 && (systemLang === 'bn' ? 'চমৎকার! (৫/৫)' : 'Excellent! (5/5)')}
                      {feedbackRating === 4 && (systemLang === 'bn' ? 'খুব ভালো! (৪/৫)' : 'Very Good! (4/5)')}
                      {feedbackRating === 3 && (systemLang === 'bn' ? 'ভালো (৩/৫)' : 'Good (3/5)')}
                      {feedbackRating === 2 && (systemLang === 'bn' ? 'মোটামুটি (২/৫)' : 'Fair (2/5)')}
                      {feedbackRating === 1 && (systemLang === 'bn' ? 'উন্নতি দরকার (১/৫)' : 'Needs Improvement (1/5)')}
                    </span>
                  </div>

                  {/* Feedback tags */}
                  <div className="space-y-2">
                    <label className="block text-[10px] uppercase font-black tracking-widest text-slate-400">
                      {systemLang === 'bn' ? 'আপনি সিস্টেমের কোন বিষয়টি সবচেয়ে বেশি পছন্দ করেছেন?' : 'What do you like the most?'}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'UI/UX', bn: 'ডিজাইন ও ইউজার ইন্টারফেস', en: 'Design & UI/UX' },
                        { id: 'Speed', bn: 'গতি ও পারফরম্যান্স', en: 'Speed & Performance' },
                        { id: 'EasyToUse', bn: 'সহজ ও সাবলীল ব্যবহার', en: 'Simplicity & Easy Use' },
                        { id: 'Features', bn: 'কার্যকরী ফিচারসমূহ', en: 'Rich Features' },
                        { id: 'Security', bn: 'নিরাপত্তা ও গোপনীয়তা', en: 'Privacy & Security' }
                      ].map((tag) => {
                        const isSelected = selectedTags.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTags(selectedTags.filter(t => t !== tag.id));
                              } else {
                                setSelectedTags([...selectedTags, tag.id]);
                              }
                            }}
                            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black tracking-wide transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/10'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-850 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {systemLang === 'bn' ? tag.bn : tag.en}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Textarea comment */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-black tracking-widest text-slate-400">
                      {systemLang === 'bn' ? 'আপনার মন্তব্য বা পরামর্শ লিখুন' : 'Your Detailed Review / Comments'}
                    </label>
                    <textarea
                      placeholder={systemLang === 'bn' ? 'আপনার অভিজ্ঞতা শেয়ার করুন এবং কীভাবে আমরা আরও ভালো করতে পারি তা জানান...' : 'Tell us about your experience and how we can improve...'}
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      rows={3}
                      className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 rounded-2xl text-xs font-bold outline-none focus:border-indigo-500 w-full resize-none placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/10 text-slate-950 dark:text-slate-50"
                    />
                  </div>

                  {/* Submit actions */}
                  <div className="pt-3 border-t border-gray-100 dark:border-slate-800/80 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowFeedbackModal(false)}
                      className="px-5 py-2.5 border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                    >
                      {systemLang === 'bn' ? 'বাতিল' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingFeedback}
                      className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-500/15"
                    >
                      {isSubmittingFeedback ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          {systemLang === 'bn' ? 'পাঠানো হচ্ছে...' : 'Submitting...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {systemLang === 'bn' ? 'জমা দিন' : 'Submit Review'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
