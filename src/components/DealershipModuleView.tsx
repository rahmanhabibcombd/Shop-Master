import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Truck, 
  BookOpen, 
  Users, 
  MapPin, 
  FileText, 
  Plus, 
  Trash, 
  Search, 
  DollarSign, 
  Percent, 
  AlertTriangle, 
  CheckCircle, 
  User, 
  ShieldAlert, 
  Layers, 
  UserCheck, 
  UserX, 
  Calendar, 
  FileSpreadsheet, 
  Clock, 
  Printer,
  Store,
  ShoppingCart,
  RefreshCw,
  ShieldCheck,
  ClipboardCheck,
  TrendingUp,
  Compass
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { db, doc, updateDoc, addDoc, collection, setDoc, onSnapshot, query, where, deleteDoc } from '../firebase';

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
  
  // Wholesale Specifics
  wholesalePrice?: number;
  moq?: number; // Minimum Order Quantity

  // Company and Multi-Unit Fields
  companyName?: string;
  cartonPrice?: number;
  cartonBarcode?: string;
  cartonCapacity?: number;
  boxPrice?: number;
  boxBarcode?: string;
  boxCapacity?: number;
  dozenPrice?: number;
  dozenBarcode?: string;
  piecePrice?: number;
  pieceBarcode?: string;
  damageStock?: number;
}

interface Company {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  createdAt?: string;
}

interface Dealer {
  id: string;
  name: string;
  phone: string;
  company?: string;
  area?: string;
  creditLimit?: number;
  currentBalance?: number; // debit-credit outstanding
}

interface Agent {
  id: string;
  name: string;
  phone: string;
  area: string;
  commissionRate: number; // percentage (e.g. 2.5)
}

interface Beat {
  id?: string;
  name: string;
  day: string;
  shopId: string;
}

interface Staff {
  id: string;
  name: string;
  phone: string;
  role: 'SR' | 'DSR' | 'Delivery Man';
  mappedCompany?: string; // e.g. 'Unilever Bangladesh'
  createdAt?: string;
}

interface TradeScheme {
  id: string;
  productId: string;
  productName: string;
  unit: 'carton' | 'box' | 'dozen' | 'piece';
  buyQty: number;
  freeQty: number;
  isActive: boolean;
  createdAt: string;
  shopId: string;
}

interface Retailer {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  area: string; // Road/Area
  beat: string; // Weekday/Route e.g., 'Monday - Chowkbazar'
  gps?: string; // Coordinates
  imageUrl?: string; // Temporary image URL
  previousDue?: number; // Outstanding
  createdAt?: string;
}

interface OrderItem {
  productId: string;
  productName: string;
  unit: 'carton' | 'box' | 'dozen' | 'piece';
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface Order {
  id: string;
  retailerId: string;
  retailerName: string;
  retailerPhone: string;
  beat: string;
  srId: string;
  srName: string;
  companyName: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'Pending' | 'Delivered' | 'Cancelled' | 'Dispatched';
  createdAt: string;
  shopId: string;
}

interface Claim {
  id: string;
  orderId: string;
  retailerId: string;
  retailerName: string;
  productId: string;
  productName: string;
  unit: 'carton' | 'box' | 'dozen' | 'piece';
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  type: 'Refund' | 'Damage'; // Refund = Customer rejected item, Damage = Damaged/Expired collection
  status: 'Pending Verification' | 'Approved' | 'Rejected';
  dsrName: string;
  companyName: string;
  shopId: string;
  createdAt: string;
}

interface Challan {
  id: string;
  challanNo: string;
  dealerName: string;
  dealerPhone: string;
  agentName?: string;
  area?: string;
  items: Array<{
    productId: string;
    productName: string;
    qty: number;
    price: number;
  }>;
  status: 'Dispatched' | 'Delivered' | 'Returned';
  createdAt: string;
}

interface DealershipModuleViewProps {
  products: Product[];
  customers: any[];
  onAddProduct: (newProduct: Partial<Product>) => Promise<string | undefined>;
  settings: any;
  user: any;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' }) => void;
}

export function DealershipModuleView({ 
  products, 
  customers, 
  onAddProduct, 
  settings, 
  user, 
  setNotification 
}: DealershipModuleViewProps) {
  const isBn = settings?.systemLanguage === 'bn';
  const currencySymbol = settings?.currency || '৳';

  // Navigation Panel
  const [activeSubTab, setActiveSubTab] = useState<'challan' | 'ledger' | 'agent' | 'rates' | 'companies' | 'inventory' | 'staff' | 'retailers' | 'sr_portal' | 'dsr_portal' | 'claims_manager' | 'analytics' | 'due_ledger' | 'trade_schemes' | 'company_claims'>('companies');

  // --- Claims and DSR Simulation States ---
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isSavingClaim, setIsSavingClaim] = useState(false);
  const [simulatedDsr, setSimulatedDsr] = useState<Staff | null>(null);
  const [selectedOrderForDelivery, setSelectedOrderForDelivery] = useState<Order | null>(null);
  
  // States for compiling refund/rejection quantities
  // For each item in the delivery, user can specify quantity rejected
  const [refundQty, setRefundQty] = useState<{[itemKey: string]: number}>({});
  
  // States for damage collection during delivery
  const [selectedDamageProduct, setSelectedDamageProduct] = useState<string>('');
  const [damageQty, setDamageQty] = useState<string>('0');
  const [damageUnit, setDamageUnit] = useState<'carton' | 'box' | 'dozen' | 'piece'>('piece');
  const [tempDamageCollections, setTempDamageCollections] = useState<Array<{
    productId: string;
    productName: string;
    unit: 'carton' | 'box' | 'dozen' | 'piece';
    quantity: number;
    unitPrice: number;
  }>>([]);
  const [companyDamageLedger, setCompanyDamageLedger] = useState<any[]>([]);

  // --- Staff Registry States ---
  const [staff, setStaff] = useState<Staff[]>([
    { id: 'st_1', name: 'Karimul Islam (SR)', phone: '01711122233', role: 'SR', mappedCompany: 'Unilever Bangladesh', createdAt: new Date().toISOString() },
    { id: 'st_2', name: 'Md. Abul (DSR)', phone: '01922233344', role: 'DSR', createdAt: new Date().toISOString() },
    { id: 'st_3', name: 'Sujon Mia (Delivery)', phone: '01833344455', role: 'Delivery Man', createdAt: new Date().toISOString() }
  ]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'SR' | 'DSR' | 'Delivery Man'>('SR');
  const [newStaffCompany, setNewStaffCompany] = useState('');
  const [isSavingStaff, setIsSavingStaff] = useState(false);

  // --- Retailer Registry States ---
  const [retailers, setRetailers] = useState<Retailer[]>([
    { id: 'ret_1', name: 'Mayer Doa Groceries', ownerName: 'Hajji Mayer Doa', phone: '01755112233', area: 'Chowkbazar Road', beat: 'Monday - Chowkbazar Beat', previousDue: 12500, gps: '23.7275, 90.3924', createdAt: new Date().toISOString() },
    { id: 'ret_2', name: 'Bismillah Store', ownerName: 'Md. Soleman', phone: '01911998877', area: 'Station Road', beat: 'Tuesday - Station Road Beat', previousDue: 4500, gps: '23.7285, 90.3934', createdAt: new Date().toISOString() },
    { id: 'ret_3', name: 'Chittagong Store', ownerName: 'Md. Faruk', phone: '01822887766', area: 'Sadar Bazar', beat: 'Wednesday - Sadar Road Beat', previousDue: 0, gps: '23.7295, 90.3944', createdAt: new Date().toISOString() }
  ]);
  const [newRetailerName, setNewRetailerName] = useState('');
  const [newRetailerOwner, setNewRetailerOwner] = useState('');
  const [newRetailerPhone, setNewRetailerPhone] = useState('');
  const [newRetailerArea, setNewRetailerArea] = useState('');
  const [newRetailerBeat, setNewRetailerBeat] = useState('');
  const [newRetailerGps, setNewRetailerGps] = useState('');
  const [newRetailerImageUrl, setNewRetailerImageUrl] = useState('');
  const [newRetailerDue, setNewRetailerDue] = useState('0');
  const [isSavingRetailer, setIsSavingRetailer] = useState(false);
  const [retailerSearchQuery, setRetailerSearchQuery] = useState('');
  const [retailerFilterBeat, setRetailerFilterBeat] = useState('');

  // --- Predefined & Dynamic Beats ---
  const [beats, setBeats] = useState<string[]>([
    'Monday - Chowkbazar Beat',
    'Tuesday - Station Road Beat',
    'Wednesday - Sadar Road Beat',
    'Thursday - Newmarket Beat',
    'Friday - Central Bazar Beat',
    'Saturday - College Road Beat',
    'Sunday - Bypass Road Beat'
  ]);
  const [beatsList, setBeatsList] = useState<Beat[]>([
    { name: 'Monday - Chowkbazar Beat', day: 'Monday', shopId: 'global' },
    { name: 'Tuesday - Station Road Beat', day: 'Tuesday', shopId: 'global' },
    { name: 'Wednesday - Sadar Road Beat', day: 'Wednesday', shopId: 'global' },
    { name: 'Thursday - Newmarket Beat', day: 'Thursday', shopId: 'global' },
    { name: 'Friday - Central Bazar Beat', day: 'Friday', shopId: 'global' },
    { name: 'Saturday - College Road Beat', day: 'Saturday', shopId: 'global' },
    { name: 'Sunday - Bypass Road Beat', day: 'Sunday', shopId: 'global' }
  ]);
  const [newBeatName, setNewBeatName] = useState('');
  const [newBeatDay, setNewBeatDay] = useState('Monday');

  // --- SR Portal and Order Cutting States ---
  const [orders, setOrders] = useState<Order[]>([]);
  const [simulatedSr, setSimulatedSr] = useState<Staff | null>(null);
  const [selectedRetailerForOrder, setSelectedRetailerForOrder] = useState<Retailer | null>(null);
  const [orderCart, setOrderCart] = useState<OrderItem[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [loadSheetDate, setLoadSheetDate] = useState(new Date().toISOString().split('T')[0]);
  const [isClosingOrders, setIsClosingOrders] = useState(false);
  const [analyticsTimeFrame, setAnalyticsTimeFrame] = useState<'weekly' | 'monthly'>('monthly');
  const [analyticsSelectedCompany, setAnalyticsSelectedCompany] = useState<string>('');
  
  // Under-rate pricing state during order cutting
  const [customPrices, setCustomPrices] = useState<{[productId_unit: string]: number}>({});
  const [searchQuery, setSearchQuery] = useState('');

  // --- Trade Scheme & Due Ledger & Company Claims states ---
  const [tradeSchemes, setTradeSchemes] = useState<TradeScheme[]>([]);
  const [dueLedgerEntries, setDueLedgerEntries] = useState<any[]>([]);
  const [companyClaimRegister, setCompanyClaimRegister] = useState<any[]>([]);

  // DSR cash collected state during delivery
  const [dsrCashCollected, setDsrCashCollected] = useState<string>('');
  
  // UI helper states for Due Collection modal/inline form
  const [selectedRetailerForDueCollect, setSelectedRetailerForDueCollect] = useState<Retailer | null>(null);
  const [dueCollectionAmount, setDueCollectionAmount] = useState<string>('');
  const [dueCollectionNote, setDueCollectionNote] = useState<string>('');
  const [dueCollectionMethod, setDueCollectionMethod] = useState<'Cash' | 'bKash' | 'Bank'>('Cash');
  const [isSavingDueCollect, setIsSavingDueCollect] = useState(false);
  const [showLedgerHistoryForRetailer, setShowLedgerHistoryForRetailer] = useState<Retailer | null>(null);

  // UI helper states for Trade Scheme creation
  const [schemeProductId, setSchemeProductId] = useState<string>('');
  const [schemeUnit, setSchemeUnit] = useState<'carton' | 'box' | 'dozen' | 'piece'>('carton');
  const [schemeBuyQty, setSchemeBuyQty] = useState<string>('');
  const [schemeFreeQty, setSchemeFreeQty] = useState<string>('');
  const [isSavingScheme, setIsSavingScheme] = useState(false);

  // UI helper states for Company Claim register
  const [selectedCompanyForClaimForm, setSelectedCompanyForClaimForm] = useState<string>('');
  const [companyClaimAmount, setCompanyClaimAmount] = useState<string>('');
  const [companyClaimType, setCompanyClaimType] = useState<'Claim Filed' | 'Refund Received'>('Claim Filed');
  const [companyClaimNote, setCompanyClaimNote] = useState<string>('');
  const [isSavingCompanyClaim, setIsSavingCompanyClaim] = useState(false);

  const currentSrLoadSheet = useMemo(() => {
    if (!simulatedSr) return [];
    const todayStr = loadSheetDate;
    const targetOrders = orders.filter(
      o => o.srId === simulatedSr.id && o.createdAt.startsWith(todayStr)
    );
    
    const map: { [key: string]: {
      productId: string;
      productName: string;
      companyName: string;
      totalPcs: number;
      breakdown: { retailerName: string; qtyStr: string; pcs: number }[];
    } } = {};

    targetOrders.forEach(order => {
      order.items.forEach(item => {
        if (!map[item.productId]) {
          map[item.productId] = {
            productId: item.productId,
            productName: item.productName,
            companyName: order.companyName,
            totalPcs: 0,
            breakdown: []
          };
        }

        const qtyLabel = `${item.quantity} ${
          item.unit === 'carton' ? (isBn ? 'কার্টন' : 'Carton') :
          item.unit === 'box' ? (isBn ? 'বক্স' : 'Box') :
          item.unit === 'dozen' ? (isBn ? 'ডজন' : 'Dozen') :
          (isBn ? 'পিস' : 'Piece')
        }`;
        
        const prodObj = products.find(p => p.id === item.productId);
        let pcs = item.quantity;
        if (item.unit === 'carton') {
          pcs = item.quantity * (prodObj?.cartonCapacity || 100);
        } else if (item.unit === 'box') {
          pcs = item.quantity * (prodObj?.boxCapacity || 24);
        } else if (item.unit === 'dozen') {
          pcs = item.quantity * 12;
        }

        map[item.productId].totalPcs += pcs;
        map[item.productId].breakdown.push({
          retailerName: order.retailerName,
          qtyStr: qtyLabel,
          pcs
        });
      });
    });

    return Object.values(map);
  }, [orders, simulatedSr, loadSheetDate, products, isBn]);

  const analyticsData = useMemo(() => {
    const limitDays = analyticsTimeFrame === 'weekly' ? 7 : 30;
    const limitTime = Date.now() - limitDays * 24 * 60 * 60 * 1000;
    const filteredOrders = orders.filter(o => {
      if (!o.createdAt) return false;
      const orderTime = new Date(o.createdAt).getTime();
      return orderTime >= limitTime;
    });

    // 1. Calculate SR performance
    const srPerformanceMap: { [id: string]: {
      id: string;
      name: string;
      mappedCompany: string;
      totalSales: number;
      orderCount: number;
      uniqueShops: Set<string>;
    } } = {};

    staff.filter(s => s.role === 'SR').forEach(sr => {
      srPerformanceMap[sr.id] = {
        id: sr.id,
        name: sr.name,
        mappedCompany: sr.mappedCompany || 'Global',
        totalSales: 0,
        orderCount: 0,
        uniqueShops: new Set<string>()
      };
    });

    filteredOrders.forEach(order => {
      if (srPerformanceMap[order.srId]) {
        srPerformanceMap[order.srId].totalSales += order.totalAmount;
        srPerformanceMap[order.srId].orderCount += 1;
        srPerformanceMap[order.srId].uniqueShops.add(order.retailerId);
      }
    });

    const srPerformanceList = Object.values(srPerformanceMap).map(sr => ({
      ...sr,
      uniqueShopsCount: sr.uniqueShops.size,
      avgOrderValue: sr.orderCount > 0 ? sr.totalSales / sr.orderCount : 0
    }));

    // Sort by sales descending
    srPerformanceList.sort((a, b) => b.totalSales - a.totalSales);

    // 2. Calculate top-selling items per company
    const productSalesMap: { [productId: string]: {
      productId: string;
      productName: string;
      companyName: string;
      totalQty: number;
      totalRevenue: number;
    } } = {};

    filteredOrders.forEach(order => {
      order.items.forEach(item => {
        if (!productSalesMap[item.productId]) {
          productSalesMap[item.productId] = {
            productId: item.productId,
            productName: item.productName,
            companyName: order.companyName || 'Global',
            totalQty: 0,
            totalRevenue: 0
          };
        }
        productSalesMap[item.productId].totalQty += item.quantity;
        productSalesMap[item.productId].totalRevenue += item.totalPrice;
      });
    });

    const companyProductSales: { [company: string]: typeof productSalesMap[string][] } = {};
    Object.values(productSalesMap).forEach(item => {
      const compName = item.companyName;
      if (!companyProductSales[compName]) {
        companyProductSales[compName] = [];
      }
      companyProductSales[compName].push(item);
    });

    // Sort products inside each company by revenue descending
    Object.keys(companyProductSales).forEach(company => {
      companyProductSales[company].sort((a, b) => b.totalRevenue - a.totalRevenue);
    });

    // Calculate company total sales
    const companyTotalsList = Object.keys(companyProductSales).map(companyName => {
      const totalRevenue = companyProductSales[companyName].reduce((sum, item) => sum + item.totalRevenue, 0);
      return {
        name: companyName,
        revenue: totalRevenue
      };
    }).sort((a, b) => b.revenue - a.revenue); // sort ascending for horizontal chart or descending for bar chart

    return {
      srPerformance: srPerformanceList,
      companyProducts: companyProductSales,
      allProductsSold: Object.values(productSalesMap).sort((a, b) => b.totalRevenue - a.totalRevenue),
      companyTotals: companyTotalsList,
      filteredOrdersCount: filteredOrders.length,
      totalRevenueSum: filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0)
    };
  }, [orders, staff, analyticsTimeFrame]);

  // Sync Staff, Retailers, Orders, Beats with Firestore
  useEffect(() => {
    if (!user?.shopId) return;
    
    // Sync Staff
    const qStaff = query(collection(db, 'dealership_staff'), where('shopId', '==', user.shopId));
    const unsubStaff = onSnapshot(qStaff, (snapshot) => {
      const list: Staff[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Staff);
      });
      if (list.length > 0) setStaff(list);
    });

    // Sync Retailers
    const qRetailer = query(collection(db, 'dealership_retailers'), where('shopId', '==', user.shopId));
    const unsubRetailers = onSnapshot(qRetailer, (snapshot) => {
      const list: Retailer[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Retailer);
      });
      if (list.length > 0) setRetailers(list);
    });

    // Sync Orders
    const qOrders = query(collection(db, 'dealership_orders'), where('shopId', '==', user.shopId));
    const unsubOrders = onSnapshot(qOrders, (snapshot) => {
      const list: Order[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Order);
      });
      // Sort orders descending
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setOrders(list);
    });

    // Sync Beats
    const qBeats = query(collection(db, 'dealership_beats'), where('shopId', '==', user.shopId));
    const unsubBeats = onSnapshot(qBeats, (snapshot) => {
      const list: Beat[] = [];
      const nameList: string[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          name: data.name,
          day: data.day || 'Monday',
          shopId: data.shopId
        });
        nameList.push(data.name);
      });
      if (list.length > 0) {
        setBeatsList(list);
        setBeats(nameList);
      } else {
        const defaults = [
          { name: 'Monday - Chowkbazar Beat', day: 'Monday', shopId: user.shopId || 'global' },
          { name: 'Tuesday - Station Road Beat', day: 'Tuesday', shopId: user.shopId || 'global' },
          { name: 'Wednesday - Sadar Road Beat', day: 'Wednesday', shopId: user.shopId || 'global' },
          { name: 'Thursday - Newmarket Beat', day: 'Thursday', shopId: user.shopId || 'global' },
          { name: 'Friday - Central Bazar Beat', day: 'Friday', shopId: user.shopId || 'global' },
          { name: 'Saturday - College Road Beat', day: 'Saturday', shopId: user.shopId || 'global' },
          { name: 'Sunday - Bypass Road Beat', day: 'Sunday', shopId: user.shopId || 'global' }
        ];
        setBeatsList(defaults);
        setBeats(defaults.map(d => d.name));
      }
    });

    // Sync Claims (Refunds & Damages)
    const qClaims = query(collection(db, 'dealership_claims'), where('shopId', '==', user.shopId));
    const unsubClaims = onSnapshot(qClaims, (snapshot) => {
      const list: Claim[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Claim);
      });
      // Sort claims descending
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setClaims(list);
    });

    // Sync Company Damage Ledger
    const qDamageLedger = query(collection(db, 'dealership_company_damage_ledger'), where('shopId', '==', user.shopId));
    const unsubDamageLedger = onSnapshot(qDamageLedger, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setCompanyDamageLedger(list);
    });

    // Sync Trade Schemes
    const qSchemes = query(collection(db, 'dealership_trade_schemes'), where('shopId', '==', user.shopId));
    const unsubSchemes = onSnapshot(qSchemes, (snapshot) => {
      const list: TradeScheme[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as TradeScheme);
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setTradeSchemes(list);
    });

    // Sync Due Ledger
    const qDueLedger = query(collection(db, 'dealership_due_ledger'), where('shopId', '==', user.shopId));
    const unsubDueLedger = onSnapshot(qDueLedger, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setDueLedgerEntries(list);
    });

    // Sync Company Claim Register
    const qCompanyClaims = query(collection(db, 'dealership_company_claim_register'), where('shopId', '==', user.shopId));
    const unsubCompanyClaims = onSnapshot(qCompanyClaims, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setCompanyClaimRegister(list);
    });

    return () => {
      unsubStaff();
      unsubRetailers();
      unsubOrders();
      unsubBeats();
      unsubClaims();
      unsubDamageLedger();
      unsubSchemes();
      unsubDueLedger();
      unsubCompanyClaims();
    };
  }, [user?.shopId]);

  // --- Company Profiles State ---
  const [companies, setCompanies] = useState<Company[]>([
    { id: 'c_1', name: 'Unilever Bangladesh', phone: '09612345678', address: 'Tejgaon I/A, Dhaka' },
    { id: 'c_2', name: 'Pran-RFL Group', phone: '02222222222', address: 'Pran RFL Center, Middle Badda, Dhaka' },
    { id: 'c_3', name: 'Square Consumer Products', phone: '029859007', address: 'Rupayan Centre, Mohakhali, Dhaka' },
    { id: 'c_4', name: 'Akij Food & Beverage Ltd.', phone: '01713063000', address: 'Akij House, Tejgaon, Dhaka' }
  ]);

  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyPhone, setNewCompanyPhone] = useState('');
  const [newCompanyAddress, setNewCompanyAddress] = useState('');
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  // --- Multi-Unit Inventory State ---
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [selectedFilterCompany, setSelectedFilterCompany] = useState<string>('');
  
  // Add / Edit Product Form State
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productCompany, setProductCompany] = useState('');
  const [productCost, setProductCost] = useState('');
  const [productRetail, setProductRetail] = useState('');
  const [productStock, setProductStock] = useState('');
  
  const [cartonPrice, setCartonPrice] = useState('');
  const [cartonBarcode, setCartonBarcode] = useState('');
  const [cartonCapacity, setCartonCapacity] = useState('100');
  
  const [boxPrice, setBoxPrice] = useState('');
  const [boxBarcode, setBoxBarcode] = useState('');
  const [boxCapacity, setBoxCapacity] = useState('24');
  
  const [dozenPrice, setDozenPrice] = useState('');
  const [dozenBarcode, setDozenBarcode] = useState('');
  
  const [piecePrice, setPiecePrice] = useState('');
  const [pieceBarcode, setPieceBarcode] = useState('');
  
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Sync companies with Firestore
  useEffect(() => {
    if (!user?.shopId) return;
    const q = query(collection(db, 'dealership_companies'), where('shopId', '==', user.shopId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Company[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Company);
      });
      if (list.length > 0) {
        setCompanies(list);
      }
    });
    return () => unsubscribe();
  }, [user?.shopId]);

  // --- Mock/Persistent Database states ---
  const [dealers, setDealers] = useState<Dealer[]>([
    { id: 'dlr_1', name: 'Al-Madina Enterprise', phone: '01712345678', company: 'Madina Builders', area: 'Dhaka Sadar', creditLimit: 250000, currentBalance: 75000 },
    { id: 'dlr_2', name: 'Jamuna Telecom', phone: '01987654321', company: 'Jamuna Group', area: 'Chittagong GEC', creditLimit: 500000, currentBalance: 120000 },
    { id: 'dlr_3', name: 'Kushtia Wholesale Store', phone: '01855667788', company: 'Kushtia Dist', area: 'Kushtia Sadar', creditLimit: 100000, currentBalance: 95000 }
  ]);

  const [agents, setAgents] = useState<Agent[]>([
    { id: 'agt_1', name: 'Karim Ahmed', phone: '01890112233', area: 'Dhaka Sadar', commissionRate: 3.5 },
    { id: 'agt_2', name: 'Suhail Mahmud', phone: '01766112233', area: 'Chittagong GEC', commissionRate: 2.5 },
    { id: 'agt_3', name: 'Rafique Uddin', phone: '01511223344', area: 'Kushtia Sadar', commissionRate: 4.0 }
  ]);

  const [challans, setChallans] = useState<Challan[]>([
    {
      id: 'ch_1',
      challanNo: 'CH-9921',
      dealerName: 'Al-Madina Enterprise',
      dealerPhone: '01712345678',
      agentName: 'Karim Ahmed',
      area: 'Dhaka Sadar',
      items: [
        { productId: 'p1', productName: 'Premium Smartphone Black', qty: 25, price: 18500 }
      ],
      status: 'Dispatched',
      createdAt: '2026-06-15T10:30:00.000Z'
    },
    {
      id: 'ch_2',
      challanNo: 'CH-9922',
      dealerName: 'Jamuna Telecom',
      dealerPhone: '01987654321',
      agentName: 'Suhail Mahmud',
      area: 'Chittagong GEC',
      items: [
        { productId: 'p2', productName: 'Universal USB-C Wall Charger', qty: 100, price: 450 }
      ],
      status: 'Delivered',
      createdAt: '2026-06-16T14:45:00.000Z'
    }
  ]);

  // Dynamic Ledger State Entries
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([
    { id: 'led_1', dealerId: 'dlr_1', type: 'debit', description: 'Challan CH-9921 Goods Dispatch', amount: 462500, date: '2026-06-15' },
    { id: 'led_2', dealerId: 'dlr_1', type: 'credit', description: 'Bkash Business Outward Payment', amount: 387500, date: '2026-06-16' },
    { id: 'led_3', dealerId: 'dlr_2', type: 'debit', description: 'Challan CH-9922 Delivered spare parts', amount: 45000, date: '2026-06-16' }
  ]);

  // --- Handlers for Company Profiles ---
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      setNotification({ message: isBn ? 'কোম্পানির নাম লিখুন' : 'Please provide company name', type: 'error' });
      return;
    }
    setIsSavingCompany(true);
    try {
      const companyPayload = {
        name: newCompanyName.trim(),
        phone: newCompanyPhone.trim(),
        address: newCompanyAddress.trim(),
        shopId: user?.shopId || 'global',
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'dealership_companies'), companyPayload);
      setNotification({ message: isBn ? 'কোম্পানি প্রোফাইল সফলভাবে তৈরি হয়েছে' : 'Company profile added successfully', type: 'success' });
      setNewCompanyName('');
      setNewCompanyPhone('');
      setNewCompanyAddress('');
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!window.confirm(isBn ? 'আপনি কি নিশ্চিত যে এই কোম্পানিটি মুছে ফেলতে চান?' : 'Are you sure you want to delete this company?')) return;
    try {
      await deleteDoc(doc(db, 'dealership_companies', id));
      setNotification({ message: isBn ? 'কোম্পানি মুছে ফেলা হয়েছে' : 'Company deleted successfully', type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  // --- Handlers for Staff (SR / DSR / Delivery) ---
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffPhone.trim()) {
      setNotification({ message: isBn ? 'নাম ও ফোন নাম্বার দিন' : 'Name and phone are required', type: 'error' });
      return;
    }
    setIsSavingStaff(true);
    try {
      const payload = {
        name: newStaffName.trim(),
        phone: newStaffPhone.trim(),
        role: newStaffRole,
        mappedCompany: newStaffCompany || null,
        shopId: user?.shopId || 'global',
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'dealership_staff'), payload);
      setNotification({ message: isBn ? 'স্টাফ সফলভাবে যোগ করা হয়েছে' : 'Staff added successfully', type: 'success' });
      setNewStaffName('');
      setNewStaffPhone('');
      setNewStaffCompany('');
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingStaff(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!window.confirm(isBn ? 'আপনি কি নিশ্চিত?' : 'Are you sure?')) return;
    try {
      await deleteDoc(doc(db, 'dealership_staff', id));
      setNotification({ message: isBn ? 'স্টাফ মুছে ফেলা হয়েছে' : 'Staff deleted successfully', type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  // --- Handlers for Retailers Registry ---
  const handleSaveRetailer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRetailerName.trim() || !newRetailerPhone.trim() || !newRetailerArea.trim() || !newRetailerBeat) {
      setNotification({ message: isBn ? 'সবগুলো লাল চিহ্নিত তথ্য আবশ্যক' : 'All required fields must be filled', type: 'error' });
      return;
    }
    setIsSavingRetailer(true);
    try {
      // Mock coordinates if empty
      const finalGps = newRetailerGps.trim() || `${(23.72 + Math.random() * 0.05).toFixed(4)}, ${(90.39 + Math.random() * 0.05).toFixed(4)}`;
      const finalImg = newRetailerImageUrl.trim() || 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=300&q=80';

      const payload = {
        name: newRetailerName.trim(),
        ownerName: newRetailerOwner.trim(),
        phone: newRetailerPhone.trim(),
        area: newRetailerArea.trim(),
        beat: newRetailerBeat,
        gps: finalGps,
        imageUrl: finalImg,
        previousDue: parseFloat(newRetailerDue) || 0,
        shopId: user?.shopId || 'global',
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'dealership_retailers'), payload);
      setNotification({ message: isBn ? 'রিটেইলার সফলভাবে নিবন্ধিত হয়েছে' : 'Retailer registered successfully', type: 'success' });
      setNewRetailerName('');
      setNewRetailerOwner('');
      setNewRetailerPhone('');
      setNewRetailerArea('');
      setNewRetailerBeat('');
      setNewRetailerGps('');
      setNewRetailerImageUrl('');
      setNewRetailerDue('0');
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingRetailer(false);
    }
  };

  const handleDeleteRetailer = async (id: string) => {
    if (!window.confirm(isBn ? 'আপনি কি নিশ্চিত?' : 'Are you sure?')) return;
    try {
      await deleteDoc(doc(db, 'dealership_retailers', id));
      setNotification({ message: isBn ? 'রিটেইলার মুছে ফেলা হয়েছে' : 'Retailer deleted successfully', type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  // --- Handlers for Beats/Routes ---
  const handleAddBeat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBeatName.trim()) return;
    try {
      await addDoc(collection(db, 'dealership_beats'), {
        name: newBeatName.trim(),
        day: newBeatDay,
        shopId: user?.shopId || 'global'
      });
      setNotification({ message: isBn ? 'নতুন বিট সফলভাবে যুক্ত হয়েছে' : 'New beat added successfully', type: 'success' });
      setNewBeatName('');
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleDeleteBeat = async (id: string) => {
    if (!id) return;
    if (!window.confirm(isBn ? 'আপনি কি নিশ্চিত যে এই রুট/বিটটি মুছে ফেলতে চান?' : 'Are you sure you want to delete this route/beat?')) return;
    try {
      await deleteDoc(doc(db, 'dealership_beats', id));
      setNotification({ message: isBn ? 'রুট/বিট সফলভাবে মুছে ফেলা হয়েছে' : 'Route/Beat deleted successfully', type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  // --- Handlers for SR Order Cutting & Under-Rate pricing ---
  const handleAddToOrderCart = (product: Product, unit: 'carton' | 'box' | 'dozen' | 'piece') => {
    if (!selectedRetailerForOrder) {
      setNotification({ message: isBn ? 'প্রথমে রিটেইলার সিলেক্ট করুন' : 'Please select a retailer first', type: 'error' });
      return;
    }

    // Determine standard/default unit price
    let defaultPrice = product.price || 0;
    if (unit === 'carton') {
      defaultPrice = product.cartonPrice || (defaultPrice * (product.cartonCapacity || 100));
    } else if (unit === 'box') {
      defaultPrice = product.boxPrice || (defaultPrice * (product.boxCapacity || 24));
    } else if (unit === 'dozen') {
      defaultPrice = product.dozenPrice || (defaultPrice * 12);
    } else if (unit === 'piece') {
      defaultPrice = product.piecePrice || defaultPrice;
    }

    // Check if item already exists in cart with same unit
    const existingIndex = orderCart.findIndex(item => item.productId === product.id && item.unit === unit);
    if (existingIndex > -1) {
      const updated = [...orderCart];
      const item = updated[existingIndex];
      item.quantity += 1;
      item.totalPrice = item.quantity * item.unitPrice;
      setOrderCart(updated);
    } else {
      const newItem: OrderItem = {
        productId: product.id,
        productName: product.name,
        unit,
        quantity: 1,
        unitPrice: defaultPrice,
        totalPrice: defaultPrice
      };
      setOrderCart([...orderCart, newItem]);
    }
    setNotification({ message: isBn ? 'পণ্য যুক্ত হয়েছে' : 'Product added to cart', type: 'success' });
  };

  const handleUpdateCartItemQty = (productId: string, unit: string, qty: number) => {
    const updated = orderCart.map(item => {
      if (item.productId === productId && item.unit === unit) {
        const finalQty = Math.max(1, qty);
        return {
          ...item,
          quantity: finalQty,
          totalPrice: finalQty * item.unitPrice
        };
      }
      return item;
    });
    setOrderCart(updated);
  };

  const handleUpdateCartItemPrice = (productId: string, unit: string, price: number) => {
    const updated = orderCart.map(item => {
      if (item.productId === productId && item.unit === unit) {
        const finalPrice = Math.max(0, price);
        return {
          ...item,
          unitPrice: finalPrice,
          totalPrice: item.quantity * finalPrice
        };
      }
      return item;
    });
    setOrderCart(updated);
  };

  const handleRemoveFromOrderCart = (productId: string, unit: string) => {
    setOrderCart(orderCart.filter(item => !(item.productId === productId && item.unit === unit)));
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRetailerForOrder) {
      setNotification({ message: isBn ? 'দয়া করে রিটেইলার সিলেক্ট করুন' : 'Please select a retailer', type: 'error' });
      return;
    }
    if (!simulatedSr) {
      setNotification({ message: isBn ? 'দয়া করে অর্ডার সাবমিটকারী SR সিলেক্ট করুন' : 'Please select an SR staff', type: 'error' });
      return;
    }
    if (orderCart.length === 0) {
      setNotification({ message: isBn ? 'অর্ডার কার্ট খালি রয়েছে' : 'Cart is empty', type: 'error' });
      return;
    }

    setIsSavingOrder(true);
    const totalAmount = orderCart.reduce((sum, item) => sum + item.totalPrice, 0);

    try {
      // Automatically calculate and inject Trade Scheme benefits
      const finalItemsList: OrderItem[] = [];
      orderCart.forEach(item => {
        finalItemsList.push(item);
        
        // Find active trade scheme matching product & unit
        const scheme = tradeSchemes.find(s => s.productId === item.productId && s.unit === item.unit && s.isActive);
        if (scheme) {
          const freeCount = Math.floor(item.quantity / scheme.buyQty) * scheme.freeQty;
          if (freeCount > 0) {
            finalItemsList.push({
              productId: item.productId,
              productName: `${item.productName} (${isBn ? 'ফ্রি স্কিম' : 'Free Scheme'})`,
              unit: item.unit,
              quantity: freeCount,
              unitPrice: 0,
              totalPrice: 0
            });
          }
        }
      });

      const orderPayload = {
        retailerId: selectedRetailerForOrder.id,
        retailerName: selectedRetailerForOrder.name,
        retailerPhone: selectedRetailerForOrder.phone,
        beat: selectedRetailerForOrder.beat,
        srId: simulatedSr.id,
        srName: simulatedSr.name,
        companyName: simulatedSr.mappedCompany || 'Global',
        items: finalItemsList,
        totalAmount,
        status: 'Pending' as const,
        shopId: user?.shopId || 'global',
        createdAt: new Date().toISOString()
      };

      // 1. Save order inside Firestore
      const docRef = await addDoc(collection(db, 'dealership_orders'), orderPayload);

      // 2. Update Retailer previousDue dynamically
      const currentDue = selectedRetailerForOrder.previousDue || 0;
      const updatedDue = currentDue + totalAmount;
      await updateDoc(doc(db, 'dealership_retailers', selectedRetailerForOrder.id), {
        previousDue: updatedDue
      });

      // 2.5 Record Due Ledger Entry
      await addDoc(collection(db, 'dealership_due_ledger'), {
        retailerId: selectedRetailerForOrder.id,
        retailerName: selectedRetailerForOrder.name,
        amount: totalAmount,
        balance: updatedDue,
        type: 'Order Created',
        referenceId: docRef.id,
        note: isBn 
          ? `অর্ডার বুকিং #${docRef.id.substring(0, 8).toUpperCase()} (মোট মূল্য: ${currencySymbol}${totalAmount.toFixed(2)})` 
          : `Order Booking #${docRef.id.substring(0, 8).toUpperCase()} (Total: ${currencySymbol}${totalAmount.toFixed(2)})`,
        createdAt: new Date().toISOString(),
        shopId: user?.shopId || 'global'
      });

      // 3. Generate Thermal format string
      const border = "----------------------------------------";
      const doubleBorder = "========================================";
      const thermalMessage = `🧾 *SMART ORDER CUTTING SUMMARY*\n` +
        `🏢 *${settings?.name || "Distributor House"}*\n` +
        `${doubleBorder}\n` +
        `📅 *Date:* ${new Date().toLocaleDateString('en-GB')}  ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })}\n` +
        `🆔 *Order ID:* #${docRef.id.substring(0, 8).toUpperCase()}\n` +
        `👤 *Sales Rep:* ${simulatedSr.name}\n` +
        `🏪 *Store:* ${selectedRetailerForOrder.name} (${selectedRetailerForOrder.ownerName || 'Owner'})\n` +
        `📞 *Phone:* ${selectedRetailerForOrder.phone}\n` +
        `📍 *Beat:* ${selectedRetailerForOrder.beat}\n` +
        `${border}\n` +
        `🛍️ *ITEMS ORDERED:*\n` +
        orderCart.map((item, idx) => 
          `*${idx + 1}.* ${item.productName}\n` +
          `   ↳ ${item.quantity} ${item.unit} x ${currencySymbol}${item.unitPrice.toFixed(2)} = *${currencySymbol}${item.totalPrice.toFixed(2)}*`
        ).join('\n') + `\n` +
        `${border}\n` +
        `💵 *Order Total:* *${currencySymbol}${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}*\n` +
        `💳 *Prev Bokeya (Due):* ${currencySymbol}${currentDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n` +
        `📈 *Total Outstanding:* *${currencySymbol}${updatedDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}*\n` +
        `${doubleBorder}\n` +
        `💸 _Custom Under-rate adjustments included._\n` +
        `📦 _Deliveries dispatched via DSR logistics._\n` +
        `Powered by POS Sync Automation.`;

      // 4. Dispatch actual API WhatsApp trigger using custom proxy
      try {
        const cleanPhone = selectedRetailerForOrder.phone.replace(/[^\d]/g, '');
        const targetPhone = cleanPhone.startsWith('88') ? cleanPhone : '88' + cleanPhone;

        const response = await fetch('/api/gateways/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: user?.shopId || 'global',
            sale: {
              id: docRef.id,
              customerPhone: targetPhone,
              message: thermalMessage
            }
          })
        });

        if (response.ok) {
          setNotification({ message: isBn ? 'অর্ডার সফল এবং হোয়াটসঅ্যাপ থার্মাল নোটিফিকেশন পাঠানো হয়েছে!' : 'Order confirmed and thermal WhatsApp dispatch completed!', type: 'success' });
        } else {
          setNotification({ message: isBn ? 'অর্ডার সেভ হয়েছে, হোয়াটসঅ্যাপ ডেলিভারি ব্যর্থ হয়েছে (গেটওয়ে রিডাইরেক্ট কোড সক্রিয়)' : 'Order stored. WhatsApp dispatch queued.', type: 'info' });
        }
      } catch (err: any) {
        console.warn("Auto SMS/WA dispatch API warning:", err);
      }

      // Reset states
      setOrderCart([]);
      setSelectedRetailerForOrder(null);
      setNotification({ message: isBn ? 'অর্ডার সফলভাবে সাবমিট করা হয়েছে!' : 'Order submitted successfully!', type: 'success' });

    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleCloseSrOrders = async () => {
    if (!simulatedSr) return;
    const todayStr = loadSheetDate;
    const targetOrders = orders.filter(
      o => o.srId === simulatedSr.id && 
      o.createdAt.startsWith(todayStr) && 
      o.status === 'Pending'
    );

    if (targetOrders.length === 0) {
      setNotification({
        message: isBn 
          ? 'এই তারিখের জন্য কোনো পেন্ডিং অর্ডার নেই যা ক্লোজ করা যাবে।' 
          : 'No pending orders for this date to close.',
        type: 'info'
      });
      return;
    }

    if (!window.confirm(isBn 
      ? `আপনি কি নিশ্চিত যে ${targetOrders.length} টি পেন্ডিং অর্ডার ক্লোজ করে ডিসপ্যাচ করতে চান?` 
      : `Are you sure you want to close and dispatch ${targetOrders.length} pending orders?`
    )) return;

    setIsClosingOrders(true);
    try {
      for (const order of targetOrders) {
        await updateDoc(doc(db, 'dealership_orders', order.id), {
          status: 'Dispatched'
        });
      }
      setNotification({
        message: isBn 
          ? 'আজকের বুকিং সফলভাবে ক্লোজ করা হয়েছে এবং লোডিং চালান DSR-দের পাঠানো হয়েছে!' 
          : 'Today\'s bookings closed successfully & loaded for DSR delivery!',
        type: 'success'
      });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsClosingOrders(false);
    }
  };

  // --- Handlers for Retailer Due Ledger, Trade Schemes, & Company Claims (Phase 4) ---
  const handleCollectRetailerDue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRetailerForDueCollect) return;
    const amountVal = parseFloat(dueCollectionAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setNotification({ message: isBn ? "সঠিক পরিমাণ লিখুন" : "Provide a valid amount", type: 'error' });
      return;
    }
    setIsSavingDueCollect(true);
    try {
      const currentDue = selectedRetailerForDueCollect.previousDue || 0;
      const updatedDue = Math.max(0, currentDue - amountVal);
      
      // Update retailer outstanding due balance
      await updateDoc(doc(db, 'dealership_retailers', selectedRetailerForDueCollect.id), {
        previousDue: updatedDue
      });

      // Record due ledger entry in Firestore
      await addDoc(collection(db, 'dealership_due_ledger'), {
        retailerId: selectedRetailerForDueCollect.id,
        retailerName: selectedRetailerForDueCollect.name,
        amount: -amountVal,
        balance: updatedDue,
        type: 'Due Collection',
        note: dueCollectionNote.trim() || (isBn ? `বকেয়া আদায় (${dueCollectionMethod})` : `Due collection (${dueCollectionMethod})`),
        createdAt: new Date().toISOString(),
        shopId: user?.shopId || 'global'
      });

      setNotification({ message: isBn ? "বকেয়া আদায় সফলভাবে সম্পন্ন হয়েছে!" : "Due collected and recorded successfully!", type: 'success' });
      
      // Reset collection states
      setDueCollectionAmount('');
      setDueCollectionNote('');
      setSelectedRetailerForDueCollect(null);
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingDueCollect(false);
    }
  };

  const handleSaveTradeScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schemeProductId) {
      setNotification({ message: isBn ? "পণ্য নির্বাচন করুন" : "Select a product", type: 'error' });
      return;
    }
    const buyQtyVal = parseInt(schemeBuyQty);
    const freeQtyVal = parseInt(schemeFreeQty);
    if (isNaN(buyQtyVal) || buyQtyVal <= 0 || isNaN(freeQtyVal) || freeQtyVal <= 0) {
      setNotification({ message: isBn ? "সঠিক পরিমাণ লিখুন" : "Provide valid quantities", type: 'error' });
      return;
    }
    const prod = products.find(p => p.id === schemeProductId);
    if (!prod) return;

    setIsSavingScheme(true);
    try {
      await addDoc(collection(db, 'dealership_trade_schemes'), {
        productId: schemeProductId,
        productName: prod.name,
        unit: schemeUnit,
        buyQty: buyQtyVal,
        freeQty: freeQtyVal,
        isActive: true,
        createdAt: new Date().toISOString(),
        shopId: user?.shopId || 'global'
      });
      setNotification({ message: isBn ? "নতুন ট্রেড স্কিম সফলভাবে তৈরি হয়েছে!" : "Trade scheme created successfully!", type: 'success' });
      setSchemeProductId('');
      setSchemeBuyQty('');
      setSchemeFreeQty('');
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingScheme(false);
    }
  };

  const handleSaveCompanyClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyForClaimForm) {
      setNotification({ message: isBn ? "কোম্পানি নির্বাচন করুন" : "Select a company", type: 'error' });
      return;
    }
    const amountVal = parseFloat(companyClaimAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setNotification({ message: isBn ? "সঠিক পরিমাণ লিখুন" : "Provide a valid amount", type: 'error' });
      return;
    }

    setIsSavingCompanyClaim(true);
    try {
      await addDoc(collection(db, 'dealership_company_claim_register'), {
        companyName: selectedCompanyForClaimForm,
        amount: amountVal,
        type: companyClaimType,
        note: companyClaimNote.trim(),
        createdAt: new Date().toISOString(),
        shopId: user?.shopId || 'global'
      });
      setNotification({ message: isBn ? "কোম্পানি ক্লেম এন্ট্রি সফল হয়েছে!" : "Company claim registered successfully!", type: 'success' });
      setCompanyClaimAmount('');
      setCompanyClaimNote('');
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingCompanyClaim(false);
    }
  };

  // --- Handlers for DSR (Delivery Sales Rep) & Claims ---
  const handleDsrSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForDelivery) {
      setNotification({ message: isBn ? 'অর্ডার সিলেক্ট করুন' : 'Please select an order', type: 'error' });
      return;
    }
    if (!simulatedDsr) {
      setNotification({ message: isBn ? 'DSR স্টাফ সিলেক্ট করুন' : 'Please select a DSR', type: 'error' });
      return;
    }

    setIsSavingClaim(true);
    try {
      const order = selectedOrderForDelivery;
      
      // Calculate total refund val first to know final paid amount
      const totalRefundVal = order.items.reduce((sum, item) => {
        const key = `${order.id}-${item.productId}-${item.unit}`;
        const qty = refundQty[key] || 0;
        return sum + (qty * item.unitPrice);
      }, 0);
      const totalCollectedDamageVal = tempDamageCollections.reduce((sum, d) => sum + (d.quantity * d.unitPrice), 0);
      const finalPaidAmount = order.totalAmount - totalRefundVal;
      
      // Determine cash collected
      const actualCashPaid = dsrCashCollected === '' ? finalPaidAmount : parseFloat(dsrCashCollected) || 0;

      // 1. Process any partial refunds/rejections
      let hasRefunds = false;
      for (const item of order.items) {
        const key = `${order.id}-${item.productId}-${item.unit}`;
        const rejectedNum = refundQty[key] || 0;
        if (rejectedNum > 0) {
          hasRefunds = true;
          // Create return claim in Firestore
          const claimPayload: Omit<Claim, 'id'> = {
            orderId: order.id,
            retailerId: order.retailerId,
            retailerName: order.retailerName,
            productId: item.productId,
            productName: item.productName,
            unit: item.unit,
            quantity: rejectedNum,
            unitPrice: item.unitPrice,
            totalPrice: rejectedNum * item.unitPrice,
            type: 'Refund',
            status: 'Pending Verification',
            dsrName: simulatedDsr.name,
            companyName: order.companyName || 'Global',
            shopId: user?.shopId || 'global',
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, 'dealership_claims'), claimPayload);
        }
      }

      // 2. Process any damage collections
      for (const dmg of tempDamageCollections) {
        const claimPayload: Omit<Claim, 'id'> = {
          orderId: order.id,
          retailerId: order.retailerId,
          retailerName: order.retailerName,
          productId: dmg.productId,
          productName: dmg.productName,
          unit: dmg.unit,
          quantity: dmg.quantity,
          unitPrice: dmg.unitPrice,
          totalPrice: dmg.quantity * dmg.unitPrice,
          type: 'Damage',
          status: 'Pending Verification',
          dsrName: simulatedDsr.name,
          companyName: order.companyName || 'Global',
          shopId: user?.shopId || 'global',
          createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, 'dealership_claims'), claimPayload);
      }

      // 3. Mark the Order as Delivered / Completed by DSR
      await updateDoc(doc(db, 'dealership_orders', order.id), {
        status: 'Delivered'
      });

      // 4. Update Retailer Outstanding Due & Ledger
      const retailerId = order.retailerId;
      const matchingRetailer = retailers.find(r => r.id === retailerId);
      if (matchingRetailer) {
        const currentDue = matchingRetailer.previousDue || 0;
        const totalDeduction = totalRefundVal + actualCashPaid;
        const updatedDue = Math.max(0, currentDue - totalDeduction);
        
        await updateDoc(doc(db, 'dealership_retailers', retailerId), {
          previousDue: updatedDue
        });

        // Add due ledger entry
        await addDoc(collection(db, 'dealership_due_ledger'), {
          retailerId: retailerId,
          retailerName: matchingRetailer.name,
          amount: -totalDeduction,
          balance: updatedDue,
          type: 'Delivery cash collected',
          referenceId: order.id,
          note: isBn 
            ? `ডেলিভারি ক্যাশ আদায়: ${currencySymbol}${actualCashPaid.toFixed(2)}, পণ্য ফেরত: ${currencySymbol}${totalRefundVal.toFixed(2)}`
            : `Delivery cash collected: ${currencySymbol}${actualCashPaid.toFixed(2)}, returns: ${currencySymbol}${totalRefundVal.toFixed(2)}`,
          createdAt: new Date().toISOString(),
          shopId: user?.shopId || 'global'
        });
      }

      // 5. Send WhatsApp thermal alert to retailer
      const thermalMessage = `🚚 *DSR DELIVERY DISPATCH RECEIPT*\n` +
        `🏢 *${settings?.name || "Distributor House"}*\n` +
        `========================================\n` +
        `📅 *Date:* ${new Date().toLocaleDateString('en-GB')}\n` +
        `🆔 *Order Reference:* #${order.id.substring(0, 8).toUpperCase()}\n` +
        `👤 *DSR Agent:* ${simulatedDsr.name}\n` +
        `🏪 *Retail Outlet:* ${order.retailerName}\n` +
        `----------------------------------------\n` +
        `💵 *Original Invoice:* ${currencySymbol}${order.totalAmount.toFixed(2)}\n` +
        `↩️ *Delivery Rejection (Refund):* -${currencySymbol}${totalRefundVal.toFixed(2)}\n` +
        `📦 *Collected Damages:* ${currencySymbol}${totalCollectedDamageVal.toFixed(2)}\n` +
        `💰 *Cash Collected:* *${currencySymbol}${actualCashPaid.toFixed(2)}*\n` +
        `----------------------------------------\n` +
        `⚠️ _Refund items & collected damages are subject to physical warehouse keeper verification._\n` +
        `Thank you for doing business with us!`;

      try {
        const cleanPhone = order.retailerPhone.replace(/[^\d]/g, '');
        const targetPhone = cleanPhone.startsWith('88') ? cleanPhone : '88' + cleanPhone;

        await fetch('/api/gateways/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopId: user?.shopId || 'global',
            sale: {
              id: order.id,
              customerPhone: targetPhone,
              message: thermalMessage
            }
          })
        });
      } catch (err) {
        console.warn("DSR invoice dispatch warning:", err);
      }

      setNotification({
        message: isBn 
          ? 'ডেলিভারি সম্পন্ন হয়েছে! রিফান্ড/ড্যামেজ এন্ট্রি এবং বকেয়া সমন্বয় সম্পন্ন হয়েছে।' 
          : 'Delivery completed! Refund/damage entry registered and due balances adjusted successfully.', 
        type: 'success'
      });

      // Clear DSR states
      setSelectedOrderForDelivery(null);
      setRefundQty({});
      setTempDamageCollections([]);
      setDsrCashCollected('');
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingClaim(false);
    }
  };

  const handleApproveClaim = async (claim: Claim) => {
    try {
      // 1. Fetch matching product to calculate capacities & update stock
      const product = products.find(p => p.id === claim.productId);
      if (!product) {
        setNotification({ message: isBn ? 'পণ্যটি ইনভেন্টরিতে পাওয়া যায়নি' : 'Product not found in inventory', type: 'error' });
        return;
      }

      // Convert unit quantities back to pieces if main stock is in pieces
      let qtyInPcs = claim.quantity;
      if (claim.unit === 'carton') {
        qtyInPcs = claim.quantity * (product.cartonCapacity || 100);
      } else if (claim.unit === 'box') {
        qtyInPcs = claim.quantity * (product.boxCapacity || 24);
      } else if (claim.unit === 'dozen') {
        qtyInPcs = claim.quantity * 12;
      }

      if (claim.type === 'Refund') {
        // Increment product main stock
        const newStock = (product.stock || 0) + qtyInPcs;
        await updateDoc(doc(db, 'products', claim.productId), {
          stock: newStock
        });

        // Update corresponding Order totalAmount and Retailer previousDue
        const orderRef = doc(db, 'dealership_orders', claim.orderId);
        // Let's retrieve latest order state
        const matchingOrder = orders.find(o => o.id === claim.orderId);
        if (matchingOrder) {
          const newOrderTotal = Math.max(0, matchingOrder.totalAmount - claim.totalPrice);
          await updateDoc(orderRef, {
            totalAmount: newOrderTotal
          });
        }

        // Update Retailer outstanding
        const retailerRef = doc(db, 'dealership_retailers', claim.retailerId);
        const matchingRetailer = retailers.find(r => r.id === claim.retailerId);
        if (matchingRetailer) {
          const newDue = Math.max(0, (matchingRetailer.previousDue || 0) - claim.totalPrice);
          await updateDoc(retailerRef, {
            previousDue: newDue
          });
        }

      } else if (claim.type === 'Damage') {
        // Increment product damageStock
        const currentDmgStock = product.damageStock || 0;
        const newDmgStock = currentDmgStock + qtyInPcs;
        await updateDoc(doc(db, 'products', claim.productId), {
          damageStock: newDmgStock
        });

        // Add to company damage ledger in Firestore
        const ledgerPayload = {
          companyName: claim.companyName || product.companyName || 'Global',
          productId: claim.productId,
          productName: claim.productName,
          quantity: claim.quantity,
          unit: claim.unit,
          totalValue: claim.totalPrice,
          dsrName: claim.dsrName,
          retailerName: claim.retailerName,
          shopId: user?.shopId || 'global',
          createdAt: new Date().toISOString()
        };
        await addDoc(collection(db, 'dealership_company_damage_ledger'), ledgerPayload);

        // Also adjust retailer outstanding since dealer compensated them for damaged products!
        const retailerRef = doc(db, 'dealership_retailers', claim.retailerId);
        const matchingRetailer = retailers.find(r => r.id === claim.retailerId);
        if (matchingRetailer) {
          const newDue = Math.max(0, (matchingRetailer.previousDue || 0) - claim.totalPrice);
          await updateDoc(retailerRef, {
            previousDue: newDue
          });
        }
      }

      // Update claim status to Approved
      await updateDoc(doc(db, 'dealership_claims', claim.id), {
        status: 'Approved'
      });

      setNotification({
        message: isBn 
          ? 'ক্লেম সফলভাবে অনুমোদিত এবং অ্যাকাউন্টস/ইনভেন্টরি অ্যাডজাস্ট করা হয়েছে!' 
          : 'Claim approved successfully! Accounts and stocks fully adjusted.',
        type: 'success'
      });

    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleRejectClaim = async (claimId: string) => {
    if (!window.confirm(isBn ? 'আপনি কি নিশ্চিত যে এই ক্লেমটি বাতিল করতে চান?' : 'Are you sure you want to reject this claim?')) return;
    try {
      await updateDoc(doc(db, 'dealership_claims', claimId), {
        status: 'Rejected'
      });
      setNotification({ message: isBn ? 'ক্লেমটি বাতিল করা হয়েছে' : 'Claim rejected successfully', type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  // --- Handlers for Multi-Unit Inventory ---
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !productCompany) {
      setNotification({ message: isBn ? 'দয়া করে নাম এবং কোম্পানি সিলেক্ট করুন' : 'Please provide name and select a company', type: 'error' });
      return;
    }
    setIsSavingProduct(true);
    try {
      const payload: Partial<Product> = {
        name: productName.trim(),
        category: productCategory.trim() || 'General',
        companyName: productCompany,
        cost: parseFloat(productCost) || 0,
        price: parseFloat(productRetail) || 0, // Fallback retail single price
        stock: parseInt(productStock) || 0,
        unit: 'unit',
        barcode: pieceBarcode.trim() || cartonBarcode.trim() || '', // general barcode
        
        // Multi-Unit Info
        cartonPrice: parseFloat(cartonPrice) || undefined,
        cartonBarcode: cartonBarcode.trim() || undefined,
        cartonCapacity: parseInt(cartonCapacity) || undefined,

        boxPrice: parseFloat(boxPrice) || undefined,
        boxBarcode: boxBarcode.trim() || undefined,
        boxCapacity: parseInt(boxCapacity) || undefined,

        dozenPrice: parseFloat(dozenPrice) || undefined,
        dozenBarcode: dozenBarcode.trim() || undefined,

        piecePrice: parseFloat(piecePrice) || undefined,
        pieceBarcode: pieceBarcode.trim() || undefined,
      };

      if (isEditingProduct && editingProductId) {
        await updateDoc(doc(db, 'products', editingProductId), payload);
        setNotification({ message: isBn ? 'পণ্য সফলভাবে আপডেট হয়েছে' : 'Product updated successfully', type: 'success' });
      } else {
        await onAddProduct(payload);
        // Notification is handled inside App.tsx or onAddProduct
      }

      // Reset form
      handleResetProductForm();
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleResetProductForm = () => {
    setIsEditingProduct(false);
    setEditingProductId(null);
    setProductName('');
    setProductCategory('');
    setProductCompany('');
    setProductCost('');
    setProductRetail('');
    setProductStock('');
    setCartonPrice('');
    setCartonBarcode('');
    setCartonCapacity('100');
    setBoxPrice('');
    setBoxBarcode('');
    setBoxCapacity('24');
    setDozenPrice('');
    setDozenBarcode('');
    setPiecePrice('');
    setPieceBarcode('');
  };

  const handleStartEditProduct = (p: Product) => {
    setIsEditingProduct(true);
    setEditingProductId(p.id);
    setProductName(p.name || '');
    setProductCategory(p.category || '');
    setProductCompany(p.companyName || '');
    setProductCost(p.cost ? p.cost.toString() : '');
    setProductRetail(p.price ? p.price.toString() : '');
    setProductStock(p.stock ? p.stock.toString() : '');
    
    setCartonPrice(p.cartonPrice ? p.cartonPrice.toString() : '');
    setCartonBarcode(p.cartonBarcode || '');
    setCartonCapacity(p.cartonCapacity ? p.cartonCapacity.toString() : '100');
    
    setBoxPrice(p.boxPrice ? p.boxPrice.toString() : '');
    setBoxBarcode(p.boxBarcode || '');
    setBoxCapacity(p.boxCapacity ? p.boxCapacity.toString() : '24');
    
    setDozenPrice(p.dozenPrice ? p.dozenPrice.toString() : '');
    setDozenBarcode(p.dozenBarcode || '');
    
    setPiecePrice(p.piecePrice ? p.piecePrice.toString() : '');
    setPieceBarcode(p.pieceBarcode || '');
  };

  // --- SUBTAB 1 : BULK CHALLAN CREATION & WORKFLOW ---
  const [showChallanModal, setShowChallanModal] = useState(false);
  const [selectedDealerForChallan, setSelectedDealerForChallan] = useState<Dealer | null>(null);
  const [selectedAgentForChallan, setSelectedAgentForChallan] = useState<Agent | null>(null);
  const [challanItems, setChallanItems] = useState<Array<{ product: Product; qty: number; targetPrice: number }>>([]);
  const [challanQuery, setChallanQuery] = useState('');

  const handleCreateChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDealerForChallan) {
      setNotification({ message: isBn ? "অনুগ্রহ করে ডিলার সিলেক্ট করুন" : "Please specify target Dealer", type: 'error' });
      return;
    }
    if (challanItems.length === 0) {
      setNotification({ message: isBn ? "কোনো প্রোডাক্ট সিলেক্ট করা নেই" : "Challan requires at least 1 product line", type: 'error' });
      return;
    }

    // Evaluate Credit limit check before dispatch
    const totalDispatchVal = challanItems.reduce((acc, cr) => acc + (cr.qty * cr.targetPrice), 0);
    const crLimit = selectedDealerForChallan.creditLimit || 50000;
    const currentBal = selectedDealerForChallan.currentBalance || 0;

    if (currentBal + totalDispatchVal > crLimit) {
      setNotification({ 
        message: isBn 
          ? `সীমা অতিরিক্ত বকেয়া! এই ডিলারের বাকির সর্বোচ্চ সীমা ${currencySymbol}${crLimit} এবং বর্তমান বকেয়া ${currencySymbol}${currentBal}। আপনি আরও ${currencySymbol}${totalDispatchVal} মূল্যের মালামাল পাঠাতে পারবেন না।`
          : `Credit limit exceeded! Dealer Limit is ${currencySymbol}${crLimit}. Pending due + new dispatch would reach ${currencySymbol}${currentBal + totalDispatchVal}.`, 
        type: 'error' 
      });
      return;
    }

    const newChNo = `CH-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCh: Challan = {
      id: `ch_${Date.now()}`,
      challanNo: newChNo,
      dealerName: selectedDealerForChallan.name,
      dealerPhone: selectedDealerForChallan.phone,
      agentName: selectedAgentForChallan?.name || 'Self Dispatch (সরাসরি চালান)',
      area: selectedDealerForChallan.area || 'General Outlets',
      items: challanItems.map(item => ({
        productId: item.product.id,
        productName: item.product.name,
        qty: item.qty,
        price: item.targetPrice
      })),
      status: 'Dispatched',
      createdAt: new Date().toISOString()
    };

    try {
      // Dynamic offline push, could be pushed to collection as well
      await addDoc(collection(db, 'bulk_challans'), {
        ...newCh,
        shopId: user?.shopId || 'global'
      });

      // Update local state copy
      setChallans(prev => [newCh, ...prev]);

      // Automatically post a debit entry into Ledger
      const newLedEntry = {
        id: `led_${Date.now()}`,
        dealerId: selectedDealerForChallan.id,
        type: 'debit',
        description: `Dispatch Challan ${newChNo}`,
        amount: totalDispatchVal,
        date: new Date().toISOString().split('T')[0]
      };
      setLedgerEntries(prev => [...prev, newLedEntry]);

      // Adjust dealer current due balance
      setDealers(prev => prev.map(dlr => {
        if (dlr.id === selectedDealerForChallan.id) {
          return { ...dlr, currentBalance: (dlr.currentBalance || 0) + totalDispatchVal };
        }
        return dlr;
      }));

      // Flush outputs
      setChallanItems([]);
      setSelectedDealerForChallan(null);
      setSelectedAgentForChallan(null);
      setShowChallanModal(false);
      setNotification({ message: isBn ? "চালান সফলভাবে জেনারেট হয়েছে এবং মালামাল পাঠানো হয়েছে!" : "Wholesale Challan dispatched successfully!", type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleUpdateChallanStatus = async (challanId: string, nextStatus: Challan['status']) => {
    try {
      setChallans(prev => prev.map(ch => {
        if (ch.id === challanId) {
          return { ...ch, status: nextStatus };
        }
        return ch;
      }));
      setNotification({ message: isBn ? `চালান স্ট্যাটাস '${nextStatus}' আপডেট করা হয়েছে।` : `Challan status updated to ${nextStatus}`, type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handlePrintChallan = (ch: Challan) => {
    const printChWindow = window.open('', '_blank');
    if (!printChWindow) return;

    const totalVal = ch.items.reduce((acc, cr) => acc + (cr.qty * cr.price), 0);

    printChWindow.document.write(`
      <html>
        <head>
          <title>Wholesale Delivery Challan #${ch.challanNo}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 30px; color: #1e293b; background: #fff; }
            .challan-container { border: 1px solid #cbd5e1; border-radius: 12px; padding: 25px; max-width: 800px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; }
            .challan-title { font-size: 20px; font-weight: 900; letter-spacing: 1px; color: #4f46e5; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; font-size: 13px; }
            .meta-block { background: #f8fafc; padding: 15px; border-radius: 8px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f1f5f9; padding: 12px; font-size: 11px; text-transform: uppercase; font-weight: bold; color: #475569; text-align: left; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; }
            .summary-box { text-align: right; font-size: 14px; font-weight: 800; color: #1e1b4b; }
            .footer-notes { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #64748b; line-height: 1.6; margin-top: 40px; }
            .sig-area { display: flex; justify-content: space-between; margin-top: 60px; }
            .sig-line { border-top: 1px solid #94a3b8; width: 170px; text-align: center; font-size: 12px; color: #64748b; padding-top: 6px; }
          </style>
        </head>
        <body>
          <div class="challan-container">
            <div class="header">
              <div>
                <h1 style="margin: 0; font-size: 24px; font-weight: 950; color: #111827;">${settings.name}</h1>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px;">${settings.address || ''}</div>
              </div>
              <div style="text-align: right;">
                <span class="challan-title">DELIVERY CHALLAN</span>
                <div style="font-size: 11px; font-weight: 800; color: #64748b; margin-top: 4px;">CHALLAN NO: ${ch.challanNo}</div>
              </div>
            </div>

            <div class="meta-grid">
              <div class="meta-block">
                <strong style="display: block; font-size: 11px; color: #64748b; margin-bottom: 4px;">DELIVER TO / DEALER</strong>
                <strong>Name:</strong> ${ch.dealerName}<br/>
                <strong>Phone:</strong> ${ch.dealerPhone}<br/>
                <strong>Area:</strong> ${ch.area || 'Retailer Channel'}
              </div>
              <div class="meta-block">
                <strong style="display: block; font-size: 11px; color: #64748b; margin-bottom: 4px;">DISTRIBUTION DETAILS</strong>
                <strong>Date:</strong> ${new Date(ch.createdAt).toLocaleDateString()}<br/>
                <strong>Sales Agent:</strong> ${ch.agentName || 'Self Dispatch'}<br/>
                <strong>Status:</strong> ${ch.status}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Product Description</th>
                  <th style="text-align: right;">Wholesale Rate</th>
                  <th style="text-align: center;">Qty Line</th>
                  <th style="text-align: right;">Total Net</th>
                </tr>
              </thead>
              <tbody>
                ${ch.items.map(item => `
                  <tr>
                    <td>${item.productName}</td>
                    <td style="text-align: right;">${currencySymbol}${item.price}</td>
                    <td style="text-align: center;">${item.qty} units</td>
                    <td style="text-align: right;">${currencySymbol}${item.qty * item.price}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="summary-box">
              Grand Total Value: ${currencySymbol}${totalVal}
            </div>

            <div class="footer-notes">
              <strong>English Terms:</strong> All delivered materials are subjected to general warranty guidelines. Dealer accepts quantities and physical status upon signing this certificate below.<br/>
              <strong>বাংলা শর্তাবলী:</strong> চালানকৃত সকল মালামাল বুঝে পাওয়ার সাথে সাথে সই করতে হবে। কোনো ঘাটতি বা ড্যামেজ থাকলে পরিবহণ থেকে খালাসের সময়ই ডিলার প্রতিনিধিকে তা জানাতে হবে।
            </div>

            <div class="sig-area">
              <div class="sig-line">Receivers / Dealer Signature</div>
              <div class="sig-line">Delivery Agent / Rep</div>
              <div class="sig-line">Authorized Signature</div>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 1500);
            }
          </script>
        </body>
      </html>
    `);
    printChWindow.document.close();
  };

  // --- SUBTAB 2 : DEALER LEDGER BOOK (DEBIT / CREDIT) ---
  const [selectedDealerForLedger, setSelectedDealerForLedger] = useState<Dealer | null>(dealers[0]);
  const [ledgerAmount, setLedgerAmount] = useState('');
  const [ledgerDesc, setLedgerDesc] = useState('');
  const [ledgerType, setLedgerType] = useState<'debit' | 'credit'>('credit');

  const filteredLedgerEntries = useMemo(() => {
    if (!selectedDealerForLedger) return [];
    return ledgerEntries.filter(entry => entry.dealerId === selectedDealerForLedger.id);
  }, [ledgerEntries, selectedDealerForLedger]);

  const ledgerStats = useMemo(() => {
    const totalDebits = filteredLedgerEntries.filter(e => e.type === 'debit').reduce((acc, cr) => acc + cr.amount, 0);
    const totalCredits = filteredLedgerEntries.filter(e => e.type === 'credit').reduce((acc, cr) => acc + cr.amount, 0);
    const outstanding = totalDebits - totalCredits;
    return { debitSum: totalDebits, creditSum: totalCredits, outstanding };
  }, [filteredLedgerEntries]);

  const handlePostLedgerEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDealerForLedger) return;
    const amountVal = parseFloat(ledgerAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setNotification({ message: isBn ? "একটি সঠিক মূল্য ইনপুট দিন" : "Please input a valid amount", type: 'error' });
      return;
    }

    const newLed = {
      id: `led_${Date.now()}`,
      dealerId: selectedDealerForLedger.id,
      type: ledgerType,
      description: ledgerDesc.trim() || (ledgerType === 'debit' ? 'Wholesale Due Posted' : 'Dealer Outward Settlement'),
      amount: amountVal,
      date: new Date().toISOString().split('T')[0]
    };

    try {
      setLedgerEntries(prev => [...prev, newLed]);

      // Adjust Dealer current Balance locally
      setDealers(prev => prev.map(dlr => {
        if (dlr.id === selectedDealerForLedger.id) {
          const balanceAdjustment = ledgerType === 'debit' ? amountVal : -amountVal;
          return { ...dlr, currentBalance: (dlr.currentBalance || 0) + balanceAdjustment };
        }
        return dlr;
      }));

      setLedgerAmount('');
      setLedgerDesc('');
      setNotification({ message: isBn ? "লেজার বুক আপডেট হয়েছে!" : "Ledger entries posted successfully", type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };


  // --- SUBTAB 3 : AGENTS & AREA REPRESENTATIVE REPORT ---
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentPhone, setNewAgentPhone] = useState('');
  const [newAgentArea, setNewAgentArea] = useState('');
  const [newAgentComm, setNewAgentComm] = useState('3.0');

  const [newDealerName, setNewDealerName] = useState('');
  const [newDealerPhone, setNewDealerPhone] = useState('');
  const [newDealerCompany, setNewDealerCompany] = useState('');
  const [newDealerArea, setNewDealerArea] = useState('');
  const [newDealerCrLimit, setNewDealerCrLimit] = useState('100000');

  // Agent Commission Stats
  const agentCommissiveSales = useMemo(() => {
    const list: Record<string, { totalDispatchedVolume: number; calculatedCommission: number }> = {};
    
    agents.forEach(agent => {
      // Calculate total wholesale dispatch volume under this agent from Delivered/Dispatched challans
      const dispatchVols = challans
        .filter(c => c.agentName === agent.name && c.status !== 'Returned')
        .reduce((sum, ch) => {
          const chVal = ch.items.reduce((acc, cr) => acc + (cr.qty * cr.price), 0);
          return sum + chVal;
        }, 0);

      list[agent.id] = {
        totalDispatchedVolume: dispatchVols,
        calculatedCommission: (dispatchVols * agent.commissionRate) / 100
      };
    });
    return list;
  }, [agents, challans]);

  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentPhone.trim()) {
      setNotification({ message: isBn ? "এজেন্ট এর সঠিক নাম দিন" : "Agent name & phone required", type: 'error' });
      return;
    }

    const agObj: Agent = {
      id: `agt_${Date.now()}`,
      name: newAgentName.trim(),
      phone: newAgentPhone.trim(),
      area: newAgentArea.trim() || 'Dhaka North',
      commissionRate: parseFloat(newAgentComm) || 2.0
    };

    setAgents(prev => [...prev, agObj]);
    setNewAgentName('');
    setNewAgentPhone('');
    setNewAgentArea('');
    setNewAgentComm('3.0');
    setNotification({ message: isBn ? "এজেন্ট সফলভাবে যুক্ত হয়েছে!" : "Representative agent registered", type: 'success' });
  };

  const handleRegisterDealer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDealerName.trim() || !newDealerPhone.trim()) {
      setNotification({ message: isBn ? "ডিলারের নাম ও ফোন নাম্বার আবশ্যক" : "Dealer name & phone required", type: 'error' });
      return;
    }

    const dlrObj: Dealer = {
      id: `dlr_${Date.now()}`,
      name: newDealerName.trim(),
      phone: newDealerPhone.trim(),
      company: newDealerCompany.trim() || undefined,
      area: newDealerArea.trim() || 'Retail Distributor Area',
      creditLimit: parseFloat(newDealerCrLimit) || 100000,
      currentBalance: 0
    };

    setDealers(prev => [...prev, dlrObj]);
    setNewDealerName('');
    setNewDealerPhone('');
    setNewDealerCompany('');
    setNewDealerArea('');
    setNewDealerCrLimit('100000');
    setNotification({ message: isBn ? "ডিলার সফলভাবে রেজিস্টার হয়েছে!" : "Dealer client registered", type: 'success' });
  };


  // --- SUBTAB 4 : WHOLESALE PRICE TEMPLATE & MOQ REGISTER ---
  const [priceSearch, setPriceSearch] = useState('');
  const [selectedProductForWholesale, setSelectedProductForWholesale] = useState<Product | null>(null);
  const [wholesalePriceInput, setWholesalePriceInput] = useState('');
  const [moqInput, setMoqInput] = useState('10');

  const filteredWholesaleProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(priceSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(priceSearch.toLowerCase())
    );
  }, [products, priceSearch]);

  const handleUpdateWholesaleConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForWholesale) return;
    const rate = parseFloat(wholesalePriceInput);
    const moqVal = parseInt(moqInput) || 10;

    if (isNaN(rate) || rate <= 0) {
      setNotification({ message: isBn ? "সঠিক হোলসেল রেট লিখুন" : "Please input a valid wholesale rate", type: 'error' });
      return;
    }

    try {
      await updateDoc(doc(db, 'products', selectedProductForWholesale.id), {
        wholesalePrice: rate,
        moq: moqVal
      });

      setSelectedProductForWholesale(prev => prev ? {
        ...prev,
        wholesalePrice: rate,
        moq: moqVal
      } : null);

      setNotification({ message: isBn ? "হোলসেল রেট ও ন্যূনতম অর্ডার (MOQ) সংরক্ষিত হয়েছে" : "Wholesale rate & MOQ metrics updated", type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };


  return (
    <div className="space-y-6">
      
      {/* Header Panel banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-violet-950 border border-violet-800/40 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        
        <div className="z-10 space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-violet-500/20 rounded-2xl border border-violet-500/30 text-violet-300">
              <Truck className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">
                {isBn ? "ডিলারশিপ ও ডিস্ট্রিবিউটর চালান হাব" : "Dealership & Bulk Distribution Portal"}
              </h1>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400">
                Bulk Dispatch Sheets • Dealer Ledgers • S/R Area Commission Module
              </span>
            </div>
          </div>
          <p className="text-slate-300 text-xs font-semibold max-w-xl">
            {isBn 
              ? "ডিলারদের জন্য ক্রেডিট লিমিট সেট করন, পাইকারি কাস্টম লেজার বুক জেনারেশন, এলাকাভিত্তিক ডেলিভারি পারসন এবং এজেন্টদের কমিশন ম্যানেজমেন্ট ও কাস্টম চালান জেনারেশন ইউটিলিটি।"
              : "Advanced channel suite to track dealership outlays, manage sales commissions under regional managers, print commercial Challan sheets, and monitor strict credit restrictions."}
          </p>
        </div>

        {/* Tab Selector List */}
        <div className="flex bg-slate-950/40 p-1.5 rounded-2xl border border-slate-800/80 self-start md:self-auto overflow-x-auto shrink-0 scrollbar-none z-10 max-w-full">
          {[
            { id: 'companies', label: isBn ? 'কোম্পানি প্রোফাইল' : 'Company Profiles', icon: Layers },
            { id: 'inventory', label: isBn ? 'মাল্টি-ইউনিট ইনভেন্টরি' : 'Multi-Unit Stock', icon: Truck },
            { id: 'sr_portal', label: isBn ? 'SR পোর্টাল ও অর্ডার কাটিং' : 'SR Order Cutting', icon: ShoppingCart },
            { id: 'dsr_portal', label: isBn ? 'DSR ডেলিভারি সিস্টেম' : 'DSR Delivery Portal', icon: ClipboardCheck },
            { id: 'claims_manager', label: isBn ? 'রিটার্ন ও ড্যামেজ ক্লেম' : 'Returns & Claims Verification', icon: ShieldCheck },
            { id: 'due_ledger', label: isBn ? 'রিটেইলার বকেয়া খাতা' : 'Retailers Due Ledger', icon: BookOpen },
            { id: 'trade_schemes', label: isBn ? 'স্কিম ও ফ্রি সেটআপ' : 'Trade Free Schemes', icon: Percent },
            { id: 'company_claims', label: isBn ? 'কোম্পানি ক্লেম রেজিস্টার' : 'Company Claim Register', icon: ShieldAlert },
            { id: 'analytics', label: isBn ? 'পারফরম্যান্স ও গ্রাফ' : 'Performance Analytics', icon: TrendingUp },
            { id: 'retailers', label: isBn ? 'রিটেইলার রেজিস্ট্রি' : 'Retailers Registry', icon: Store },
            { id: 'staff', label: isBn ? 'স্টাফ ও এসআর' : 'Staff Directory', icon: UserCheck },
            { id: 'challan', label: isBn ? 'বাল্ক চালান জেনারেশন' : 'Delivery Challans', icon: FileText },
            { id: 'ledger', label: isBn ? 'ডিলার লেজার বুক' : 'Dealer Ledger', icon: BookOpen },
            { id: 'agent', label: isBn ? 'এরিয়া ও ডিলার প্যানেল' : 'Agents & Area', icon: Users },
            { id: 'rates', label: isBn ? 'হোলসেল রেট ও MOQ' : 'Wholesale Pricing', icon: DollarSign },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
                  active 
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30' 
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

      {/* Main Tab Rendering Arena */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/85 rounded-3xl shadow-sm overflow-hidden min-h-[500px]">

        {/* TAB: STAFF DIRECTORY */}
        {activeSubTab === 'staff' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Register Staff Form */}
              <div className="lg:col-span-1 bg-slate-50 dark:bg-slate-950/30 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 space-y-4 h-fit">
                <div>
                  <span className="text-[9px] font-black uppercase text-violet-600 tracking-wider">Staff Management</span>
                  <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">
                    {isBn ? "নতুন স্টাফ যুক্ত করুন" : "Register Distribution Staff"}
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-1">
                    {isBn ? "আপনার ডিস্ট্রিবিউটর হাউসের SR, DSR এবং ডেলিভারিম্যানদের তথ্য নিবন্ধন করুন।" : "Manage Sales Representatives (SR), Delivery Sales Reps (DSR), and logistics staff."}
                  </p>
                </div>

                <form onSubmit={handleSaveStaff} className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "স্টাফের নাম" : "Staff Name"} *</label>
                    <input
                      type="text"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      placeholder={isBn ? "যেমন: কামাল হোসেন" : "e.g. Kamal Hossain"}
                      className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "মোবাইল নাম্বার" : "Mobile Phone"} *</label>
                    <input
                      type="text"
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      placeholder={isBn ? "যেমন: 01712345678" : "e.g. 01712345678"}
                      className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "স্টাফ রোল / দায়িত্ব" : "Staff Role"} *</label>
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value as any)}
                      className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      required
                    >
                      <option value="SR">{isBn ? "SR (Sales Representative)" : "SR (Sales Representative)"}</option>
                      <option value="DSR">{isBn ? "DSR (Delivery Sales Representative)" : "DSR (Delivery Sales Representative)"}</option>
                      <option value="Delivery Man">{isBn ? "ডেলিভারি ম্যান (Delivery Man)" : "Delivery Man"}</option>
                    </select>
                  </div>

                  {/* SR-only Mapped Company Dropdown */}
                  {newStaffRole === 'SR' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ম্যাপ করা কোম্পানি (Unilever / Akij)" : "Mapped Distribution Company"}</label>
                      <select
                        value={newStaffCompany}
                        onChange={(e) => setNewStaffCompany(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      >
                        <option value="">{isBn ? "-- কোনো নির্দিষ্ট কোম্পানি নেই --" : "-- General / No Specific Company --"}</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-violet-500 font-bold">
                        {isBn ? "SR কে নির্দিষ্ট কোম্পানির সাথে ম্যাপ করলে অর্ডার ট্র্যাকিং সহজ হবে।" : "Link this SR to a manufacturer company to auto-tag client orders."}
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingStaff}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white font-black text-xs uppercase tracking-wider rounded-xl text-center flex justify-center items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {isSavingStaff ? (isBn ? "সংরক্ষণ করা হচ্ছে..." : "Saving...") : (isBn ? "স্টাফ যুক্ত করুন" : "Add Staff Member")}
                  </button>
                </form>
              </div>

              {/* Right Column: Staff Directory */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">{isBn ? "নিবন্ধিত ডিস্ট্রিবিউশন টিম" : "Active Staff Directory"}</h4>
                    <p className="text-[11px] text-slate-400 font-semibold">{isBn ? "মাঠ পর্যায়ে কর্মরত প্রতিনিধিদের তালিকা ও কোম্পানি ম্যাপিং।" : "Authorized field force executing marketing routes."}</p>
                  </div>
                  <span className="px-3 py-1 bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 font-black text-xs rounded-full">
                    {staff.length} {isBn ? "জন স্টাফ" : "Staff Members"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {staff.map((st) => (
                    <div key={st.id} className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl relative group flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${
                              st.role === 'SR' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' :
                              st.role === 'DSR' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' :
                              'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                            }`}>
                              {st.role}
                            </span>
                            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-2">{st.name}</h4>
                          </div>
                          
                          <button
                            onClick={() => handleDeleteStaff(st.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50/50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Remove Staff"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        
                        <p className="text-[11px] text-slate-500 font-semibold mt-1">
                          <strong>Phone:</strong> {st.phone}
                        </p>
                        
                        {st.mappedCompany && (
                          <div className="mt-2 text-[10px] bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-300 px-2 py-1 rounded-lg border border-violet-100 dark:border-violet-900 font-bold w-fit">
                            Mapped Brand: {st.mappedCompany}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-200/40 text-right">
                        <span className="text-[9px] font-mono text-slate-400">ID: {st.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB: RETAILER DUE LEDGER (Phase 4) */}
        {activeSubTab === 'due_ledger' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            <div className="flex flex-col lg:flex-row gap-6">
              
              {/* Left Column: Retailers list with Due Balances */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">{isBn ? "রিটেইলার বকেয়া খাতা" : "Retailers Outstanding"}</h3>
                      <p className="text-[10px] text-slate-400 font-bold">{isBn ? "দোকানদারদের বকেয়া ও বাকির হিসাব" : "Track outstanding credit ledger balances"}</p>
                    </div>
                    <span className="bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-lg font-mono">
                      {isBn ? "বকেয়া খাতা" : "Credit Ledger"}
                    </span>
                  </div>

                  {/* Simple Search bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-450" />
                    <input
                      type="text"
                      placeholder={isBn ? "দোকানের নাম খুঁজুন..." : "Search outlet..."}
                      onChange={(e) => {
                        // We can filter retailers directly in map using inline filter state
                        setSearchQuery(e.target.value);
                      }}
                      className="w-full pl-9 pr-4 py-2 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none focus:border-violet-600 transition-all placeholder:text-slate-500"
                    />
                  </div>

                  {/* Retailer items */}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {retailers
                      .filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(ret => {
                        const isSelected = showLedgerHistoryForRetailer?.id === ret.id;
                        const hasDue = (ret.previousDue || 0) > 0;
                        return (
                          <div
                            key={ret.id}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-3 cursor-pointer ${
                              isSelected 
                                ? 'bg-violet-600/10 border-violet-600/50 text-white' 
                                : 'bg-slate-950/40 border-slate-850 text-slate-200 hover:border-slate-700'
                            }`}
                            onClick={() => {
                              setShowLedgerHistoryForRetailer(ret);
                              setSelectedRetailerForDueCollect(ret);
                            }}
                          >
                            <div className="space-y-1">
                              <h5 className="font-extrabold text-xs">{ret.name}</h5>
                              <p className="text-[10px] text-slate-450 font-bold">📍 {ret.beat} • Owner: {ret.ownerName || 'N/A'}</p>
                              <span className="text-[9px] text-slate-500 font-bold block">{isBn ? "ফোন:" : "Phone:"} {ret.phone}</span>
                            </div>
                            
                            <div className="text-right flex items-center md:flex-col justify-between w-full md:w-auto gap-4">
                              <div>
                                <span className="text-[8px] font-black uppercase text-slate-500 block">{isBn ? "মোট বাকি" : "Outstanding Due"}</span>
                                <span className={`text-xs font-mono font-black ${hasDue ? 'text-rose-400' : 'text-slate-400'}`}>
                                  {currencySymbol}{(ret.previousDue || 0).toLocaleString(undefined, {minimumFractionDigits: 1})}
                                </span>
                              </div>
                              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded block ${
                                hasDue ? 'bg-rose-950/50 text-rose-400 border border-rose-900/30' : 'bg-slate-900 text-slate-500'
                              }`}>
                                {hasDue ? (isBn ? "বকেয়া আছে" : "Unpaid Credit") : (isBn ? "পরিশোধিত" : "Clear")}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Right Column: Dynamic Due Collection and Credit History */}
              <div className="lg:col-span-7 space-y-6">
                {showLedgerHistoryForRetailer ? (
                  <>
                    {/* Collection Entry Form */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                        <div>
                          <h4 className="text-xs font-black text-slate-350 uppercase tracking-widest">{isBn ? "বকেয়া ক্যাশ আদায়ের নতুন এন্ট্রি" : "Log Retailer Due Cash Collection"}</h4>
                          <p className="text-[10px] text-slate-500 font-bold">{isBn ? `দোকানদার: ${showLedgerHistoryForRetailer.name}` : `Store: ${showLedgerHistoryForRetailer.name}`}</p>
                        </div>
                        <span className="text-xs font-black text-violet-400 bg-violet-950/60 border border-violet-800/60 px-2.5 py-1 rounded-xl">
                          {isBn ? "বর্তমান বাকি:" : "Current Due:"} {currencySymbol}{(showLedgerHistoryForRetailer.previousDue || 0).toLocaleString(undefined, {minimumFractionDigits: 1})}
                        </span>
                      </div>

                      <form onSubmit={handleCollectRetailerDue} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "আদায়কৃত নগদ পরিমাণ (টাকা)" : "Amount Collected (TK)"}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">{currencySymbol}</span>
                            <input
                              type="number"
                              step="any"
                              value={dueCollectionAmount}
                              onChange={(e) => setDueCollectionAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-7 pr-3 py-2 bg-slate-950 text-xs font-bold text-slate-100 border border-slate-850 rounded-xl outline-none focus:border-violet-600 transition-all"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "পেমেন্ট মেথড" : "Collection Mode"}</label>
                          <select
                            value={dueCollectionMethod}
                            onChange={(e) => setDueCollectionMethod(e.target.value as any)}
                            className="w-full p-2 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none"
                          >
                            <option value="Cash">{isBn ? "নগদ ক্যাশ (Cash)" : "Cash"}</option>
                            <option value="bKash">{isBn ? "বিকাশ (bKash)" : "bKash"}</option>
                            <option value="Bank">{isBn ? "ব্যাংক জমা (Bank)" : "Bank Transfer"}</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "মন্তব্য / বিবরণ" : "Reference note"}</label>
                          <input
                            type="text"
                            value={dueCollectionNote}
                            onChange={(e) => setDueCollectionNote(e.target.value)}
                            placeholder={isBn ? "ম্যানেজারের হাত মারফত..." : "e.g., Handed over via manager..."}
                            className="w-full px-3 py-2 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none focus:border-violet-600 transition-all placeholder:text-slate-600"
                          />
                        </div>

                        <div className="md:col-span-3">
                          <button
                            type="submit"
                            disabled={isSavingDueCollect}
                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                          >
                            {isSavingDueCollect ? (isBn ? "সাবমিট হচ্ছে..." : "Saving Collection...") : (isBn ? "বকেয়া আদায় নিশ্চিত করুন ✔" : "Confirm Collection Entry ✔")}
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Historical credit statement ledgers */}
                    <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
                      <h4 className="text-xs font-black text-slate-350 uppercase tracking-widest">{isBn ? "ব্যবসায়িক ক্রেডিট লেজার স্টেটমেন্ট" : "Credit Ledger Statement"}</h4>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse font-mono text-[10px]">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-500 font-extrabold uppercase">
                              <th className="pb-2">{isBn ? "তারিখ" : "Date"}</th>
                              <th className="pb-2">{isBn ? "বিবরণ" : "Particulars"}</th>
                              <th className="pb-2 text-right">{isBn ? "টাকা" : "Amount"}</th>
                              <th className="pb-2 text-right">{isBn ? "ব্যালেন্স" : "Outstanding"}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850">
                            {dueLedgerEntries
                              .filter(e => e.retailerId === showLedgerHistoryForRetailer.id)
                              .map(entry => {
                                const isPositive = entry.amount > 0;
                                return (
                                  <tr key={entry.id} className="text-slate-300">
                                    <td className="py-2.5 whitespace-nowrap">{new Date(entry.createdAt).toLocaleDateString('en-GB')}</td>
                                    <td className="py-2.5">
                                      <span className="font-sans font-bold text-slate-200 block">{entry.type}</span>
                                      <span className="text-[9px] text-slate-500 block">{entry.note}</span>
                                    </td>
                                    <td className={`py-2.5 text-right font-black ${isPositive ? 'text-rose-400' : 'text-emerald-400'}`}>
                                      {isPositive ? '+' : ''}{currencySymbol}{entry.amount.toFixed(1)}
                                    </td>
                                    <td className="py-2.5 text-right font-black text-slate-100">{currencySymbol}{entry.balance.toFixed(1)}</td>
                                  </tr>
                                );
                              })}
                            {dueLedgerEntries.filter(e => e.retailerId === showLedgerHistoryForRetailer.id).length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-8 text-center text-slate-500 font-bold font-sans">
                                  {isBn ? "এই দোকানদারের কোনো লেজার স্টেটমেন্ট পাওয়া যায়নি।" : "No transaction history recorded on credit books."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-16 text-center border border-dashed border-slate-850 rounded-3xl bg-slate-900/40 text-slate-400 text-xs font-semibold">
                    {isBn ? "বকেয়া হিস্ট্রি দেখতে এবং আদায়ের এন্ট্রি দিতে বাম পাশের তালিকা থেকে রিটেইলার সিলেক্ট করুন।" : "Select a retailer merchant from the outstanding registry to view credit ledger and log collection entries."}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB: TRADE SCHEME / FREE SCHEME SETUP (Phase 4) */}
        {activeSubTab === 'trade_schemes' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Setup / Create Trade Scheme Form Card */}
              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 self-start">
                <div>
                  <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">{isBn ? "নতুন ট্রেড স্কিম / ফ্রি সেটআপ" : "Trade Scheme Setup"}</h3>
                  <p className="text-[10px] text-slate-400 font-bold">{isBn ? "অর্ডার কাটার সময় স্বয়ংক্রিয়ভাবে ফ্রি পণ্য হিসেব" : "Automate 'Buy X Get Y Free' distribution campaigns"}</p>
                </div>

                <form onSubmit={handleSaveTradeScheme} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "পণ্য নির্বাচন করুন" : "Target Product"}</label>
                    <select
                      value={schemeProductId}
                      onChange={(e) => setSchemeProductId(e.target.value)}
                      className="w-full p-2 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none"
                    >
                      <option value="">-- {isBn ? "সিলেক্ট করুন" : "Choose product"} --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "স্কিম ইউনিট" : "Scheme Unit Type"}</label>
                    <select
                      value={schemeUnit}
                      onChange={(e) => setSchemeUnit(e.target.value as any)}
                      className="w-full p-2 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none"
                    >
                      <option value="carton">{isBn ? "কার্টন (Carton)" : "Carton"}</option>
                      <option value="box">{isBn ? "বক্স (Box)" : "Box"}</option>
                      <option value="dozen">{isBn ? "ডজন (Dozen)" : "Dozen"}</option>
                      <option value="piece">{isBn ? "পিস (Piece)" : "Piece"}</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "কিনলে (Buy Qty)" : "Buy Threshold"}</label>
                      <input
                        type="number"
                        min="1"
                        value={schemeBuyQty}
                        onChange={(e) => setSchemeBuyQty(e.target.value)}
                        placeholder="10"
                        className="w-full p-2 bg-slate-950 text-xs font-bold text-slate-100 border border-slate-850 rounded-xl outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "ফ্রি (Free Qty)" : "Free Bonus"}</label>
                      <input
                        type="number"
                        min="1"
                        value={schemeFreeQty}
                        onChange={(e) => setSchemeFreeQty(e.target.value)}
                        placeholder="1"
                        className="w-full p-2 bg-slate-950 text-xs font-bold text-slate-100 border border-slate-850 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingScheme}
                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    {isSavingScheme ? (isBn ? "সেভ হচ্ছে..." : "Publishing...") : (isBn ? "স্কিম পাবলিশ করুন ✔" : "Publish Trade Scheme ✔")}
                  </button>
                </form>
              </div>

              {/* Active Campaigns List */}
              <div className="lg:col-span-8 bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-slate-350 uppercase tracking-widest">{isBn ? "সক্রিয় ক্যাম্পেইন ও অফার সমূহ" : "Active Campaign Schemes Registry"}</h4>
                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-850 text-[9px] font-black uppercase px-2 py-0.5 rounded-lg">
                    {tradeSchemes.length} {isBn ? "টি স্কিম" : "Active offers"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tradeSchemes.map(sch => (
                    <div key={sch.id} className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl flex items-start gap-3.5 relative group">
                      <div className="w-9 h-9 bg-emerald-950 text-emerald-400 rounded-xl flex items-center justify-center font-black shrink-0">
                        🎁
                      </div>
                      
                      <div className="space-y-1 w-full">
                        <div className="flex justify-between items-start gap-2">
                          <h5 className="font-extrabold text-xs text-slate-200 truncate">{sch.productName}</h5>
                          <button
                            type="button"
                            onClick={async () => {
                              if (window.confirm(isBn ? 'আপনি কি নিশ্চিত যে এই স্কিমটি মুছে ফেলতে চান?' : 'Are you sure you want to delete this scheme?')) {
                                await deleteDoc(doc(db, 'dealership_trade_schemes', sch.id));
                              }
                            }}
                            className="text-rose-500 hover:text-rose-400 font-extrabold text-[10px]"
                          >
                            ✖
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-450 font-semibold uppercase">{sch.unit}</p>
                        
                        <div className="pt-2 border-t border-slate-900 flex justify-between items-center">
                          <span className="text-xs font-black text-emerald-400">
                            Buy {sch.buyQty} ➔ Get {sch.freeQty} Free
                          </span>
                          
                          <button
                            type="button"
                            onClick={async () => {
                              await updateDoc(doc(db, 'dealership_trade_schemes', sch.id), {
                                isActive: !sch.isActive
                              });
                            }}
                            className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border transition-all ${
                              sch.isActive 
                                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400' 
                                : 'bg-slate-950 border-slate-800 text-slate-500'
                            }`}
                          >
                            {sch.isActive ? (isBn ? "একটিভ" : "Active") : (isBn ? "বন্ধ" : "Paused")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {tradeSchemes.length === 0 && (
                    <div className="col-span-2 p-16 text-center border border-dashed border-slate-850 rounded-3xl bg-slate-950/20 text-slate-500 text-xs font-semibold">
                      {isBn ? "কোনো ট্রেড স্কিম তৈরি করা হয়নি।" : "No automated buy-free campaign schemes currently active."}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB: COMPANY CLAIM REGISTER (Phase 4) */}
        {activeSubTab === 'company_claims' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            
            {/* Outlays overview cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(() => {
                const totalFiled = companyClaimRegister.filter(c => c.type === 'Claim Filed').reduce((sum, c) => sum + c.amount, 0);
                const totalRefunded = companyClaimRegister.filter(c => c.type === 'Refund Received').reduce((sum, c) => sum + c.amount, 0);
                const netOutstanding = totalFiled - totalRefunded;
                return (
                  <>
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                      <span className="text-[9px] font-black uppercase text-rose-400 block">{isBn ? "কোম্পানিতে মোট ফাইলকৃত ক্লেম (দাম)" : "Total Filed Damages (Claims)"}</span>
                      <span className="text-xl font-black font-mono text-rose-400 mt-1 block">
                        {currencySymbol}{totalFiled.toLocaleString(undefined, {minimumFractionDigits: 1})}
                      </span>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                      <span className="text-[9px] font-black uppercase text-emerald-400 block">{isBn ? "কোম্পানি থেকে মোট প্রাপ্ত ফেরত / রিফান্ড" : "Company Claims Received (Refunds)"}</span>
                      <span className="text-xl font-black font-mono text-emerald-400 mt-1 block">
                        {currencySymbol}{totalRefunded.toLocaleString(undefined, {minimumFractionDigits: 1})}
                      </span>
                    </div>
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                      <span className="text-[9px] font-black uppercase text-amber-500 block">{isBn ? "অবশিষ্ট বকেয়া ক্লেম ব্যালেন্স" : "Net Unresolved Company Dues"}</span>
                      <span className="text-xl font-black font-mono text-amber-500 mt-1 block">
                        {currencySymbol}{netOutstanding.toLocaleString(undefined, {minimumFractionDigits: 1})}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Form card left */}
              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 self-start">
                <div>
                  <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">{isBn ? "কোম্পানি ক্লেম ও রিফান্ড এন্ট্রি" : "Register Company Claim"}</h3>
                  <p className="text-[10px] text-slate-400 font-bold">{isBn ? "কোম্পানির ড্যামেজ ক্রেডিট এবং রিফান্ড কালেকশন" : "Log damages claims filed vs refunds received"}</p>
                </div>

                <form onSubmit={handleSaveCompanyClaim} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "কোম্পানি সিলেক্ট করুন" : "Select Brand/Company"}</label>
                    <select
                      value={selectedCompanyForClaimForm}
                      onChange={(e) => setSelectedCompanyForClaimForm(e.target.value)}
                      className="w-full p-2 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none"
                    >
                      <option value="">-- {isBn ? "সিলেক্ট করুন" : "Choose brand"} --</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "ক্লেম টাইপ" : "Claim Action Type"}</label>
                    <select
                      value={companyClaimType}
                      onChange={(e) => setCompanyClaimType(e.target.value as any)}
                      className="w-full p-2 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none"
                    >
                      <option value="Claim Filed">{isBn ? "ক্লেম ফাইল করা হয়েছে (Filed Claim)" : "Claim Filed"}</option>
                      <option value="Refund Received">{isBn ? "রিফান্ড প্রাপ্তি (Refund Received)" : "Refund Received"}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "পরিমাণ (টাকা)" : "Amount (TK)"}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">{currencySymbol}</span>
                      <input
                        type="number"
                        step="any"
                        value={companyClaimAmount}
                        onChange={(e) => setCompanyClaimAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 bg-slate-950 text-xs font-bold text-slate-100 border border-slate-850 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">{isBn ? "রেফারেন্স নোট / বিবরণ" : "Reference Note / Memo"}</label>
                    <input
                      type="text"
                      value={companyClaimNote}
                      onChange={(e) => setCompanyClaimNote(e.target.value)}
                      placeholder={isBn ? "যেমন: Unilever মে ব্যাচ ড্যামেজ..." : "e.g., Unilever May damages refund..."}
                      className="w-full px-3 py-2 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none focus:border-violet-600 transition-all placeholder:text-slate-650"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingCompanyClaim}
                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    {isSavingCompanyClaim ? (isBn ? "সংরক্ষণ হচ্ছে..." : "Processing...") : (isBn ? "ক্লেম এন্ট্রি সেভ করুন ✔" : "Save Claim Entry ✔")}
                  </button>
                </form>
              </div>

              {/* Claims registry list table */}
              <div className="lg:col-span-8 bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
                <h4 className="text-xs font-black text-slate-350 uppercase tracking-widest">{isBn ? "কোম্পানি ক্লেম এন্ট্রি খতিয়ান" : "Claims Registry Ledger Records"}</h4>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse font-mono text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 font-extrabold uppercase">
                        <th className="pb-2">{isBn ? "তারিখ" : "Date"}</th>
                        <th className="pb-2">{isBn ? "কোম্পানির নাম" : "Company Name"}</th>
                        <th className="pb-2">{isBn ? "টাইপ" : "Type"}</th>
                        <th className="pb-2">{isBn ? "বিবরণ" : "Particulars"}</th>
                        <th className="pb-2 text-right">{isBn ? "টাকা" : "Amount"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300">
                      {companyClaimRegister.map(item => {
                        const isRefund = item.type === 'Refund Received';
                        return (
                          <tr key={item.id}>
                            <td className="py-2.5 whitespace-nowrap">{new Date(item.createdAt).toLocaleDateString('en-GB')}</td>
                            <td className="py-2.5 font-sans font-black text-slate-100">{item.companyName}</td>
                            <td className="py-2.5">
                              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                isRefund 
                                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400' 
                                  : 'bg-rose-950/50 border-rose-800 text-rose-400'
                              }`}>
                                {isRefund ? (isBn ? "প্রাপ্ত রিফান্ড" : "Refund Received") : (isBn ? "ক্লেম ফাইল" : "Claim Filed")}
                              </span>
                            </td>
                            <td className="py-2.5 font-sans text-[10px] text-slate-450">{item.note || 'N/A'}</td>
                            <td className={`py-2.5 text-right font-black ${isRefund ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {currencySymbol}{item.amount.toLocaleString(undefined, {minimumFractionDigits: 1})}
                            </td>
                          </tr>
                        );
                      })}
                      {companyClaimRegister.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500 font-bold font-sans">
                            {isBn ? "কোনো কোম্পানি ক্লেম এন্ট্রি পাওয়া যায়নি।" : "No company claims registered in this cycle."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB: RETAILERS REGISTRY */}
        {activeSubTab === 'retailers' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            
            {/* Weekly Route Planner Board Card */}
            <div className="p-5 bg-gradient-to-r from-violet-950/20 to-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-violet-600/10 text-violet-500 rounded-xl flex items-center justify-center font-black">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      {isBn ? "সাপ্তাহিক রুট ও বিট ক্যালেন্ডার" : "Weekly Route & Beat Board"}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {isBn ? "বার অনুযায়ী নির্ধারিত রুট/বিট সমূহ। বিট নির্বাচন করলে নিচে সংশ্লিষ্ট রিটেইলারদের ফিল্টার হবে।" : "Day-wise mapped market routes. Click a beat name to auto-filter grocery merchants below."}
                    </p>
                  </div>
                </div>
                
                {/* Statistics helper */}
                <div className="flex gap-4 text-xs font-bold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    📍 {beatsList.length} {isBn ? "টি রুট" : "Beats"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    🏪 {retailers.length} {isBn ? "টি স্টোর" : "Outlets"}
                  </span>
                </div>
              </div>

              {/* Day-wise horizontal cards list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((dayName) => {
                  const dayBeats = beatsList.filter(b => b.day === dayName);
                  const totalShopsOnDay = retailers.filter(r => dayBeats.some(db => db.name === r.beat)).length;
                  const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }) === dayName;
                  
                  return (
                    <div 
                      key={dayName} 
                      className={`p-3 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        isToday 
                          ? 'bg-violet-950/20 border-violet-800 dark:border-violet-750 shadow-md shadow-violet-950/10' 
                          : 'bg-white dark:bg-slate-950/40 border-slate-150 dark:border-slate-850 hover:border-slate-200 dark:hover:border-slate-800'
                      }`}
                    >
                      {/* Day Label Header */}
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-black uppercase tracking-wider ${isToday ? 'text-violet-400' : 'text-slate-650 dark:text-slate-300'}`}>
                          {dayName === 'Monday' ? (isBn ? 'সোমবার' : 'Monday') :
                           dayName === 'Tuesday' ? (isBn ? 'মঙ্গলবার' : 'Tuesday') :
                           dayName === 'Wednesday' ? (isBn ? 'বুধবার' : 'Wednesday') :
                           dayName === 'Thursday' ? (isBn ? 'বৃহস্পতিবার' : 'Thursday') :
                           dayName === 'Friday' ? (isBn ? 'শুক্রবার' : 'Friday') :
                           dayName === 'Saturday' ? (isBn ? 'শনিবার' : 'Saturday') :
                           (isBn ? 'रविवार' : 'Sunday')}
                        </span>
                        
                        {isToday && (
                          <span className="px-1.5 py-0.5 bg-violet-600 text-white text-[8px] font-extrabold uppercase rounded animate-pulse">
                            {isBn ? "আজ" : "Today"}
                          </span>
                        )}
                      </div>

                      {/* Beats list within Day */}
                      <div className="space-y-1.5 flex-1 min-h-[50px]">
                        {dayBeats.map((bt) => {
                          const shopCount = retailers.filter(r => r.beat === bt.name).length;
                          const isSelectedFilter = retailerFilterBeat === bt.name;
                          return (
                            <div 
                              key={bt.id || bt.name} 
                              className={`p-1.5 rounded-lg border text-[10px] font-bold flex items-center justify-between gap-1 transition-all group/beat ${
                                isSelectedFilter
                                  ? 'bg-violet-600 text-white border-violet-500 shadow'
                                  : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 hover:border-violet-800/30 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span 
                                onClick={() => {
                                  if (isSelectedFilter) {
                                    setRetailerFilterBeat('');
                                  } else {
                                    setRetailerFilterBeat(bt.name);
                                  }
                                }}
                                className="truncate flex-1 cursor-pointer hover:underline"
                                title={bt.name}
                              >
                                {bt.name.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*-\s*/, '')}
                              </span>
                              
                              <div className="flex items-center gap-1">
                                <span className={`px-1 rounded-md text-[8px] font-mono ${
                                  isSelectedFilter ? 'bg-violet-700 text-violet-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                }`}>
                                  {shopCount}
                                </span>
                                
                                {bt.id && (
                                  <button
                                    onClick={() => handleDeleteBeat(bt.id!)}
                                    type="button"
                                    className="text-slate-400 hover:text-rose-500 text-[8px] ml-0.5 transition-all opacity-0 group-hover/beat:opacity-100 focus:opacity-100"
                                    title="Delete Route"
                                  >
                                    ✖
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {dayBeats.length === 0 && (
                          <div className="text-[9px] text-slate-400 italic text-center pt-2">
                            {isBn ? "কোনো বিট নেই" : "No mapped route"}
                          </div>
                        )}
                      </div>

                      {/* Day summary info */}
                      <div className="text-[9px] text-slate-500 font-bold border-t border-slate-100 dark:border-slate-850 pt-1.5 flex justify-between">
                        <span>{isBn ? "মোট রিটেইলার:" : "Outlets:"}</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">{totalShopsOnDay}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Register Retailer Form */}
              <div className="lg:col-span-1 bg-slate-50 dark:bg-slate-950/30 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 space-y-4 h-fit">
                <div>
                  <span className="text-[9px] font-black uppercase text-violet-600 tracking-wider">Retailer Outlets</span>
                  <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">
                    {isBn ? "মুদি রিটেইলার রেজিস্ট্রি" : "Register Retail Outlet"}
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-1">
                    {isBn ? "নতুন রিটেইলার বা দোকানদারদের তথ্য, রুট/বিট ও পূর্বের বকেয়া রেজিস্টার করুন।" : "Register grocery outlets, map field beats, track past due books, and tag coordinates."}
                  </p>
                </div>

                <form onSubmit={handleSaveRetailer} className="space-y-3.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "দোকানের নাম" : "Shop / Outlet Name"} *</label>
                    <input
                      type="text"
                      value={newRetailerName}
                      onChange={(e) => setNewRetailerName(e.target.value)}
                      placeholder={isBn ? "যেমন: মায়ের দোয়া জেনারেল স্টোর" : "e.g. Mayer Doa Groceries"}
                      className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "মালিকের নাম" : "Owner Name"}</label>
                      <input
                        type="text"
                        value={newRetailerOwner}
                        onChange={(e) => setNewRetailerOwner(e.target.value)}
                        placeholder="e.g. Hajji Karim"
                        className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "মোবাইল নাম্বার" : "Mobile Phone"} *</label>
                      <input
                        type="text"
                        value={newRetailerPhone}
                        onChange={(e) => setNewRetailerPhone(e.target.value)}
                        placeholder="e.g. 017123..."
                        className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "রোড / এরিয়া" : "Road / Area"} *</label>
                      <input
                        type="text"
                        value={newRetailerArea}
                        onChange={(e) => setNewRetailerArea(e.target.value)}
                        placeholder="e.g. Chowkbazar Lane"
                        className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "বিট / রুট (Beat/Route)" : "Assign Beat"} *</label>
                      <select
                        value={newRetailerBeat}
                        onChange={(e) => setNewRetailerBeat(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                        required
                      >
                        <option value="">{isBn ? "-- বিট সিলেক্ট করুন --" : "-- Select Beat Route --"}</option>
                        {beats.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "পূর্বের বকেয়া (বকেয়া খাতা)" : "Past Bokeya (Due)"}</label>
                      <input
                        type="number"
                        value={newRetailerDue}
                        onChange={(e) => setNewRetailerDue(e.target.value)}
                        placeholder="e.g. 5000"
                        className="w-full text-xs font-mono font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "দোকান ছবি (অস্থায়ী ক্যাশমেমো)" : "Verification Thumbnail"}</label>
                      <input
                        type="text"
                        value={newRetailerImageUrl}
                        onChange={(e) => setNewRetailerImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full text-xs font-mono font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  {/* GPS Locator */}
                  <div className="bg-white dark:bg-slate-950 p-3 rounded-2xl border border-slate-150 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase text-violet-600">{isBn ? "জিপিএস লোকেশন কোঅর্ডিনেটস" : "GPS Tracker Coordinates"}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.geolocation) {
                            navigator.geolocation.getCurrentPosition(
                              (position) => {
                                setNewRetailerGps(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
                                setNotification({ message: isBn ? "লোকেশন সফলভাবে ট্র্যাক করা হয়েছে!" : "Real coordinates saved!", type: 'success' });
                              },
                              () => {
                                // Fallback random realistic coordinates
                                setNewRetailerGps(`23.72${Math.floor(Math.random() * 90)}, 90.39${Math.floor(Math.random() * 90)}`);
                                setNotification({ message: isBn ? "সিমুলেটেড জিপিএস লোড করা হয়েছে" : "Simulated field coordinates set", type: 'info' });
                              }
                            );
                          }
                        }}
                        className="px-2.5 py-1 bg-violet-100 hover:bg-violet-200 text-violet-700 font-extrabold text-[9px] rounded-lg transition-all"
                      >
                        🎯 {isBn ? "লোকেশন ট্র্যাক করুন" : "Get GPS"}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={newRetailerGps}
                      onChange={(e) => setNewRetailerGps(e.target.value)}
                      placeholder="e.g. 23.7275, 90.3924"
                      className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-150 rounded-lg outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingRetailer}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white font-black text-xs uppercase tracking-wider rounded-xl text-center flex justify-center items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {isSavingRetailer ? (isBn ? "নিবন্ধন করা হচ্ছে..." : "Registering...") : (isBn ? "রিটেইলার রেজিস্টার করুন" : "Register grocery shop")}
                  </button>
                </form>

                {/* Quick Add Beat Route Form (Value Add) */}
                <div className="border-t border-slate-200/50 pt-4 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">{isBn ? "নতুন বিট/রুট ও বার সিলেক্ট করুন" : "Configure Custom Beats & Weekday"}</span>
                  <form onSubmit={handleAddBeat} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={isBn ? "যেমন: চকবাজার রুট" : "e.g. High Street"}
                        value={newBeatName}
                        onChange={(e) => setNewBeatName(e.target.value)}
                        className="flex-1 text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      />
                      <select
                        value={newBeatDay}
                        onChange={(e) => setNewBeatDay(e.target.value)}
                        className="text-xs font-bold px-2 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      >
                        <option value="Monday">{isBn ? "সোম" : "Mon"}</option>
                        <option value="Tuesday">{isBn ? "মঙ্গল" : "Tue"}</option>
                        <option value="Wednesday">{isBn ? "বুধ" : "Wed"}</option>
                        <option value="Thursday">{isBn ? "বৃহস্পতি" : "Thu"}</option>
                        <option value="Friday">{isBn ? "শুক্র" : "Fri"}</option>
                        <option value="Saturday">{isBn ? "শনি" : "Sat"}</option>
                        <option value="Sunday">{isBn ? "রবি" : "Sun"}</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs uppercase rounded-xl transition-all"
                    >
                      {isBn ? "রুট বিট যুক্ত করুন" : "Add Beat Route"}
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column: Retailers Directory List & Filters */}
              <div className="lg:col-span-2 space-y-4">
                
                {/* Search & Filter Beats */}
                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-center">
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={retailerSearchQuery}
                      onChange={(e) => setRetailerSearchQuery(e.target.value)}
                      placeholder={isBn ? "দোকান, মালিক বা মোবাইল দিয়ে খুঁজুন..." : "Search by shop name, owner, mobile..."}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none text-xs font-semibold"
                    />
                  </div>

                  <div className="w-full md:w-64">
                    <select
                      value={retailerFilterBeat}
                      onChange={(e) => setRetailerFilterBeat(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                    >
                      <option value="">{isBn ? "সকল বিট / রুট সমূহ" : "All Beat Routes"}</option>
                      {beats.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Retailers Cards List */}
                {(() => {
                  const filteredRetailers = retailers.filter(r => {
                    const matchesBeat = !retailerFilterBeat || r.beat === retailerFilterBeat;
                    const searchLower = retailerSearchQuery.toLowerCase().trim();
                    if (!searchLower) return matchesBeat;

                    const matchesSearch = 
                      (r.name || '').toLowerCase().includes(searchLower) ||
                      (r.ownerName || '').toLowerCase().includes(searchLower) ||
                      (r.phone || '').toLowerCase().includes(searchLower) ||
                      (r.area || '').toLowerCase().includes(searchLower) ||
                      (r.beat || '').toLowerCase().includes(searchLower);

                    return matchesBeat && matchesSearch;
                  });

                  if (filteredRetailers.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-100 rounded-3xl text-center text-slate-400">
                        <Store className="w-10 h-10 text-slate-300 mb-2" />
                        <p className="font-extrabold text-xs">{isBn ? "কোনো রিটেইলার খুঁজে পাওয়া যায়নি" : "No retailer matches your filter"}</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                      {filteredRetailers.map(r => (
                        <div key={r.id} className="p-4 bg-white dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl flex gap-3 relative group">
                          
                          {/* Retail Image Placeholder / Verifier */}
                          <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative">
                            <img
                              src={r.imageUrl}
                              alt={r.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 text-center text-[7px] text-white font-mono uppercase tracking-wider">
                              {isBn ? "অস্থায়ী" : "Temp"}
                            </div>
                          </div>

                          {/* Info Column */}
                          <div className="flex-1 space-y-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">{r.name}</h4>
                                <p className="text-[11px] text-slate-400 font-bold">{isBn ? "মালিক:" : "Prop:"} {r.ownerName || 'Unknown'}</p>
                              </div>
                              <button
                                onClick={() => handleDeleteRetailer(r.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50/50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="Remove Retailer"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-extrabold">
                              📞 {r.phone}
                            </p>

                            <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-2 gap-y-1 pt-1">
                              <span className="font-semibold">📍 {r.area}</span>
                              <span className="font-bold text-violet-600">• 🚌 {r.beat}</span>
                            </div>

                            {r.gps && (
                              <p className="text-[9px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-800/60 w-fit">
                                GPS: {r.gps}
                              </p>
                            )}

                            {/* Outstanding Bokeya Badge */}
                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-black uppercase text-slate-400">{isBn ? "বকেয়া খাতা:" : "Due Account:"}</span>
                                <span className={`text-xs font-mono font-black px-2 py-0.5 rounded-lg ${
                                  (r.previousDue || 0) > 0 
                                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-100' 
                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                }`}>
                                  {currencySymbol}{(r.previousDue || 0).toLocaleString()}
                                </span>
                              </div>
                              <span className="text-[8px] font-mono text-slate-400">ID: {r.id.substring(0,6)}</span>
                            </div>

                          </div>

                        </div>
                      ))}
                    </div>
                  );
                })()}

              </div>

            </div>
          </div>
        )}

        {/* TAB: SR PORTAL & ORDER CUTTING */}
        {activeSubTab === 'sr_portal' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            
            {/* Top Row: SR Simulation Controller */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl text-white flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-violet-400 tracking-wider">Field Force Simulator</span>
                <h4 className="text-sm font-black flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {isBn ? "এসআর মোবাইল অর্ডার কাটিং পোর্টাল" : "Sales Representative Order Cutting Terminal"}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {isBn ? "মাঠ পর্যায়ে প্রতিনিধিত্বকারী এসআর হিসেবে অর্ডার কাটুন এবং সরাসরি ডিলার সার্ভারে নোটিফাই করুন।" : "Simulate live merchant booking directly from client shop floors."}
                </p>
              </div>

              {/* SR Logged-In Selector */}
              <div className="flex gap-2 w-full md:w-auto shrink-0">
                <select
                  value={simulatedSr ? simulatedSr.id : ''}
                  onChange={(e) => {
                    const found = staff.find(s => s.id === e.target.value);
                    setSimulatedSr(found || null);
                    setSelectedRetailerForOrder(null);
                    setOrderCart([]);
                  }}
                  className="bg-slate-800 border border-slate-700 text-white font-extrabold text-xs px-3 py-2 rounded-xl outline-none"
                >
                  <option value="">{isBn ? "-- এসআর সিলেক্ট করুন --" : "-- Choose Simulated SR --"}</option>
                  {staff.filter(s => s.role === 'SR').map(sr => (
                    <option key={sr.id} value={sr.id}>{sr.name} ({sr.mappedCompany || 'Global'})</option>
                  ))}
                </select>
                
                {simulatedSr && (
                  <button
                    onClick={() => {
                      setSimulatedSr(null);
                      setSelectedRetailerForOrder(null);
                      setOrderCart([]);
                    }}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-bold text-xs rounded-xl"
                  >
                    {isBn ? "লগআউট" : "Reset"}
                  </button>
                )}
              </div>
            </div>

            {/* Check if simulated SR is logged in */}
            {!simulatedSr ? (
              <div className="flex flex-col items-center justify-center p-16 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-3xl">
                <UserCheck className="w-14 h-14 text-indigo-500/80 mb-3 animate-bounce" />
                <h4 className="font-black text-slate-700 dark:text-slate-200 text-sm">
                  {isBn ? "কোনো এসআর সিলেক্ট করা নেই" : "No SR Selected"}
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  {isBn ? "পোর্টালটি ব্যবহার করতে উপরে ডানদিকের ড্রপডাউন থেকে যেকোনো একজন নিবন্ধিত সেলস রিপ্রেজেন্টেটিভ (SR) সিলেক্ট করুন।" : "Choose a representative from the top dropdown to launch the mobile booking interface."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. SELECT RETAILER COHORT */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 space-y-3">
                    <div>
                      <span className="text-[9px] font-black uppercase text-indigo-600 tracking-wider">Step 1</span>
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">{isBn ? "গ্রাহক (রিটেইলার) নির্বাচন করুন" : "Select Target Shop Outlet"}</h4>
                      <p className="text-[10px] text-slate-400">{isBn ? "আপনার রুট বা বিটের আন্ডারে থাকা দোকান সিলেক্ট করুন।" : "Filter by beat/routes to pick active mudir dokan."}</p>
                    </div>

                    {/* Beat Filter - SR Specific */}
                    <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest">{isBn ? "বিট সিলেক্ট করুন" : "Filter Beat / Route"}</label>
                      <select
                        value={orderSearchQuery}
                        onChange={(e) => {
                          setOrderSearchQuery(e.target.value);
                          setSelectedRetailerForOrder(null);
                        }}
                        className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      >
                        <option value="">{isBn ? "সকল রুট/বিট এর দোকান" : "All Route Stores"}</option>
                        {beats.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    {/* Stores List for selected Beat */}
                    <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1 pt-1.5 border-t border-slate-200/40">
                      {retailers
                        .filter(r => !orderSearchQuery || r.beat === orderSearchQuery)
                        .map(ret => {
                          const active = selectedRetailerForOrder?.id === ret.id;
                          return (
                            <button
                              key={ret.id}
                              onClick={() => {
                                setSelectedRetailerForOrder(ret);
                                setOrderCart([]);
                              }}
                              className={`w-full p-3 text-left rounded-xl border transition-all flex justify-between items-center ${
                                active 
                                  ? 'bg-violet-600 border-violet-600 text-white shadow-md' 
                                  : 'bg-white dark:bg-slate-900 border-slate-150 text-slate-800 dark:text-slate-200 hover:border-violet-300'
                              }`}
                            >
                              <div>
                                <h5 className="font-extrabold text-xs truncate max-w-[150px]">{ret.name}</h5>
                                <p className={`text-[10px] mt-0.5 font-medium ${active ? 'text-violet-200' : 'text-slate-400'}`}>
                                  Prop: {ret.ownerName}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className={`text-[8px] font-black uppercase block ${active ? 'text-violet-100' : 'text-slate-400'}`}>
                                  {isBn ? "বকেয়া" : "Due"}
                                </span>
                                <span className="text-[11px] font-mono font-black">
                                  {currencySymbol}{(ret.previousDue || 0).toLocaleString()}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* ACTIVE CLIENT DETAILS */}
                  {selectedRetailerForOrder && (
                    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-slate-950/40 dark:to-slate-950/20 p-5 rounded-3xl border border-indigo-100/60 dark:border-slate-800/80 space-y-3 animate-fadeIn">
                      <div className="flex gap-3">
                        <img
                          src={selectedRetailerForOrder.imageUrl}
                          alt={selectedRetailerForOrder.name}
                          className="w-12 h-12 object-cover rounded-xl border border-white dark:border-slate-800 shadow-sm shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-400 uppercase tracking-wide">Selected Retailer</h4>
                          <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">{selectedRetailerForOrder.name}</h3>
                          <p className="text-[11px] text-slate-400 font-semibold">{selectedRetailerForOrder.ownerName}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="p-2 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-150/40">
                          <span className="text-[8px] font-black text-slate-400 uppercase block">Outs. Due</span>
                          <span className="text-xs font-mono font-black text-rose-600">
                            {currencySymbol}{(selectedRetailerForOrder.previousDue || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2 bg-white dark:bg-slate-900/60 rounded-xl border border-slate-150/40">
                          <span className="text-[8px] font-black text-slate-400 uppercase block">Route</span>
                          <span className="text-[10px] font-black text-indigo-600 truncate block">
                            {selectedRetailerForOrder.beat.split(' - ')[0]}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. PRODUCTS ORDER LIST */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Left Column: Product Picker (2 cols) */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">{isBn ? "প্রোডাক্ট লিস্ট" : "Available Stock List"}</h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {simulatedSr.mappedCompany ? `Mapped to: ${simulatedSr.mappedCompany}` : 'All Stocks'}
                      </span>
                    </div>

                    {!selectedRetailerForOrder ? (
                      <div className="p-12 text-center border border-dashed border-slate-200 rounded-3xl bg-slate-50 dark:bg-slate-950/20 text-slate-400 text-xs font-semibold">
                        {isBn ? "অর্ডার শুরু করতে প্রথমে বামদিকের রিটেইলার প্যানেল থেকে দোকান নির্বাচন করুন।" : "Please select a retailer on the left to start adding products."}
                      </div>
                    ) : (
                      <div className="space-y-3.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                        {products
                          .filter(p => !simulatedSr.mappedCompany || p.companyName === simulatedSr.mappedCompany)
                          .map(prod => {
                            return (
                              <div key={prod.id} className="p-3 bg-white dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-2 hover:border-indigo-300 transition-all">
                                <div>
                                  <span className="text-[8px] font-black uppercase text-violet-600 bg-violet-50 dark:bg-violet-950/40 px-1.5 py-0.5 rounded">
                                    {prod.companyName}
                                  </span>
                                  <h5 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 mt-1">{prod.name}</h5>
                                  <p className="text-[9px] text-slate-400">{isBn ? "স্টক:" : "Stock:"} {prod.stock} Pcs</p>
                                </div>

                                {/* Units Adders buttons block */}
                                <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/60">
                                  
                                  {/* Carton Button */}
                                  <button
                                    onClick={() => handleAddToOrderCart(prod, 'carton')}
                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 text-[9px] font-black rounded-lg text-center"
                                  >
                                    + {isBn ? "কার্টন" : "Carton"}
                                    <span className="block text-[8px] font-mono text-slate-400">
                                      {currencySymbol}{prod.cartonPrice || (prod.price * (prod.cartonCapacity || 100))}
                                    </span>
                                  </button>

                                  {/* Box Button */}
                                  <button
                                    onClick={() => handleAddToOrderCart(prod, 'box')}
                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 text-[9px] font-black rounded-lg text-center"
                                  >
                                    + {isBn ? "বক্স" : "Box"}
                                    <span className="block text-[8px] font-mono text-slate-400">
                                      {currencySymbol}{prod.boxPrice || (prod.price * (prod.boxCapacity || 24))}
                                    </span>
                                  </button>

                                  {/* Dozen Button */}
                                  <button
                                    onClick={() => handleAddToOrderCart(prod, 'dozen')}
                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 text-[9px] font-black rounded-lg text-center"
                                  >
                                    + {isBn ? "ডজন" : "Dozen"}
                                    <span className="block text-[8px] font-mono text-slate-400">
                                      {currencySymbol}{prod.dozenPrice || (prod.price * 12)}
                                    </span>
                                  </button>

                                  {/* Piece Button */}
                                  <button
                                    onClick={() => handleAddToOrderCart(prod, 'piece')}
                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 text-[9px] font-black rounded-lg text-center"
                                  >
                                    + {isBn ? "পিস" : "Piece"}
                                    <span className="block text-[8px] font-mono text-slate-400">
                                      {currencySymbol}{prod.piecePrice || prod.price}
                                    </span>
                                  </button>

                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Thermal Draft Cart (1 col) */}
                  <div className="md:col-span-1 space-y-4">
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">{isBn ? "অর্ডার স্লিপ ড্রাফট" : "Receipt Order Slip"}</h4>
                    </div>

                    {orderCart.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 dark:bg-slate-950/10 border border-slate-100 dark:border-slate-800 rounded-3xl text-slate-450 text-[11px] font-bold">
                        {isBn ? "কোনো পণ্য কার্টে যোগ করা হয়নি।" : "Empty draft. Add units of stocks."}
                      </div>
                    ) : (
                      <div className="bg-slate-900 text-slate-200 p-4 rounded-3xl font-mono text-[10px] space-y-4 shadow-md relative border border-slate-850">
                        <div className="text-center space-y-1">
                          <h4 className="font-bold text-xs uppercase tracking-wider">{settings?.name}</h4>
                          <span className="text-[8px] text-slate-400">SR ORDER CUTTING SLIP</span>
                        </div>
                        
                        <div className="border-b border-dashed border-slate-700 pb-2 space-y-1 text-slate-300">
                          <p><strong>SR:</strong> {simulatedSr.name}</p>
                          <p><strong>Shop:</strong> {selectedRetailerForOrder.name}</p>
                          <p><strong>Beat:</strong> {selectedRetailerForOrder.beat}</p>
                        </div>

                        {/* Cart Items Lines */}
                        <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1 text-slate-200">
                          {orderCart.map((item, idx) => (
                            <div key={`${item.productId}-${item.unit}`} className="space-y-1 border-b border-slate-800/80 pb-2 relative group">
                              <div className="flex justify-between font-bold text-slate-100">
                                <span className="truncate max-w-[100px]">{idx+1}. {item.productName}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromOrderCart(item.productId, item.unit)}
                                  className="text-rose-400 hover:text-rose-500 font-bold ml-1"
                                >
                                  ✖
                                </button>
                              </div>
                              
                              <div className="flex items-center gap-1.5 text-[9px] text-slate-300">
                                <span>{item.unit.toUpperCase()} x</span>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateCartItemQty(item.productId, item.unit, parseInt(e.target.value) || 1)}
                                  className="w-10 bg-slate-800 border border-slate-700 text-white font-black text-center rounded outline-none py-0.5"
                                />
                              </div>

                              {/* Custom Competitive Under-rate Pricing Input */}
                              <div className="flex items-center gap-1.5 text-[9px] text-slate-300 mt-1">
                                <span className="text-violet-400">Rate: {currencySymbol}</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={item.unitPrice}
                                  onChange={(e) => handleUpdateCartItemPrice(item.productId, item.unit, parseFloat(e.target.value) || 0)}
                                  className="w-16 bg-slate-800 border border-slate-700 text-white font-black px-1 rounded outline-none text-[10px]"
                                />
                                <span className="text-slate-400 ml-auto">= {currencySymbol}{item.totalPrice.toFixed(1)}</span>
                              </div>

                              {/* Show active scheme benefit if applicable */}
                              {(() => {
                                const scheme = tradeSchemes.find(s => s.productId === item.productId && s.unit === item.unit && s.isActive);
                                if (scheme) {
                                  const freeCount = Math.floor(item.quantity / scheme.buyQty) * scheme.freeQty;
                                  return (
                                    <div className="flex items-center gap-1.5 text-[8px] text-emerald-400 font-extrabold mt-1">
                                      <span>🎁 Scheme:</span>
                                      <span>Buy {scheme.buyQty} get {scheme.freeQty} free!</span>
                                      {freeCount > 0 && (
                                        <span className="bg-emerald-950/80 px-1 py-0.5 rounded border border-emerald-800 text-[8px] font-mono text-emerald-300">
                                          +{freeCount} {item.unit.toUpperCase()} FREE
                                        </span>
                                      )}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          ))}
                        </div>

                        {/* Total Outlays calculation */}
                        {(() => {
                          const orderVal = orderCart.reduce((sum, item) => sum + item.totalPrice, 0);
                          const prevDue = selectedRetailerForOrder.previousDue || 0;
                          return (
                            <div className="border-t border-dashed border-slate-700 pt-2 space-y-1.5 text-slate-200">
                              <div className="flex justify-between">
                                <span>Order Total:</span>
                                <span className="font-bold">{currencySymbol}{orderVal.toFixed(1)}</span>
                              </div>
                              <div className="flex justify-between text-slate-450">
                                <span>Prev Bokeya:</span>
                                <span>{currencySymbol}{prevDue.toFixed(1)}</span>
                              </div>
                              <div className="flex justify-between text-indigo-400 font-bold border-t border-slate-800 pt-1.5">
                                <span>Total Due:</span>
                                <span>{currencySymbol}{(orderVal + prevDue).toFixed(1)}</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Confirm Submit Action Button */}
                        <button
                          onClick={handleSubmitOrder}
                          disabled={isSavingOrder}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl text-center block transition-all"
                        >
                          {isSavingOrder ? (isBn ? "সাবমিট হচ্ছে..." : "Confirming...") : (isBn ? "অর্ডার সম্পন্ন করুন ✔" : "Confirm Order ✔")}
                        </button>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

            {/* SR Daily Order Closing & Loading Summary Section */}
            {simulatedSr && (
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl text-white space-y-4 shadow-xl">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-violet-600/10 text-violet-400 rounded-lg flex items-center justify-center font-black">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-200 uppercase tracking-wider">
                        {isBn ? "SR দৈনিক ক্লোজিং ও গেট-পাস লোড-শিট" : "SR Daily Closing & Warehouse Get-Pass"}
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        {isBn ? "দিনশেষে এসআর আজকের অর্ডারসমূহ ক্লোজ করে গাড়ি লোডের জন্য স্বয়ংক্রিয় লোডিং সামারি তৈরি করবেন।" : "End-of-day order ledger reconciliation and automated load-sheet for morning transport dispatch."}
                      </p>
                    </div>
                  </div>

                  {/* Date Filter & Control */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400">{isBn ? "তারিখ:" : "Date:"}</span>
                    <input
                      type="date"
                      value={loadSheetDate}
                      onChange={(e) => setLoadSheetDate(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-white font-extrabold text-xs px-2.5 py-1.5 rounded-xl outline-none"
                    />
                  </div>
                </div>

                {/* Closing Actions & Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    const dateStr = loadSheetDate;
                    const dateOrders = orders.filter(o => o.srId === simulatedSr.id && o.createdAt.startsWith(dateStr));
                    const pendingCount = dateOrders.filter(o => o.status === 'Pending').length;
                    const closedCount = dateOrders.filter(o => o.status !== 'Pending').length;
                    
                    return (
                      <>
                        {/* Statistics Card */}
                        <div className="md:col-span-1 p-4 bg-slate-950/40 border border-slate-850 rounded-2xl flex flex-col justify-between space-y-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{isBn ? "আজকের বুকিং স্ট্যাটাস" : "Today's Booking Status"}</span>
                          <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                              <span className="text-[8px] text-slate-400 uppercase block">{isBn ? "পেন্ডিং" : "Pending"}</span>
                              <span className="text-sm font-black font-mono text-violet-400">{pendingCount}</span>
                            </div>
                            <div className="p-2 bg-slate-900 rounded-xl border border-slate-800">
                              <span className="text-[8px] text-slate-400 uppercase block">{isBn ? "ক্লোজড" : "Closed"}</span>
                              <span className="text-sm font-black font-mono text-emerald-400">{closedCount}</span>
                            </div>
                          </div>
                        </div>

                        {/* Summary Narrative */}
                        <div className="md:col-span-1 p-4 bg-slate-950/40 border border-slate-850 rounded-2xl flex flex-col justify-center text-xs space-y-1">
                          <p className="text-slate-300 font-semibold">
                            {isBn ? `এসআর নাম: ${simulatedSr.name}` : `SR Name: ${simulatedSr.name}`}
                          </p>
                          <p className="text-slate-400 text-[11px]">
                            {isBn 
                              ? `তারিখ: ${new Date(loadSheetDate).toLocaleDateString('en-GB')}` 
                              : `Date: ${new Date(loadSheetDate).toLocaleDateString('en-GB')}`}
                          </p>
                          <p className="text-slate-400 text-[11px]">
                            {isBn 
                              ? `মোট অর্ডার ভলিউম: ${dateOrders.length} টি মেমো` 
                              : `Total bookings: ${dateOrders.length} memos`}
                          </p>
                        </div>

                        {/* Action CTA Button */}
                        <div className="md:col-span-1 flex items-center justify-center">
                          <button
                            onClick={handleCloseSrOrders}
                            disabled={isClosingOrders || pendingCount === 0}
                            className={`w-full py-4 text-xs font-black uppercase tracking-wider rounded-2xl text-center flex items-center justify-center gap-2 transition-all ${
                              pendingCount > 0 
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white' 
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                            }`}
                          >
                            <CheckCircle className="w-4 h-4" />
                            {isClosingOrders 
                              ? (isBn ? "অর্ডার ক্লোজ হচ্ছে..." : "Closing...") 
                              : (isBn ? "আজকের অর্ডার বুক ক্লোজ করুন ✔" : "Close Today's Bookings ✔")}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* The Automated Load Sheet list exactly as user requested */}
                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {isBn ? "স্বয়ংক্রিয় লোডিং সামারি (গাড়ি লোড শিট)" : "Automated Load-Sheet (Loading Summary)"}
                    </span>
                    {currentSrLoadSheet.length > 0 && (
                      <button
                        onClick={() => {
                          const printWindow = window.open('', '_blank');
                          if (printWindow) {
                            const borderStr = "--------------------------------------------";
                            const itemsText = currentSrLoadSheet.map((item, idx) => {
                              const breakdownStr = item.breakdown.map(b => `${b.retailerName} (${b.qtyStr})`).join(' + ');
                              return `${idx + 1}. ${item.productName}\n   ↳ TOTAL: ${item.totalPcs} Pcs\n   ↳ SPLIT: ${breakdownStr}`;
                            }).join('\n\n');

                            const invoiceContent = `
============================================
🏢 ${settings?.name || "DISTRIBUTOR HOUSE"}
📦 WAREHOUSE TRANSPORT DISPATCH LOAD-SHEET
============================================
📅 DATE: ${new Date(loadSheetDate).toLocaleDateString('en-GB')}
👤 SALES REP STAFF: ${simulatedSr.name}
📍 MAPPED COMPANY: ${simulatedSr.mappedCompany || 'Global'}
${borderStr}
🛍️ PRODUCT QUANTITY BREAKDOWNS (লোডিং সামারি):
${borderStr}
${itemsText}
${borderStr}
📝 SIGNATURE (WAREHOUSE KEEPER): ________________

POS Sync System Automation.
                            `;
                            printWindow.document.write(`<pre style="font-family: monospace; font-size: 12px; padding: 20px;">${invoiceContent}</pre>`);
                            printWindow.document.close();
                            printWindow.print();
                          }
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-[10px] rounded-lg transition-all flex items-center gap-1.5"
                      >
                        <Printer className="w-3 h-3" />
                        {isBn ? "গেট-পাস প্রিন্ট করুন" : "Print Loading Pass"}
                      </button>
                    )}
                  </div>

                  {currentSrLoadSheet.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950/20 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs font-semibold">
                      {isBn 
                        ? `${new Date(loadSheetDate).toLocaleDateString('en-GB')} তারিখে এই এসআর-এর কোনো বুকিং অর্ডার বুক করা হয়নি।` 
                        : `No bookings recorded for this representative on ${new Date(loadSheetDate).toLocaleDateString('en-GB')}.`}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                      {currentSrLoadSheet.map((item) => {
                        const breakdownText = item.breakdown.map(b => `${b.retailerName} (${b.qtyStr})`).join(' + ');
                        return (
                          <div key={item.productId} className="p-3 bg-slate-950/30 border border-slate-850 hover:border-slate-800 rounded-xl space-y-1.5 transition-all">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-[8px] font-black uppercase text-violet-400 bg-violet-950/50 px-1.5 py-0.5 rounded">
                                  {item.companyName}
                                </span>
                                <h4 className="font-extrabold text-xs text-slate-100 mt-1">{item.productName}</h4>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-black text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full font-mono">
                                  {item.totalPcs} {isBn ? "পিস" : "Pcs"}
                                </span>
                              </div>
                            </div>
                            
                            {/* Human Breakdown Output: কলা ৩০ পিস = করিম ১০ + আবুল ১০ + আকাশ ১০ */}
                            <div className="text-[10px] text-slate-350 font-mono bg-slate-900/65 px-2.5 py-1.5 rounded-lg border border-slate-850/60 leading-relaxed">
                              <span className="text-indigo-400 font-bold">{item.productName} ({item.totalPcs} Pcs)</span>
                              <span className="text-slate-400 mx-1.5">=</span>
                              <span className="text-slate-300 font-semibold">{breakdownText}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* TAB: DSR PORTAL (DELIVERY SALES REPRESENTATIVE) */}
        {activeSubTab === 'dsr_portal' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            
            {/* DSR Simulation Login Selector */}
            {!simulatedDsr ? (
              <div className="max-w-md mx-auto p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 text-center">
                <div className="w-12 h-12 bg-violet-600/10 text-violet-500 rounded-full flex items-center justify-center mx-auto">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-200 uppercase tracking-wider">{isBn ? "DSR প্যানেল সিমুলেশন" : "DSR Delivery Portal"}</h4>
                  <p className="text-xs text-slate-400 mt-1">{isBn ? "লগইন করতে নিচের তালিকা থেকে একজন DSR বা ডেলিভারি প্রতিনিধি নির্বাচন করুন।" : "Please select a Delivery Sales Representative (DSR) to manage market routing and collections."}</p>
                </div>
                
                <div className="space-y-2 text-left pt-2">
                  {staff.filter(st => st.role === 'DSR' || st.role === 'Delivery Man').map(st => (
                    <button
                      key={st.id}
                      onClick={() => setSimulatedDsr(st)}
                      className="w-full p-3 bg-slate-950/60 hover:bg-violet-950/20 border border-slate-800 hover:border-violet-800/50 rounded-xl flex items-center justify-between text-xs font-bold text-slate-300 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>{st.name}</span>
                      </div>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] rounded uppercase font-extrabold">{st.role}</span>
                    </button>
                  ))}
                  {staff.filter(st => st.role === 'DSR' || st.role === 'Delivery Man').length === 0 && (
                    <p className="text-center text-xs text-rose-500 font-bold">{isBn ? "কোনো DSR বা ডেলিভারি ম্যান স্টাফ রেজিস্ট্রি করা নেই! স্টাফ ডিরেক্টরি থেকে অ্যাড করুন।" : "No DSR or Delivery staff registered yet! Please add them in Staff Directory tab."}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* DSR Header bar */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-gradient-to-r from-violet-950/30 to-slate-900 border border-slate-800/80 rounded-2xl gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-600/20 text-violet-400 rounded-xl flex items-center justify-center font-black text-sm">
                      🚚
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-black text-violet-400 tracking-wider">{isBn ? "সক্রিয় ডেলিভারি প্রতিনিধি" : "Active DSR Agent"}</span>
                      <h4 className="text-sm font-black text-slate-200">{simulatedDsr.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold">{simulatedDsr.phone} • Mapped distributor delivery agent</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => {
                      setSimulatedDsr(null);
                      setSelectedOrderForDelivery(null);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950/50 hover:text-rose-400 text-slate-300 font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all"
                  >
                    {isBn ? "প্রস্থান" : "Logout DSR"}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Left Column: Dispatched Orders grouped by Beat */}
                  <div className="lg:col-span-5 space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{isBn ? "বাজার ও রুট ভিত্তিক ডেলিভারি চালান" : "Market Beat Delivery Route"}</h3>
                    
                    {orders.filter(o => o.status === 'Dispatched').length === 0 ? (
                      <div className="p-8 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-950/20 text-slate-400 text-xs font-semibold">
                        {isBn ? "বর্তমানে কোনো ডিসপ্যাচড চালান ডেলিভারি পেন্ডিং নেই।" : "No dispatched delivery challans on route right now."}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Grouping by Beat */}
                        {Array.from(new Set(orders.filter(o => o.status === 'Dispatched').map(o => o.beat))).map(beatName => {
                          const beatOrders = orders.filter(o => o.status === 'Dispatched' && o.beat === beatName);
                          return (
                            <div key={beatName} className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                              <div className="flex justify-between items-center pb-1.5 border-b border-slate-800">
                                <span className="text-[11px] font-black text-violet-400 flex items-center gap-1">
                                  📍 {beatName}
                                </span>
                                <span className="px-2 py-0.5 bg-violet-950 text-violet-300 text-[10px] font-bold rounded-full">
                                  {beatOrders.length} {isBn ? "টি ডেলিভারি" : "Deliveries"}
                                </span>
                              </div>
                              
                              <div className="space-y-2">
                                {beatOrders.map(ord => {
                                  const matchingRet = retailers.find(r => r.id === ord.retailerId);
                                  const active = selectedOrderForDelivery?.id === ord.id;
                                  return (
                                    <div
                                      key={ord.id}
                                      onClick={() => {
                                        setSelectedOrderForDelivery(ord);
                                        // Initialize refundQty for this order
                                        const newRefund: {[key: string]: number} = {};
                                        ord.items.forEach(it => {
                                          newRefund[`${ord.id}-${it.productId}-${it.unit}`] = 0;
                                        });
                                        setRefundQty(newRefund);
                                        setTempDamageCollections([]);
                                      }}
                                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                        active 
                                          ? 'bg-violet-950/20 border-violet-800' 
                                          : 'bg-slate-950/40 border-slate-850 hover:border-slate-800'
                                      }`}
                                    >
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <h4 className="text-xs font-black text-slate-200">{ord.retailerName}</h4>
                                          <p className="text-[10px] text-slate-400 mt-0.5">📞 {ord.retailerPhone}</p>
                                          {matchingRet?.area && (
                                            <p className="text-[9px] text-slate-500 font-bold">📍 {matchingRet.area}</p>
                                          )}
                                        </div>
                                        <span className="text-[9px] font-mono font-bold text-slate-500">
                                          #{ord.id.substring(0,6).toUpperCase()}
                                        </span>
                                      </div>
                                      
                                      <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-slate-800 text-[10px]">
                                        <span className="text-slate-500 font-bold">{ord.companyName} Invoice:</span>
                                        <span className="font-mono font-black text-violet-400">{currencySymbol}{ord.totalAmount.toLocaleString()}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Processing Active Order Delivery */}
                  <div className="lg:col-span-7">
                    {selectedOrderForDelivery ? (
                      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
                        
                        {/* Selected Shop info */}
                        <div className="pb-4 border-b border-slate-800 flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[9px] font-black uppercase text-emerald-500 bg-emerald-950 px-2 py-0.5 rounded">
                              {isBn ? "ডেলিভারি মেমো প্রসেস" : "Active Delivery Processor"}
                            </span>
                            <h3 className="text-base font-black text-slate-100 mt-2">{selectedOrderForDelivery.retailerName}</h3>
                            <p className="text-xs text-slate-400">{isBn ? "ক্যাশ কালেকশন, ড্যামেজ কালেকশন ও আংশিক রিফান্ড এন্ট্রি করুন।" : "Manage invoice rejection thresholds & physical damage writebacks."}</p>
                          </div>
                          
                          {/* Retailer Photo/Details snippet if available */}
                          {retailers.find(r => r.id === selectedOrderForDelivery.retailerId)?.imageUrl && (
                            <div className="text-right">
                              <span className="text-[8px] font-bold text-slate-500 uppercase block mb-1">{isBn ? "এসআর ভেরিফিকেশন ছবি" : "SR Verification Image"}</span>
                              <img
                                src={retailers.find(r => r.id === selectedOrderForDelivery.retailerId)?.imageUrl}
                                alt="Shop Memo"
                                className="w-14 h-14 rounded-xl object-cover border border-slate-800"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          )}
                        </div>

                        {/* Retailer Info Table / Route helper */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3.5 bg-slate-950/60 rounded-2xl border border-slate-850 text-xs font-bold">
                          <div>
                            <span className="text-[9px] text-slate-500 block">{isBn ? "মোবাইল নাম্বার" : "Mobile Number"}</span>
                            <span className="text-slate-300 font-mono mt-0.5 block">{selectedOrderForDelivery.retailerPhone}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block">{isBn ? "নির্ধারিত বাজার রুট" : "Route Beat"}</span>
                            <span className="text-slate-300 mt-0.5 block">📍 {selectedOrderForDelivery.beat}</span>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span className="text-[9px] text-slate-500 block">{isBn ? "লোকেশন স্থানাঙ্ক (GPS)" : "GPS Coordinates"}</span>
                            <span className="text-slate-300 font-mono mt-0.5 block text-[10px]">
                              {retailers.find(r => r.id === selectedOrderForDelivery.retailerId)?.gps || "23.7275, 90.3924"}
                            </span>
                          </div>
                        </div>

                        {/* Cash Collection & Partial Refund Items */}
                        <div className="space-y-4">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{isBn ? "ক্যাশ মেমো আইটেম ও রিজেক্ট এন্ট্রি (Partial Refund)" : "Invoice items & delivery rejections"}</h4>
                          
                          <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                            {selectedOrderForDelivery.items.map(item => {
                              const key = `${selectedOrderForDelivery.id}-${item.productId}-${item.unit}`;
                              const currentRefundVal = refundQty[key] || 0;
                              return (
                                <div key={item.productId + '-' + item.unit} className="p-3 bg-slate-950/30 border border-slate-850 rounded-xl flex justify-between items-center gap-4">
                                  <div>
                                    <div className="text-xs font-extrabold text-slate-200">{item.productName}</div>
                                    <div className="text-[10px] text-slate-400 mt-1">
                                      {item.quantity} {item.unit} • Price: {currencySymbol}{item.unitPrice}
                                    </div>
                                  </div>
                                  
                                  {/* Input field to record rejected count */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-rose-500 uppercase">{isBn ? "রিজেক্ট" : "Reject"}:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max={item.quantity}
                                      value={currentRefundVal}
                                      onChange={(e) => {
                                        const val = Math.min(item.quantity, Math.max(0, parseInt(e.target.value) || 0));
                                        setRefundQty(prev => ({ ...prev, [key]: val }));
                                      }}
                                      className="w-14 p-1 text-center bg-slate-900 border border-slate-800 text-slate-100 rounded text-xs font-mono font-black"
                                    />
                                    <span className="text-[10px] text-slate-500 font-bold">{item.unit}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Retailer Damage / Expired Product Collection */}
                        <div className="p-4 bg-slate-950/30 border border-slate-850 rounded-2xl space-y-4">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <span>📦</span>
                            {isBn ? "ড্যামেজ/মেয়াদোত্তীর্ণ পণ্য কালেকশন" : "Retailer Damage/Expired Product Return"}
                          </h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                            <div className="md:col-span-5 space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">{isBn ? "পণ্য নির্বাচন করুন" : "Select Damaged Product"}</label>
                              <select
                                value={selectedDamageProduct}
                                onChange={(e) => setSelectedDamageProduct(e.target.value)}
                                className="w-full p-2 bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl"
                              >
                                <option value="">-- {isBn ? "সিলেক্ট করুন" : "Choose product"} --</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="md:col-span-3 space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">{isBn ? "ইউনিট" : "Unit"}</label>
                              <select
                                value={damageUnit}
                                onChange={(e) => setDamageUnit(e.target.value as any)}
                                className="w-full p-2 bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl"
                              >
                                <option value="carton">{isBn ? "কার্টন" : "Carton"}</option>
                                <option value="box">{isBn ? "বক্স" : "Box"}</option>
                                <option value="dozen">{isBn ? "ডজন" : "Dozen"}</option>
                                <option value="piece">{isBn ? "পিস" : "Piece"}</option>
                              </select>
                            </div>

                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">{isBn ? "পরিমাণ" : "Qty"}</label>
                              <input
                                type="number"
                                min="1"
                                value={damageQty}
                                onChange={(e) => setDamageQty(e.target.value)}
                                className="w-full p-2 bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl font-mono"
                              />
                            </div>

                            <div className="md:col-span-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!selectedDamageProduct) {
                                    setNotification({ message: isBn ? "পণ্য নির্বাচন করুন" : "Select a product", type: 'error' });
                                    return;
                                  }
                                  const qty = parseInt(damageQty) || 0;
                                  if (qty <= 0) {
                                    setNotification({ message: isBn ? "সঠিক পরিমাণ লিখুন" : "Provide a valid quantity", type: 'error' });
                                    return;
                                  }
                                  const prod = products.find(p => p.id === selectedDamageProduct);
                                  if (!prod) return;

                                  // Determine appropriate rate/cost
                                  let unitPrice = prod.piecePrice || prod.price || 0;
                                  if (damageUnit === 'carton') unitPrice = prod.cartonPrice || (prod.price * (prod.cartonCapacity || 100));
                                  else if (damageUnit === 'box') unitPrice = prod.boxPrice || (prod.price * (prod.boxCapacity || 24));
                                  else if (damageUnit === 'dozen') unitPrice = prod.dozenPrice || (prod.price * 12);

                                  setTempDamageCollections(prev => [
                                    ...prev,
                                    {
                                      productId: prod.id,
                                      productName: prod.name,
                                      unit: damageUnit,
                                      quantity: qty,
                                      unitPrice
                                    }
                                  ]);
                                  setSelectedDamageProduct('');
                                  setDamageQty('0');
                                }}
                                className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs uppercase rounded-xl transition-all text-center block"
                              >
                                {isBn ? "যোগ" : "Add"}
                              </button>
                            </div>
                          </div>

                          {/* Temporary Damage List snippet */}
                          {tempDamageCollections.length > 0 && (
                            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-850 space-y-2">
                              <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest">{isBn ? "কালেক্টেড ড্যামেজ তালিকা" : "Collected Damages Queue"}</span>
                              <div className="space-y-1 text-xs">
                                {tempDamageCollections.map((dmg, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-slate-300">
                                    <span>{dmg.productName} ({dmg.quantity} {dmg.unit})</span>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-violet-400">{currencySymbol}{(dmg.quantity * dmg.unitPrice).toFixed(0)}</span>
                                      <button
                                        type="button"
                                        onClick={() => setTempDamageCollections(prev => prev.filter((_, i) => i !== idx))}
                                        className="text-rose-500 hover:text-rose-400 font-black text-[10px] uppercase"
                                      >
                                        ✖
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Calculated Live Receipt Box */}
                        <div className="p-4 bg-gradient-to-br from-slate-950 to-slate-950/70 border border-slate-850 rounded-2xl space-y-3">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "লাইভ ক্যাশ রিসিট সামারি" : "Live Cash Memo Summary"}</h4>
                          
                          <div className="space-y-1.5 text-xs text-slate-300">
                            <div className="flex justify-between">
                              <span>{isBn ? "মূল চালান মূল্য" : "Original Invoice Total"}:</span>
                              <span className="font-mono">{currencySymbol}{selectedOrderForDelivery.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                            
                            {/* Calculate rejections */}
                            {(() => {
                              const totalRefundVal = selectedOrderForDelivery.items.reduce((sum, item) => {
                                const key = `${selectedOrderForDelivery.id}-${item.productId}-${item.unit}`;
                                const qty = refundQty[key] || 0;
                                return sum + (qty * item.unitPrice);
                              }, 0);
                              
                              const totalCollectedDamageVal = tempDamageCollections.reduce((sum, d) => sum + (d.quantity * d.unitPrice), 0);
                              const finalCollectionAmt = selectedOrderForDelivery.totalAmount - totalRefundVal;
                              
                              return (
                                <>
                                  {totalRefundVal > 0 && (
                                    <div className="flex justify-between text-rose-400 font-bold">
                                      <span>{isBn ? "আংশিক রিফান্ড (রিজেক্ট)" : "Partial Refund (Rejections)"}:</span>
                                      <span className="font-mono">-{currencySymbol}{totalRefundVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                    </div>
                                  )}
                                  
                                  {totalCollectedDamageVal > 0 && (
                                    <div className="flex justify-between text-amber-500 font-bold">
                                      <span>{isBn ? "কালেক্টেড ড্যামেজ মূল্য" : "Collected Damages Value"}:</span>
                                      <span className="font-mono">+{currencySymbol}{totalCollectedDamageVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                    </div>
                                  )}
                                  
                                  {/* Editable Cash Received field for DSR */}
                                  <div className="pt-2 border-t border-slate-850 space-y-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-350 font-extrabold">{isBn ? "প্রকৃত আদায়কৃত নগদ টাকা:" : "Actual Cash Collected:"}</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-emerald-500 font-black">{currencySymbol}</span>
                                        <input
                                          type="number"
                                          step="any"
                                          value={dsrCashCollected}
                                          placeholder={finalCollectionAmt.toFixed(2)}
                                          onChange={(e) => setDsrCashCollected(e.target.value)}
                                          className="w-24 p-1.5 text-right bg-slate-900 border border-slate-800 text-emerald-400 font-mono font-black text-xs rounded-lg outline-none focus:border-emerald-600"
                                        />
                                      </div>
                                    </div>
                                    <p className="text-[9px] text-slate-500 font-bold italic leading-tight">
                                      {isBn 
                                        ? `*খালি রাখলে সম্পূর্ণ আদায়কৃত (${currencySymbol}${finalCollectionAmt.toFixed(2)}) ধরা হবে। আংশিক আদায় হলে বাকি অংশ বকেয়া খাতায় যোগ হবে।`
                                        : `*Leave blank to default to full paid (${currencySymbol}${finalCollectionAmt.toFixed(2)}). Partial dues will auto-adjust outstanding credit balance.`}
                                    </p>
                                  </div>
                                  
                                  <div className="flex justify-between pt-2 border-t border-slate-800 text-sm font-black text-white">
                                    <span>{isBn ? "নেট চালানের মূল্য" : "Net Invoice Amount"}:</span>
                                    <span className="font-mono text-slate-200">{currencySymbol}{finalCollectionAmt.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Delivery Submission Button */}
                        <button
                          type="button"
                          onClick={handleDsrSubmitDelivery}
                          disabled={isSavingClaim}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all text-center block"
                        >
                          {isSavingClaim ? (isBn ? "প্রসেস হচ্ছে..." : "Processing...") : (isBn ? "ডেলিভারি মেমো সম্পন্ন করুন ✔" : "Complete & Confirm Delivery ✔")}
                        </button>

                      </div>
                    ) : (
                      <div className="p-16 text-center border border-dashed border-slate-850 rounded-3xl bg-slate-900/40 text-slate-400 text-xs font-semibold">
                        {isBn ? "বাম পাশের তালিকা থেকে বাজার রুট চালানের দোকানদার নির্বাচন করুন।" : "Please select a retailer outlet from the route list to start delivery."}
                      </div>
                    )}
                  </div>

                </div>

              </div>
            )}

          </div>
        )}

        {/* TAB: RETURNS & CLAIMS VERIFICATION (DEALER / WAREHOUSE PORTAL) */}
        {activeSubTab === 'claims_manager' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">{isBn ? "ডিলার রিটার্ন ও ড্যামেজ ক্লেম ভেরিফিকেশন" : "Returns & Damage Physical Verification"}</h3>
                <p className="text-[11px] text-slate-400 font-semibold">{isBn ? "DSR-দের মাঠ পর্যায় থেকে কালেক্ট করা রিফান্ড এবং ড্যামেজ পণ্যসমূহের ফিজিক্যাল চেক ও অনুমোদন ড্যাশবোর্ড।" : "Live pending claim validations, physical warehouse checkouts, and ledger writebacks."}</p>
              </div>
            </div>

            {/* Grid layout containing Pending claims & Company damage ledger */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Side: Pending Claims list */}
              <div className="lg:col-span-8 space-y-4">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                    <span>{isBn ? "অনুমোদনের জন্য অপেক্ষারত ক্লেম সমূহ" : "Pending Verification Queue"}</span>
                    <span className="px-2 py-0.5 bg-violet-950 text-violet-300 text-[9px] rounded-full font-bold">
                      {claims.filter(cl => cl.status === 'Pending Verification').length} {isBn ? "টি পেন্ডিং" : "Claims"}
                    </span>
                  </h4>

                  {claims.filter(cl => cl.status === 'Pending Verification').length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400 font-semibold">
                      {isBn ? "বর্তমানে কোনো রিফান্ড বা ড্যামেজ ক্লেম যাচাইকরণের জন্য অপেক্ষারত নেই।" : "No pending return claims left to physically verify right now."}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {claims.filter(cl => cl.status === 'Pending Verification').map(claim => {
                        const isRefund = claim.type === 'Refund';
                        return (
                          <div key={claim.id} className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-slate-800">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-[8px] font-black uppercase rounded ${
                                  isRefund ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'
                                }`}>
                                  {isRefund ? (isBn ? "রিফান্ড/রিজেক্ট" : "Partial Refund") : (isBn ? "মেয়াদোত্তীর্ণ/ড্যামেজ" : "Damage Collection")}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold">Ref: #{claim.orderId.substring(0,6).toUpperCase()}</span>
                              </div>
                              
                              <h4 className="text-xs font-black text-slate-200">
                                {claim.productName} ({claim.quantity} {claim.unit})
                              </h4>
                              
                              <p className="text-[10px] text-slate-400 font-medium">
                                {isBn ? "দোকানদার:" : "Store:"} <span className="font-bold text-slate-300">{claim.retailerName}</span> • DSR: <span className="font-bold text-slate-300">{claim.dsrName}</span>
                              </p>
                              
                              <p className="text-[9px] text-slate-500 font-semibold">
                                {isBn ? "কোম্পানি:" : "Brand:"} {claim.companyName} • {new Date(claim.createdAt).toLocaleString('en-US', {hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric'})}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 self-end md:self-auto">
                              <div className="text-right">
                                <span className="text-[9px] text-slate-500 block uppercase font-bold">{isBn ? "মোট মূল্য" : "Claim Value"}</span>
                                <span className="text-sm font-mono font-black text-violet-400">{currencySymbol}{claim.totalPrice.toLocaleString(undefined, {minimumFractionDigits: 1})}</span>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleRejectClaim(claim.id)}
                                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 text-[10px] uppercase font-bold rounded-lg transition-all"
                                >
                                  {isBn ? "বাতিল" : "Reject"}
                                </button>
                                
                                <button
                                  onClick={() => handleApproveClaim(claim)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] uppercase font-black rounded-lg transition-all flex items-center gap-1"
                                >
                                  <span>{isBn ? "অনুমোদন ✔" : "Approve ✔"}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Approved/Rejected History tab inside Claims Manager */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{isBn ? "যাচাইকৃত ক্লেমের ইতিহাস" : "Verification Log History"}</h4>
                  
                  {claims.filter(cl => cl.status !== 'Pending Verification').length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      {isBn ? "কোনো আর্কাইভ করা ক্লেম ট্র্যাকিং রেকর্ড নেই।" : "No verified claims in archive ledger history."}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                      {claims.filter(cl => cl.status !== 'Pending Verification').slice(0, 15).map(claim => {
                        const isApp = claim.status === 'Approved';
                        return (
                          <div key={claim.id} className="p-3 bg-slate-950/20 border border-slate-850 rounded-xl flex justify-between items-center text-xs text-slate-300">
                            <div>
                              <div className="font-bold flex items-center gap-2">
                                <span>{claim.productName}</span>
                                <span className="text-[10px] font-mono text-slate-500">({claim.quantity} {claim.unit})</span>
                              </div>
                              <p className="text-[9px] text-slate-500 mt-0.5">DSR: {claim.dsrName} • {claim.retailerName} ({claim.type})</p>
                            </div>
                            
                            <div className="text-right">
                              <span className="font-mono font-bold text-slate-400 block">{currencySymbol}{claim.totalPrice}</span>
                              <span className={`text-[9px] font-black uppercase ${isApp ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {isApp ? "Approved ✔" : "Rejected ✖"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Company Damage Ledger Cumulative Summary */}
              <div className="lg:col-span-4 space-y-4">
                
                {/* Physical Damage Stock view by product */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span>⚠️</span>
                    {isBn ? "ডিলারের বর্তমান ড্যামেজ ইনভেন্টরি" : "Dealer Damage Stock"}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-semibold">{isBn ? "অনুমোদিত ড্যামেজ পণ্যের বর্তমান অবশিষ্টাংশ।" : "Active inventory storage of checked damaged items."}</p>
                  
                  <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                    {products.filter(p => (p.damageStock || 0) > 0).map(prod => (
                      <div key={prod.id} className="p-2.5 bg-slate-950/40 border border-slate-850 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <span className="font-extrabold text-slate-200 block">{prod.name}</span>
                          <span className="text-[9px] text-slate-500">{prod.companyName}</span>
                        </div>
                        <span className="px-2 py-1 bg-amber-950/60 text-amber-400 font-mono font-black text-[11px] rounded-lg">
                          {prod.damageStock} Pcs
                        </span>
                      </div>
                    ))}
                    {products.filter(p => (p.damageStock || 0) > 0).length === 0 && (
                      <div className="p-4 text-center text-xs text-slate-500">
                        {isBn ? "ইনভেন্টরিতে কোনো ড্যামেজ স্টক নেই।" : "No physical damage stock currently logged."}
                      </div>
                    )}
                  </div>
                </div>

                {/* Company Damage Ledger value sheet */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span>📊</span>
                    {isBn ? "কোম্পানি ড্যামেজ লেজার বুক" : "Company Damage Ledger"}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-semibold">{isBn ? "উৎপাদক কোম্পানির নিকট ক্ষতিপূরণের জন্য মোট জমাকৃত ক্লেম মূল্য।" : "Aggregated manufacturing claim ledgers for physical writebacks."}</p>

                  <div className="space-y-2.5">
                    {(() => {
                      // Group and aggregate cumulative values by companyName from companyDamageLedger
                      const sums: {[comp: string]: number} = {};
                      companyDamageLedger.forEach(item => {
                        sums[item.companyName] = (sums[item.companyName] || 0) + (item.totalValue || 0);
                      });
                      
                      const keys = Object.keys(sums);
                      if (keys.length === 0) {
                        return (
                          <div className="p-4 text-center text-xs text-slate-500">
                            {isBn ? "কোম্পানি লেজারে কোনো অনুমোদিত ড্যামেজ এন্ট্রি নেই।" : "No approved company claims recorded yet."}
                          </div>
                        );
                      }
                      
                      return keys.map(comp => (
                        <div key={comp} className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl flex justify-between items-center text-xs font-bold">
                          <div>
                            <span className="text-slate-300 block">{comp}</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase">{isBn ? "ড্যামেজ লেজার ব্যালেন্স" : "Damages Ledger Balance"}</span>
                          </div>
                          <span className="font-mono font-black text-rose-400">
                            {currencySymbol}{sums[comp].toLocaleString(undefined, {minimumFractionDigits: 1})}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB: COMPANY PROFILES */}
        {activeSubTab === 'companies' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Register Company Form */}
              <div className="lg:col-span-1 bg-slate-50 dark:bg-slate-950/30 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 space-y-4 h-fit">
                <div>
                  <span className="text-[9px] font-black uppercase text-violet-600 tracking-wider">Configure partners</span>
                  <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">
                    {isBn ? "কোম্পানি প্রোফাইল যুক্ত করুন" : "Register Distribution Company"}
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-1">
                    {isBn ? "নতুন কোম্পানি প্রোফাইল তৈরি করুন এবং তাদের আন্ডারে পণ্য ডিস্ট্রিবিউশন ট্র্যাক করুন।" : "Define bulk manufacturing entities to tag your local stock profiles."}
                  </p>
                </div>

                <form onSubmit={handleSaveCompany} className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "কোম্পানির নাম" : "Company Name"} *</label>
                    <input
                      type="text"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder={isBn ? "যেমন: Unilever Bangladesh" : "e.g. Pran-RFL Group"}
                      className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "যোগাযোগের ফোন নাম্বার" : "Contact Phone"}</label>
                    <input
                      type="text"
                      value={newCompanyPhone}
                      onChange={(e) => setNewCompanyPhone(e.target.value)}
                      placeholder={isBn ? "যেমন: 09612345678" : "e.g. 01712345678"}
                      className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "অফিস ঠিকানা" : "Office Address"}</label>
                    <textarea
                      value={newCompanyAddress}
                      onChange={(e) => setNewCompanyAddress(e.target.value)}
                      placeholder={isBn ? "যেমন: তেজগাঁও, ঢাকা" : "e.g. Tejgaon, Dhaka"}
                      className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none h-20 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingCompany}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 text-white font-black text-xs uppercase tracking-wider rounded-xl text-center flex justify-center items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {isSavingCompany ? (isBn ? "সংরক্ষণ করা হচ্ছে..." : "Saving...") : (isBn ? "কোম্পানি সেভ করুন" : "Save Company Profile")}
                  </button>
                </form>
              </div>

              {/* Right Column: Companies Directory List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">{isBn ? "নিবন্ধিত কোম্পানি সমূহ" : "Registered Brand Profiles"}</h4>
                    <p className="text-[11px] text-slate-400 font-semibold">{isBn ? "বর্তমানে আপনার আন্ডারে নিবন্ধিত কোম্পানির তালিকা।" : "Manufacturing houses supplying goods to your distributor house."}</p>
                  </div>
                  <span className="px-3 py-1 bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 font-black text-xs rounded-full">
                    {companies.length} {isBn ? "টি কোম্পানি" : "Companies"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {companies.map((company) => {
                    // Count how many products belong to this company
                    const productCount = products.filter(p => p.companyName === company.name).length;
                    return (
                      <div key={company.id} className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl relative group flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{company.name}</h4>
                            <button
                              onClick={() => handleDeleteCompany(company.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50/50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                              title="Delete Profile"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          {company.phone && (
                            <p className="text-[11px] text-slate-500 font-semibold mt-1">
                              <strong>Phone:</strong> {company.phone}
                            </p>
                          )}
                          {company.address && (
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5 line-clamp-1">
                              <strong>Address:</strong> {company.address}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-200/40 flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-violet-600 tracking-wider">
                            {productCount} {isBn ? "টি প্রোডাক্ট" : "Products"}
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">ID: {company.id}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB: MULTI-UNIT INVENTORY */}
        {activeSubTab === 'inventory' && (
          <div className="p-6 space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Add / Edit Product Form */}
              <div className="lg:col-span-1 bg-slate-50 dark:bg-slate-950/30 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-black uppercase text-violet-600 tracking-wider">
                      {isEditingProduct ? (isBn ? "পণ্য এডিট করুন" : "Update Existing Good") : (isBn ? "নতুন পণ্য যোগ করুন" : "Configure Inventory Good")}
                    </span>
                    <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">
                      {isEditingProduct ? (isBn ? "এডিট মুড সক্রিয়" : "Edit Product Details") : (isBn ? "ডিস্ট্রিবিউটর প্রোডাক্ট" : "Wholesale Stock Loader")}
                    </h3>
                  </div>
                  {isEditingProduct && (
                    <button
                      onClick={handleResetProductForm}
                      className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-bold text-[10px] rounded-lg"
                    >
                      {isBn ? "বাতিল" : "Cancel"}
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveProduct} className="space-y-4 pt-1">
                  
                  {/* Select Company Dropdown (Required) */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "কোম্পানি নির্বাচন" : "Select Partner Company"} *</label>
                    <select
                      value={productCompany}
                      onChange={(e) => setProductCompany(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      required
                    >
                      <option value="">{isBn ? "-- কোম্পানি সিলেক্ট করুন --" : "-- Select Company --"}</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Product Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "পণ্যের নাম" : "Product Name"} *</label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder={isBn ? "যেমন: হুইল সাবান ১৩০ গ্রাম" : "e.g. Lux Soap Velvet Touch"}
                      className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Category */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ক্যাটাগরি" : "Category"}</label>
                      <input
                        type="text"
                        value={productCategory}
                        onChange={(e) => setProductCategory(e.target.value)}
                        placeholder={isBn ? "যেমন: সাবান" : "e.g. Soap"}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                      />
                    </div>

                    {/* Stock (Single pieces) */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "স্টক (সিঙ্গেল পিস)" : "Stock (Single Pcs)"} *</label>
                      <input
                        type="number"
                        value={productStock}
                        onChange={(e) => setProductStock(e.target.value)}
                        placeholder="e.g. 500"
                        className="w-full text-xs font-mono font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Buying Cost (per Single piece) */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "কেনা দাম (পিস)" : "Buying Cost (Pcs)"} *</label>
                      <input
                        type="number"
                        step="any"
                        value={productCost}
                        onChange={(e) => setProductCost(e.target.value)}
                        placeholder="e.g. 15"
                        className="w-full text-xs font-mono font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                        required
                      />
                    </div>

                    {/* Retail Price (per Single piece) */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "খুচরা বিক্রয় মূল্য (পিস)" : "Retail Price (Pcs)"} *</label>
                      <input
                        type="number"
                        step="any"
                        value={productRetail}
                        onChange={(e) => setProductRetail(e.target.value)}
                        placeholder="e.g. 20"
                        className="w-full text-xs font-mono font-bold px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Multi-Unit Pricing and Barcodes Section */}
                  <div className="border-t border-slate-200/60 pt-3 space-y-4">
                    <span className="text-[10px] font-black text-violet-600 uppercase tracking-widest block">
                      {isBn ? "মাল্টি-ইউনিট বারকোড ও রেট কনফিগারেশন" : "Multi-Unit Pricing & Barcodes"}
                    </span>

                    {/* Carton Pricing and Carton Barcode */}
                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-150/60 space-y-2.5">
                      <span className="text-[10px] font-black uppercase text-indigo-600">{isBn ? "কার্টন (Carton)" : "Carton (Bulk)"}</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{isBn ? "সাইজ (পিস)" : "Size (Pcs)"}</label>
                          <input
                            type="number"
                            value={cartonCapacity}
                            onChange={(e) => setCartonCapacity(e.target.value)}
                            className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{isBn ? "কার্টন মূল্য" : "Carton Price"}</label>
                          <input
                            type="number"
                            step="any"
                            value={cartonPrice}
                            onChange={(e) => setCartonPrice(e.target.value)}
                            placeholder="e.g. 1500"
                            className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{isBn ? "কার্টন বারকোড (Carton Barcode)" : "Carton Barcode"}</label>
                        <input
                          type="text"
                          value={cartonBarcode}
                          onChange={(e) => setCartonBarcode(e.target.value)}
                          placeholder="Scan carton barcode"
                          className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Box Pricing and Box Barcode */}
                    <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-150/60 space-y-2.5">
                      <span className="text-[10px] font-black uppercase text-indigo-600">{isBn ? "বক্স (Box)" : "Box (Pack)"}</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{isBn ? "সাইজ (পিস)" : "Size (Pcs)"}</label>
                          <input
                            type="number"
                            value={boxCapacity}
                            onChange={(e) => setBoxCapacity(e.target.value)}
                            className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{isBn ? "বক্স মূল্য" : "Box Price"}</label>
                          <input
                            type="number"
                            step="any"
                            value={boxPrice}
                            onChange={(e) => setBoxPrice(e.target.value)}
                            placeholder="e.g. 400"
                            className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">{isBn ? "বক্স বারকোড (Box Barcode)" : "Box Barcode"}</label>
                        <input
                          type="text"
                          value={boxBarcode}
                          onChange={(e) => setBoxBarcode(e.target.value)}
                          placeholder="Scan box barcode"
                          className="w-full text-xs font-mono font-bold px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Dozen & Single Piece */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      
                      {/* Dozen */}
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-150/60 space-y-1.5">
                        <span className="text-[9px] font-black uppercase text-indigo-600 block">{isBn ? "ডজন (Dozen)" : "Dozen (12 Pcs)"}</span>
                        <input
                          type="number"
                          step="any"
                          value={dozenPrice}
                          onChange={(e) => setDozenPrice(e.target.value)}
                          placeholder={isBn ? "ডজন মূল্য" : "Dozen Price"}
                          className="w-full text-xs font-mono font-bold px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                        />
                        <input
                          type="text"
                          value={dozenBarcode}
                          onChange={(e) => setDozenBarcode(e.target.value)}
                          placeholder="Dozen Barcode"
                          className="w-full text-xs font-mono font-bold px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                        />
                      </div>

                      {/* Single Piece */}
                      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-150/60 space-y-1.5">
                        <span className="text-[9px] font-black uppercase text-indigo-600 block">{isBn ? "সিঙ্গেল পিস (Piece)" : "Single Piece"}</span>
                        <input
                          type="number"
                          step="any"
                          value={piecePrice}
                          onChange={(e) => setPiecePrice(e.target.value)}
                          placeholder={isBn ? "পিস মূল্য" : "Piece Price"}
                          className="w-full text-xs font-mono font-bold px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                        />
                        <input
                          type="text"
                          value={pieceBarcode}
                          onChange={(e) => setPieceBarcode(e.target.value)}
                          placeholder="Piece Barcode"
                          className="w-full text-xs font-mono font-bold px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-150 rounded-lg"
                        />
                      </div>

                    </div>

                  </div>

                  <button
                    type="submit"
                    disabled={isSavingProduct}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black text-xs uppercase tracking-wider rounded-xl text-center flex justify-center items-center gap-2 mt-4"
                  >
                    <Plus className="w-4 h-4" />
                    {isSavingProduct ? (isBn ? "সংরক্ষণ করা হচ্ছে..." : "Saving...") : (isEditingProduct ? (isBn ? "পণ্য আপডেট করুন" : "Update Product") : (isBn ? "পণ্য যোগ করুন" : "Add Product to Stock"))}
                  </button>
                </form>
              </div>

              {/* Right Column: Inventory List & Filters */}
              <div className="lg:col-span-2 space-y-4">
                
                {/* Filters Row */}
                <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-4 justify-between items-center">
                  
                  {/* Search input (scans barcode or name) */}
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={inventorySearchQuery}
                      onChange={(e) => setInventorySearchQuery(e.target.value)}
                      placeholder={isBn ? "নাম, বারকোড বা কোড দিয়ে খুঁজুন..." : "Search by name, code, barcode..."}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none text-xs font-semibold"
                    />
                  </div>

                  {/* Company Filter Dropdown */}
                  <div className="w-full md:w-64">
                    <select
                      value={selectedFilterCompany}
                      onChange={(e) => setSelectedFilterCompany(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl outline-none"
                    >
                      <option value="">{isBn ? "সকল কোম্পানি স্টক" : "All Companies Stock"}</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                </div>

                {/* Company Stock Value Analytics Box */}
                {(() => {
                  // Calculate metrics based on filtered company
                  const filteredCompProd = products.filter(p => !selectedFilterCompany || p.companyName === selectedFilterCompany);
                  const totalPcs = filteredCompProd.reduce((acc, cr) => acc + (cr.stock || 0), 0);
                  const totalVal = filteredCompProd.reduce((acc, cr) => acc + ((cr.stock || 0) * (cr.cost || 0)), 0);

                  return (
                    <div className="grid grid-cols-2 gap-4 bg-gradient-to-r from-violet-600 to-indigo-600 p-5 rounded-3xl text-white shadow-md">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-wider text-violet-200">
                          {selectedFilterCompany ? `${selectedFilterCompany} Stock Value` : (isBn ? "মোট ইনভেন্টরি স্টক মূল্য" : "Total Stock Value")}
                        </span>
                        <h3 className="text-2xl font-black mt-1">
                          {currencySymbol}{totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h3>
                      </div>
                      <div className="text-right border-l border-white/20 pl-4">
                        <span className="text-[9px] font-black uppercase tracking-wider text-violet-200">
                          {isBn ? "মোট একক পিস কোয়ান্টিটি" : "Total Single Piece Stock"}
                        </span>
                        <h3 className="text-2xl font-black mt-1">
                          {totalPcs.toLocaleString()} {isBn ? "পিস" : "Pcs"}
                        </h3>
                      </div>
                    </div>
                  );
                })()}

                {/* Products Grid */}
                {(() => {
                  // Filters products list
                  const filteredInventory = products.filter(p => {
                    const matchesCompany = !selectedFilterCompany || p.companyName === selectedFilterCompany;
                    const searchLower = inventorySearchQuery.toLowerCase().trim();
                    if (!searchLower) return matchesCompany;

                    const matchesSearch = 
                      (p.name || '').toLowerCase().includes(searchLower) ||
                      (p.companyName || '').toLowerCase().includes(searchLower) ||
                      (p.category || '').toLowerCase().includes(searchLower) ||
                      (p.barcode || '').toLowerCase().includes(searchLower) ||
                      (p.cartonBarcode || '').toLowerCase().includes(searchLower) ||
                      (p.boxBarcode || '').toLowerCase().includes(searchLower) ||
                      (p.dozenBarcode || '').toLowerCase().includes(searchLower) ||
                      (p.pieceBarcode || '').toLowerCase().includes(searchLower);

                    return matchesCompany && matchesSearch;
                  });

                  if (filteredInventory.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-100 rounded-3xl text-center text-slate-400">
                        <Search className="w-10 h-10 text-slate-300 mb-2" />
                        <p className="font-extrabold text-xs">{isBn ? "কোনো পণ্য খুঁজে পাওয়া যায়নি" : "No product found"}</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3.5 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
                      {filteredInventory.map(p => {
                        // Display stocks in Cartons/Boxes/Pieces representation for realistic FMCG layout
                        const cartonCap = p.cartonCapacity || 100;
                        const boxCap = p.boxCapacity || 24;
                        
                        const stockPcs = p.stock || 0;
                        const cartonStock = Math.floor(stockPcs / cartonCap);
                        const remainingAfterCartons = stockPcs % cartonCap;
                        const boxStock = Math.floor(remainingAfterCartons / boxCap);
                        const loosePieces = remainingAfterCartons % boxCap;

                        return (
                          <div key={p.id} className="p-4 bg-white dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-200 transition-all">
                            
                            {/* Product Info */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-extrabold text-[9px] rounded uppercase tracking-wider">
                                  {p.companyName || (isBn ? "অনির্ধারিত কোম্পানি" : "No Company")}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">{p.category}</span>
                              </div>
                              <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">{p.name}</h4>
                              
                              {/* Stock Display Breakdown */}
                              <div className="flex items-center gap-3 text-xs pt-1.5">
                                <div className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-black rounded-lg">
                                  {isBn ? "মোট স্টক:" : "Total Stock:"} {stockPcs} {isBn ? "পিস" : "Pcs"}
                                </div>
                                <div className="text-[10.5px] text-slate-400 font-semibold italic">
                                  ↳ {cartonStock} {isBn ? "কার্টন" : "Carton"} {boxStock} {isBn ? "বক্স" : "Box"} {loosePieces} {isBn ? "পিস" : "Pcs"}
                                </div>
                              </div>
                            </div>

                            {/* Multi-Unit Details & Prices Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center min-w-[320px]">
                              
                              {/* Carton price & barcode */}
                              <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">{isBn ? "কার্টন (Carton)" : "Carton"}</span>
                                <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200 block mt-0.5">
                                  {p.cartonPrice ? `${currencySymbol}${p.cartonPrice}` : '--'}
                                </span>
                                {p.cartonBarcode && (
                                  <span className="text-[8px] font-mono text-slate-400 truncate block mt-0.5 max-w-[80px] mx-auto" title={p.cartonBarcode}>
                                    {p.cartonBarcode}
                                  </span>
                                )}
                              </div>

                              {/* Box price & barcode */}
                              <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-150 rounded-xl">
                                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">{isBn ? "বক্স (Box)" : "Box"}</span>
                                <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200 block mt-0.5">
                                  {p.boxPrice ? `${currencySymbol}${p.boxPrice}` : '--'}
                                </span>
                                {p.boxBarcode && (
                                  <span className="text-[8px] font-mono text-slate-400 truncate block mt-0.5 max-w-[80px] mx-auto" title={p.boxBarcode}>
                                    {p.boxBarcode}
                                  </span>
                                )}
                              </div>

                              {/* Dozen Price */}
                              <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider block">{isBn ? "ডজন (Dozen)" : "Dozen"}</span>
                                <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200 block mt-0.5">
                                  {p.dozenPrice ? `${currencySymbol}${p.dozenPrice}` : '--'}
                                </span>
                                {p.dozenBarcode && (
                                  <span className="text-[8px] font-mono text-slate-400 truncate block mt-0.5 max-w-[80px] mx-auto" title={p.dozenBarcode}>
                                    {p.dozenBarcode}
                                  </span>
                                )}
                              </div>

                              {/* Single Piece Price */}
                              <div className="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                <span className="text-[8px] font-black uppercase text-indigo-600 tracking-wider block">{isBn ? "পিস (Piece)" : "Piece"}</span>
                                <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200 block mt-0.5">
                                  {p.piecePrice ? `${currencySymbol}${p.piecePrice}` : `${currencySymbol}${p.price}`}
                                </span>
                                {(p.pieceBarcode || p.barcode) && (
                                  <span className="text-[8px] font-mono text-slate-400 truncate block mt-0.5 max-w-[80px] mx-auto" title={p.pieceBarcode || p.barcode}>
                                    {p.pieceBarcode || p.barcode}
                                  </span>
                                )}
                              </div>

                            </div>

                            {/* Action Buttons */}
                            <div className="flex md:flex-col justify-end gap-2 shrink-0 border-t md:border-t-0 pt-2 md:pt-0">
                              <button
                                onClick={() => handleStartEditProduct(p)}
                                className="px-3 py-1.5 bg-violet-100 hover:bg-violet-200 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 font-extrabold text-[10.5px] rounded-xl transition-all"
                              >
                                {isBn ? "এডিট" : "Edit"}
                              </button>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

              </div>

            </div>
          </div>
        )}

        {/* TAB 1: BULK CHALLAN GENERATION */}
        {activeSubTab === 'challan' && (
          <div className="p-6 space-y-8">
            
            {/* Real-time Field Order Cutting Queue */}
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-violet-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-black text-violet-700 dark:text-violet-400 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-600 animate-ping"></span>
                    {isBn ? "এসআর পেন্ডিং ফিল্ড বুকিং লিস্ট (রিয়েল-টাইম)" : "SR Pending Field Bookings Queue (Real-Time)"}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-semibold">
                    {isBn ? "মাঠ পর্যায়ে কর্মরত এসআর-দের পাঠানো সাম্প্রতিক কাস্টমার অর্ডার সমূহ।" : "Incoming commercial bookings cut by SR field representatives."}
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-black text-xs rounded-full">
                  {orders.filter(o => o.status === 'Pending').length} {isBn ? "টি পেন্ডিং" : "Pending"}
                </span>
              </div>

              {orders.filter(o => o.status === 'Pending').length === 0 ? (
                <div className="p-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50 dark:bg-slate-950/20 text-slate-400 text-xs font-semibold">
                  {isBn ? "বর্তমানে কোনো নতুন পেন্ডিং ফিল্ড বুকিং নেই। এসআর পোর্টাল থেকে নতুন অর্ডার করুন।" : "No pending bookings from the field force right now."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {orders.filter(o => o.status === 'Pending').map(ord => {
                    return (
                      <div key={ord.id} className="p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-950/40 dark:to-slate-950/10 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 relative group">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="px-2 py-0.5 bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-[8px] font-black uppercase rounded">
                              {ord.companyName} SR Booking
                            </span>
                            <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1.5">{ord.retailerName}</h4>
                            <p className="text-[10px] text-slate-400 font-semibold">{ord.beat} • SR: {ord.srName}</p>
                          </div>
                          <span className="text-[9px] font-mono font-bold text-slate-400">
                            #{ord.id.substring(0,6).toUpperCase()}
                          </span>
                        </div>

                        {/* Items ordered list snippet */}
                        <div className="p-2.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-150 dark:border-slate-800 space-y-1 max-h-[100px] overflow-y-auto custom-scrollbar">
                          {ord.items.map((it, i) => (
                            <div key={i} className="flex justify-between text-[10px] font-medium text-slate-600 dark:text-slate-300">
                              <span>{it.productName} ({it.quantity} {it.unit})</span>
                              <span className="font-bold">{currencySymbol}{it.totalPrice.toFixed(0)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase">Total Amount</span>
                            <span className="text-sm font-mono font-black text-violet-600">
                              {currencySymbol}{ord.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                if (!window.confirm(isBn ? 'অর্ডারটি কি রিজেক্ট করতে চান?' : 'Are you sure you want to reject this order?')) return;
                                try {
                                  await deleteDoc(doc(db, 'dealership_orders', ord.id));
                                  setNotification({ message: isBn ? "অর্ডারটি বাতিল করা হয়েছে" : "Order deleted", type: 'success' });
                                } catch (e: any) {
                                  setNotification({ message: e.message, type: 'error' });
                                }
                              }}
                              className="px-2.5 py-1.5 bg-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 font-bold text-[10px] uppercase rounded-lg transition-all"
                            >
                              {isBn ? "বাতিল" : "Reject"}
                            </button>

                            <button
                              onClick={async () => {
                                try {
                                  await updateDoc(doc(db, 'dealership_orders', ord.id), {
                                    status: 'Dispatched'
                                  });
                                  setNotification({ message: isBn ? "অর্ডার চালান কনফার্ম এবং ডিসপ্যাচ করা হয়েছে!" : "Order dispatched as official Challan!", type: 'success' });
                                } catch (e: any) {
                                  setNotification({ message: e.message, type: 'error' });
                                }
                              }}
                              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-[10px] uppercase rounded-lg transition-all"
                            >
                              {isBn ? "ডিসপ্যাচ ✔" : "Dispatch ✔"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">{isBn ? "সক্রিয় ডিলার চালান রেকর্ড তালিকা" : "Wholesale Dispatched Delivery Challans"}</h3>
                <p className="text-[11px] text-slate-400 font-semibold">{isBn ? "ডিস্ট্রিবিউশন চ্যানেলে পাঠানো সমস্ত চালানের বর্তমান ট্র্যাকিং স্ট্যাটাস।" : "Live list containing dispatched cargo, expected delivery area, and agent signoffs."}</p>
              </div>

              <button
                onClick={() => {
                  setChallanItems([]);
                  setSelectedDealerForChallan(dealers[0] || null);
                  setSelectedAgentForChallan(agents[0] || null);
                  setShowChallanModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-600/15 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                {isBn ? "নতুন চালান জেনারেট করুন" : "Generate Commercial Challan"}
              </button>
            </div>

            {/* Challans Table Grid */}
            <div className="border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-950/20">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "চালান নম্বর" : "Challan No"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ডিলার গ্রাহক" : "Dealer Customer"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "এরিয়া ও এজেন্ট" : "Area & Representative Agent"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "আইটেম বিবরণী" : "Goods count"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{isBn ? "স্ট্যাটাস" : "Status Flow"}</th>
                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{isBn ? "অ্যাকশন" : "Action Line"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {challans.map(ch => {
                    const totalCostVal = ch.items.reduce((s, cr) => s + (cr.qty * cr.price), 0);
                    return (
                      <tr key={ch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-all">
                        <td className="p-4">
                          <span className="font-mono font-black text-xs text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1 rounded-lg">
                            {ch.challanNo}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{ch.dealerName}</div>
                          <div className="text-[9px] font-bold text-slate-400 mt-0.5">{ch.dealerPhone}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-violet-500" />
                            {ch.area || 'N/A'}
                          </div>
                          {ch.agentName && <div className="text-[9.5px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide">Rep: {ch.agentName}</div>}
                        </td>
                        <td className="p-4">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {ch.items.length} Category lines
                          </div>
                          <div className="text-[10px] text-violet-600 font-extrabold mt-0.5">
                            Total valuation: {currencySymbol}{totalCostVal}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-[9.5px] font-black uppercase px-2.5 py-1 rounded-full ${
                            ch.status === 'Dispatched' ? 'bg-amber-100 text-amber-800' :
                            ch.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {ch.status}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => handlePrintChallan(ch)}
                              className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 border border-slate-100 dark:border-slate-700"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              {isBn ? "প্রিন্ট" : "Print"}
                            </button>
                            {ch.status === 'Dispatched' && (
                              <button
                                onClick={() => handleUpdateChallanStatus(ch.id, 'Delivered')}
                                className="p-1 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-wide"
                              >
                                {isBn ? "ডেলিভারড" : "Delivered"}
                              </button>
                            )}
                            {ch.status === 'Dispatched' && (
                              <button
                                onClick={() => handleUpdateChallanStatus(ch.id, 'Returned')}
                                className="p-1 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[10px] font-black uppercase tracking-wide"
                              >
                                {isBn ? "ফেরত" : "Returned"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MODAL / POPUP PANEL TO DISPATCH NEW COMMERCIAL CHALLAN */}
            <AnimatePresence>
              {showChallanModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 max-w-3xl w-full shadow-2xl relative"
                  >
                    <button 
                      onClick={() => setShowChallanModal(false)}
                      className="absolute top-4 right-4 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-full text-slate-500 hover:text-slate-700 font-bold"
                    >
                      [X] Close
                    </button>

                    <h3 className="text-base font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Truck className="w-5 h-5 text-violet-600" />
                      {isBn ? "নতুন পাইকারি চালান জেনারেটর" : "Draft Commercial Wholesaler Challan Sheet"}
                    </h3>

                    <form onSubmit={handleCreateChallan} className="space-y-4 mt-4">
                      
                      {/* Selection of dealer & Agent */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ডিলার সিলেক্ট করুন" : "Pick Dealer Account"} *</label>
                          <select
                            onChange={(e) => {
                              const found = dealers.find(d => d.id === e.target.value);
                              setSelectedDealerForChallan(found || null);
                            }}
                            className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                            required
                          >
                            <option value="">-- Click here to select Dealer --</option>
                            {dealers.map(d => (
                              <option key={d.id} value={d.id}>{d.name} ({d.company || 'Distributor Channel'})</option>
                            ))}
                          </select>
                          {selectedDealerForChallan && (
                            <div className="text-[10px] text-indigo-600 font-bold mt-1">
                              Credit Limit: {currencySymbol}{selectedDealerForChallan.creditLimit} | Out: {currencySymbol}{selectedDealerForChallan.currentBalance}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ডেলিভারি রিপ্রেজেন্টেটিভ" : "Delivery Representative / Agent"}</label>
                          <select
                            onChange={(e) => {
                              const found = agents.find(ag => ag.id === e.target.value);
                              setSelectedAgentForChallan(found || null);
                            }}
                            className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                          >
                            <option value="">-- Pick S/R Comm Agent --</option>
                            {agents.map(ag => (
                              <option key={ag.id} value={ag.id}>{ag.name} ({ag.area} Area)</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Add Item Line in the challan */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-3">
                        <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">{isBn ? "চালানের মালামাল সিলেক্ট করুন" : "Insert Goods Line into Challan Sheet"}</span>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <div className="col-span-2">
                            <select
                              id="challan-add-product"
                              className="w-full text-xs font-bold px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-150 rounded-xl"
                              onChange={(e) => {
                                const prod = products.find(p => p.id === e.target.value);
                                if (prod) {
                                  // Auto add to items with moq as qty
                                  const already = challanItems.some(i => i.product.id === prod.id);
                                  if (!already) {
                                    setChallanItems(prev => [
                                      ...prev,
                                      { product: prod, qty: prod.moq || 10, targetPrice: prod.wholesalePrice || prod.price }
                                    ]);
                                  }
                                }
                              }}
                            >
                              <option value="">-- Select Product item --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} (Wholesale: {currencySymbol}{p.wholesalePrice || p.price})</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2 flex items-center justify-end">
                            <span className="text-[10.5px] font-bold text-slate-400 italic">Picked categories display below:</span>
                          </div>
                        </div>

                        {/* List of draft Items */}
                        <div className="space-y-2 mt-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                          {challanItems.map((ln, idx) => (
                            <div key={ln.product.id} className="flex flex-col md:flex-row items-center gap-3 bg-white dark:bg-slate-900 justify-between p-2.5 rounded-xl border border-slate-100">
                              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{ln.product.name}</span>
                              <div className="flex items-center gap-3">
                                <div className="space-y-0.5">
                                  <label className="text-[8px] uppercase font-bold text-slate-400">Qty (MOQ: {ln.product.moq || 10})</label>
                                  <input
                                    type="number"
                                    value={ln.qty}
                                    onChange={(e) => {
                                      const val = Math.max(1, parseInt(e.target.value) || 1);
                                      setChallanItems(prev => prev.map((pr, pidx) => pidx === idx ? { ...pr, qty: val } : pr));
                                    }}
                                    className="w-16 text-center font-mono font-bold text-xs border border-slate-100 rounded p-1"
                                  />
                                </div>
                                <div className="space-y-0.5">
                                  <label className="text-[8px] uppercase font-bold text-slate-400">Wholesale Rate</label>
                                  <input
                                    type="number"
                                    value={ln.targetPrice}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      setChallanItems(prev => prev.map((pr, pidx) => pidx === idx ? { ...pr, targetPrice: val } : pr));
                                    }}
                                    className="w-20 text-center font-mono font-bold text-xs border border-slate-100 rounded p-1"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setChallanItems(prev => prev.filter((_, pidx) => pidx !== idx))}
                                  className="text-rose-500 hover:text-rose-700 font-bold text-xs mt-3"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                          {challanItems.length === 0 && (
                            <div className="text-center py-4 text-slate-400 text-xs italic">
                              No products chosen yet. Click dropdown selector above.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Display estimated Grand Total */}
                      <div className="flex justify-between items-center bg-violet-50 dark:bg-violet-950/20 p-4 rounded-2xl">
                        <span className="text-xs font-black text-violet-700/90">{isBn ? "মোট চালানী মূল্য:" : "Commercial Invoiced Value:"}</span>
                        <span className="text-base font-mono font-black text-violet-800 dark:text-violet-200">
                          {currencySymbol}{challanItems.reduce((acc, cr) => acc + (cr.qty * cr.targetPrice), 0)}
                        </span>
                      </div>

                      <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/60">
                        <button
                          type="button"
                          onClick={() => setShowChallanModal(false)}
                          className="px-4 py-2 border border-slate-100 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-50"
                        >
                          {isBn ? "বাতিল" : "Cancel"}
                        </button>
                        <button
                          type="submit"
                          className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl shadow-md"
                        >
                          {isBn ? " চালান তৈরি ও ডিসপ্যাচ" : "Confirm Dispatch Load"}
                        </button>
                      </div>

                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

          </div>
        )}

        {/* TAB 2: DEALER LEDGER BOOK */}
        {activeSubTab === 'ledger' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              
              {/* Dealers accounts Left List */}
              <div className="lg:col-span-1 space-y-4 border-r border-slate-100 dark:border-slate-800 pr-0 lg:pr-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{isBn ? "ডিলার গ্রাহকদের তালিকা" : "Wholesalers Register"}</h3>
                
                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                  {dealers.map(dlr => {
                    const active = selectedDealerForLedger?.id === dlr.id;
                    const creditUsage = (dlr.currentBalance || 0) / (dlr.creditLimit || 100000) * 100;

                    return (
                      <div
                        key={dlr.id}
                        onClick={() => setSelectedDealerForLedger(dlr)}
                        className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                          active 
                            ? 'bg-violet-50/60 border-violet-200 dark:bg-violet-950/20 dark:border-violet-900/60' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200'
                        }`}
                      >
                        <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{dlr.name}</div>
                        {dlr.company && <div className="text-[10px] text-slate-400 font-bold mt-0.5">{dlr.company}</div>}
                        
                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100/60">
                          <span className="text-[9px] text-slate-400 font-bold">Dues Out:</span>
                          <span className="text-xs font-mono font-black text-indigo-600">{currencySymbol}{dlr.currentBalance}</span>
                        </div>

                        {/* Credit Limit Indicator strip */}
                        <div className="mt-2 text-[8.5px] text-slate-400 flex justify-between font-bold">
                          <span>Usage: {creditUsage.toFixed(0)}%</span>
                          <span>Max: {currencySymbol}{dlr.creditLimit}</span>
                        </div>
                        <div className="h-1 w-full bg-slate-100 rounded-full mt-1 overflow-hidden">
                          <div 
                            style={{ width: `${Math.min(100, creditUsage)}%` }} 
                            className={`h-full rounded-full ${creditUsage > 85 ? 'bg-rose-500' : 'bg-violet-600'}`}
                          />
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advanced Ledger Entry and sheet logs */}
              <div className="lg:col-span-2 space-y-6">
                {selectedDealerForLedger ? (
                  <div className="space-y-6">
                    
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-slate-50 dark:bg-slate-950/30 rounded-2xl border border-slate-100 dark:border-slate-800/80 gap-4">
                      <div>
                        <span className="text-[8px] font-black uppercase text-violet-600 tracking-wider">{isBn ? "ডিলার লেজার ব্যালেন্স" : "Account Outstanding"}</span>
                        <h4 className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">{selectedDealerForLedger.name}</h4>
                        <p className="text-[10px] text-slate-400 font-bold">{selectedDealerForLedger.company || 'Enterprise Wholesaler'}</p>
                      </div>

                      <div className="flex gap-6">
                        <div className="text-right">
                          <span className="text-[8.5px] block font-black text-slate-400 uppercase tracking-wider">{isBn ? "সর্বমোট ডেবিট (মালামাল চালান)" : "Debit Total"}</span>
                          <span className="text-base font-mono font-black text-rose-600">{currencySymbol}{ledgerStats.debitSum}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[8.5px] block font-black text-slate-400 uppercase tracking-wider">{isBn ? "মোট ক্রেডিট (পরিশোধ)" : "Credit (Settled)"}</span>
                          <span className="text-base font-mono font-black text-emerald-600">{currencySymbol}{ledgerStats.creditSum}</span>
                        </div>
                        <div className="text-right border-l border-slate-200/80 dark:border-slate-800 pl-4">
                          <span className="text-[8.5px] block font-black text-slate-400 uppercase tracking-wider">{isBn ? "বাকী ব্যালেন্স" : "Client Outst."}</span>
                          <span className="text-base font-mono font-black text-indigo-600">{currencySymbol}{ledgerStats.outstanding}</span>
                        </div>
                      </div>
                    </div>

                    {/* Form to submit cash settlement or debits */}
                    <form onSubmit={handlePostLedgerEntry} className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl space-y-4 shadow-sm">
                      <span className="text-xs font-black text-slate-700 block uppercase tracking-wide">{isBn ? "নতুন লেনদেন এন্ট্রি করুন (ডেবিট / ক্রেডিট জমা)" : "Post Ledger Entries (Credit Settle / Custom Debit)"}</span>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "লেজার টাইপ" : "Transaction Type"}</label>
                          <select
                            value={ledgerType}
                            onChange={(e) => setLedgerType(e.target.value as any)}
                            className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-100 rounded-xl"
                          >
                            <option value="credit">Credit (নগদ পেমেন্ট জমা)</option>
                            <option value="debit">Debit (বাকী মালামাল চালানি আউট)</option>
                          </select>
                        </div>

                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "বিবরণ / বর্ণনা" : "Description Details"}</label>
                          <input
                            type="text"
                            placeholder="e.g. Cleared by Bank check / Bkash Outward"
                            value={ledgerDesc}
                            onChange={(e) => setLedgerDesc(e.target.value)}
                            className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-100 rounded-xl outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "টাকার পরিমাণ" : "Amount"}</label>
                          <input
                            type="number"
                            placeholder="Amount..."
                            value={ledgerAmount}
                            onChange={(e) => setLedgerAmount(e.target.value)}
                            className="w-full text-xs font-mono font-extrabold px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-100 rounded-xl outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] uppercase tracking-wide rounded-xl shadow-md transition-all active:scale-[0.98]"
                        >
                          {isBn ? "লেজার বইতে পোস্টিং করুন" : "Confirm Ledger Post"}
                        </button>
                      </div>
                    </form>

                    {/* Ledger entries history sheet logs */}
                    <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-950/20 max-h-[220px] overflow-y-auto custom-scrollbar shadow-sm">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-rose-100/10">
                            <th className="p-3.5 text-[9.5px] font-black text-slate-400 uppercase">{isBn ? "তারিখ" : "Date"}</th>
                            <th className="p-3.5 text-[9.5px] font-black text-slate-400 uppercase">{isBn ? "বিবরণ" : "Particulars"}</th>
                            <th className="p-3.5 text-[9.5px] font-black text-slate-400 uppercase text-right">{isBn ? "ডেবিট (+)" : "Debit (+out)"}</th>
                            <th className="p-3.5 text-[9.5px] font-black text-slate-400 uppercase text-right">{isBn ? "ক্রেডিট (-)" : "Credit (-settled)"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredLedgerEntries.map(entry => (
                            <tr key={entry.id} className="hover:bg-slate-50/50">
                              <td className="p-3 text-xs font-mono font-bold text-slate-500">{entry.date}</td>
                              <td className="p-3 text-xs font-bold text-slate-700 dark:text-slate-300">{entry.description}</td>
                              <td className="p-3 text-xs font-mono font-black text-right text-rose-600">
                                {entry.type === 'debit' ? `${currencySymbol}${entry.amount}` : '-'}
                              </td>
                              <td className="p-3 text-xs font-mono font-black text-right text-emerald-600">
                                {entry.type === 'credit' ? `${currencySymbol}${entry.amount}` : '-'}
                              </td>
                            </tr>
                          ))}
                          {filteredLedgerEntries.length === 0 && (
                            <tr>
                              <td colSpan={4} className="text-center py-8 text-xs text-slate-400 italic">No ledger transactions posted under this client yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[350px] border-2 border-dashed border-slate-100 rounded-3xl p-6 text-center text-slate-400">
                    <BookOpen className="w-12 h-12 text-slate-300 animate-bounce" />
                    <p className="font-extrabold text-sm mt-3">{isBn ? "ডিলার সিলেক্ট করুন" : "Pick Distributer/Dealer Client"}</p>
                    <p className="text-[11px] mt-1">{isBn ? "বামে তালিকা থেকে ডিলার পছন্দ করে তার ডেবিট ক্রেডিট ওভারভিউ দেখুন।" : "Choose wholesale account from left panel to manage ledger outlays."}</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: AGENTS & AREA REPRESENTATIVE REPORT */}
        {activeSubTab === 'agent' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
              
              {/* Agent Registration Form & List */}
              <div className="space-y-4 border-r border-slate-100 dark:border-slate-850 pr-0 lg:pr-6">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-5 h-5 text-indigo-500" />
                    {isBn ? "টিম রিপ্রেজেন্টেটিভ ও ম্যানেজার রেজিস্ট্রি" : "Representative Agents Catalog"}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">{isBn ? "এলাকাভিত্তিক বা এরিয়াল জোন ম্যানেজারদের তালিকা ও কমিশন পার্সেন্টেজ।" : "Staff/Agents representing designated marketing areas and commission levels."}</p>
                </div>

                <form onSubmit={handleRegisterAgent} className="p-4 bg-slate-50 dark:bg-slate-950/20 border border-slate-100 dark:border-slate-800 rounded-2xl grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Agent Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Karim Ahmed"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. 0171.."
                      value={newAgentPhone}
                      onChange={(e) => setNewAgentPhone(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Allocated Area</label>
                    <input
                      type="text"
                      placeholder="e.g. Dhaka Division"
                      value={newAgentArea}
                      onChange={(e) => setNewAgentArea(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Commission %</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 3.0"
                      value={newAgentComm}
                      onChange={(e) => setNewAgentComm(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-wider rounded-lg text-center"
                    >
                      Add Agent
                    </button>
                  </div>
                </form>

                {/* Agents List Card output */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
                  {agents.map(ag => {
                    const stats = agentCommissiveSales[ag.id] || { totalDispatchedVolume: 0, calculatedCommission: 0 };
                    return (
                      <div key={ag.id} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between shadow-xs">
                        <div>
                          <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{ag.name}</div>
                          <div className="text-[9px] text-slate-450 mt-1 uppercase font-bold text-violet-600">{ag.area} Area • Comm: {ag.commissionRate}%</div>
                        </div>
                        <div className="text-right">
                          <span className="text-[8.5px] block font-bold text-slate-400 uppercase">Comm Due</span>
                          <span className="text-xs font-mono font-black text-emerald-600">{currencySymbol}{stats.calculatedCommission.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Wholesale Dealer Client Creation Portal */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-5 h-5 text-violet-500" />
                    {isBn ? "নতুন হোলসেল ডিলার রেজিস্টার ফরম" : "Dealer Registration Portal"}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">{isBn ? "নতুন ডিস্ট্রিবিউটর বা ডিলার ফার্ম যুক্ত করার প্যানেল।" : "Register and assign credit limits to wholesale client outlets."}</p>
                </div>

                <form onSubmit={handleRegisterDealer} className="p-4 bg-slate-50 dark:bg-slate-950/25 border border-slate-100 dark:border-slate-800 rounded-2xl grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Dealer Store / Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Jamuna Telecom"
                      value={newDealerName}
                      onChange={(e) => setNewDealerName(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. 019..."
                      value={newDealerPhone}
                      onChange={(e) => setNewDealerPhone(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Company Group</label>
                    <input
                      type="text"
                      placeholder="e.g. Jamuna Group"
                      value={newDealerCompany}
                      onChange={(e) => setNewDealerCompany(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Outlet Area Zone</label>
                    <input
                      type="text"
                      placeholder="e.g. Chittagong GEC"
                      value={newDealerArea}
                      onChange={(e) => setNewDealerArea(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Credit Limit ({currencySymbol})</label>
                    <input
                      type="number"
                      placeholder="e.g. 500000"
                      value={newDealerCrLimit}
                      onChange={(e) => setNewDealerCrLimit(e.target.value)}
                      className="w-full text-xs font-bold px-3 py-1.5 bg-white border border-slate-100 rounded-lg outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white font-black text-[10px] uppercase tracking-wider rounded-lg text-center"
                    >
                      Register Dealer
                    </button>
                  </div>
                </form>

                {/* Info block explaining Agent Area commission rule */}
                <div className="p-3 bg-violet-50/50 dark:bg-violet-950/10 border border-violet-100/60 dark:border-violet-900/10 rounded-2xl flex items-center gap-2.5 text-[10px] text-slate-500 italic">
                  <ShieldAlert className="w-5 h-5 text-violet-500 shrink-0" />
                  <span>
                    When generating Wholesale Challans under Representative agents, commission scales are automatically tracked. Dealer accounts will strictly enforce set Credit Limits (বাকি সীমা).
                  </span>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* TAB 4: WHOLESALE PRICE TEMPLATE & MOQ REGISTER */}
        {activeSubTab === 'rates' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              
              {/* Product selector Left Panel */}
              <div className="lg:col-span-1 space-y-4 border-r border-slate-100 dark:border-slate-800 pr-0 lg:pr-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{isBn ? "প্রোডাক্ট ডাটাবেস" : "Goods selection catalog"}</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={isBn ? "প্রোডাক্ট দিয়ে খুঁজুন..." : "Filter brand names..."}
                    value={priceSearch}
                    onChange={(e) => setPriceSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-150 border border-slate-100 rounded-xl outline-none text-xs font-semibold"
                  />
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                  {filteredWholesaleProducts.map(p => {
                    const activeSel = selectedProductForWholesale?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedProductForWholesale(p);
                          setWholesalePriceInput(p.wholesalePrice ? p.wholesalePrice.toString() : p.price.toString());
                          setMoqInput(p.moq ? p.moq.toString() : '10');
                        }}
                        className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                          activeSel 
                            ? 'bg-violet-50/60 border-violet-200 dark:bg-violet-950/20 dark:border-violet-900/60' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200'
                        }`}
                      >
                        <div className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{p.name}</div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold mt-1">
                          <span>Retail: {currencySymbol}{p.price}</span>
                          <span className="text-violet-600">Wholesale: {currencySymbol}{p.wholesalePrice || 'Not set'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Wholesale and MOQ editing Right panel */}
              <div className="lg:col-span-2 space-y-6">
                {selectedProductForWholesale ? (
                  <form onSubmit={handleUpdateWholesaleConfig} className="bg-slate-50 dark:bg-slate-950/30 p-5 rounded-3xl border border-slate-100 dark:border-slate-800/80 space-y-4">
                    <div>
                      <span className="text-[8px] font-black uppercase text-violet-600 tracking-wider">Pricing templates / Wholesale rate setting</span>
                      <h4 className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">{selectedProductForWholesale.name}</h4>
                      <p className="text-xs text-indigo-500 font-bold mt-1">General Retail Rate: {currencySymbol}{selectedProductForWholesale.price}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "পাইকারি রেট (Wholesale Rate)" : "Wholesale Price Value"} *</label>
                        <input
                          type="number"
                          step="any"
                          value={wholesalePriceInput}
                          onChange={(e) => setWholesalePriceInput(e.target.value)}
                          className="w-full text-xs font-mono font-extrabold px-3.5 py-3.5 bg-white dark:bg-slate-900 text-slate-800 border border-slate-150 rounded-xl outline-none"
                          required
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ন্যূনতম অর্ডারের পরিমাণ (MOQ)" : "Minimum Order Quantity (MOQ)"}</label>
                        <input
                          type="number"
                          value={moqInput}
                          onChange={(e) => setMoqInput(e.target.value)}
                          className="w-full text-xs font-mono font-extrabold px-3.5 py-3.5 bg-white dark:bg-slate-900 text-slate-800 border border-slate-150 rounded-xl outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-3 border-t border-slate-200/50">
                      <button
                        type="submit"
                        className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl shadow-md transition-all"
                      >
                        {isBn ? "হোলসেল রেট আপডেট করুন" : "Update Wholesale Rates"}
                      </button>
                    </div>

                  </form>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-slate-100 rounded-3xl p-6 text-center text-slate-400">
                    <DollarSign className="w-12 h-12 text-slate-300 animate-bounce" />
                    <p className="font-extrabold text-xs mt-3">{isBn ? "প্রোডাক্ট বা পার্টস সিলেক্ট করুন" : "Select Target Good line"}</p>
                    <p className="text-[10.5px] mt-1">{isBn ? "যেকোনো প্রোডাক্ট পছন্দ করে তার হোলসেল ডিলার রেট এবং MOQ সেট করতে পারেন।" : "Click on any product card from the left panel to define strict wholesalers pricing levels."}</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </div>

    </div>
  );
}
