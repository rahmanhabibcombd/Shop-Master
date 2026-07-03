import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Smartphone, 
  Barcode, 
  ShieldCheck, 
  Plus, 
  Trash, 
  PlusCircle, 
  Printer, 
  Search, 
  User, 
  Calendar, 
  Layers, 
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  Info
} from 'lucide-react';
import { db, doc, updateDoc, addDoc, collection } from '../firebase';
import Papa from 'papaparse';

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
  warranty?: string;
  imeis?: string[];
  serials?: string[];
  brand?: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
}

interface MobileElectronicsViewProps {
  products: Product[];
  customers: Customer[];
  sales: any[];
  onAddProduct: (newProduct: Partial<Product>) => Promise<string | undefined>;
  onAddCustomer: (newCustomer: any) => Promise<string | undefined>;
  settings: any;
  user: any;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' }) => void;
}

export function MobileElectronicsView({ 
  products, 
  customers, 
  sales,
  onAddProduct,
  onAddCustomer,
  settings, 
  user, 
  setNotification 
}: MobileElectronicsViewProps) {
  const [activeTab, setActiveTab] = useState<'imei' | 'barcode' | 'warranty' | 'parts_import'>('imei');
  const isBn = settings?.systemLanguage === 'bn';

  // --- 1. IMEI / SERIAL TRACKING SYSTEM ---
  const [imeiSearch, setImeiSearch] = useState('');
  const [selectedProductForImei, setSelectedProductForImei] = useState<Product | null>(null);
  const [newImaiValue, setNewImeiValue] = useState('');
  const [newSerialValue, setNewSerialValue] = useState('');
  const [warrantyDurationInput, setWarrantyDurationInput] = useState('1 Year');

  const filteredImeiProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(imeiSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(imeiSearch.toLowerCase()) ||
      (p.barcode && p.barcode.includes(imeiSearch))
    );
  }, [products, imeiSearch]);

  const handleAddImeiToProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForImei) return;
    const imei = newImaiValue.trim();
    const serial = newSerialValue.trim();
    if (!imei && !serial) {
      setNotification({ message: isBn ? "অনুগ্রহ করে IMEI অথবা সিরিয়াল নাম্বার লিখুন" : "Please input an IMEI or Serial number", type: 'error' });
      return;
    }

    const currentImeis = selectedProductForImei.imeis || [];
    const currentSerials = selectedProductForImei.serials || [];

    if (imei && currentImeis.includes(imei)) {
      setNotification({ message: isBn ? "এই IMEI ইতিপূর্বে যোগ করা হয়েছে" : "This IMEI already exists", type: 'error' });
      return;
    }
    if (serial && currentSerials.includes(serial)) {
      setNotification({ message: isBn ? "এই সিরিয়াল নাম্বর ইতিপূর্বে যোগ করা হয়েছে" : "This Serial already exists", type: 'error' });
      return;
    }

    const updatedImeis = imei ? [...currentImeis, imei] : currentImeis;
    const updatedSerials = serial ? [...currentSerials, serial] : currentSerials;

    try {
      await updateDoc(doc(db, 'products', selectedProductForImei.id), {
        imeis: updatedImeis,
        serials: updatedSerials,
        warranty: warrantyDurationInput
      });

      // Update local state copy
      setSelectedProductForImei(prev => prev ? {
        ...prev,
        imeis: updatedImeis,
        serials: updatedSerials,
        warranty: warrantyDurationInput
      } : null);

      setNewImeiValue('');
      setNewSerialValue('');
      setNotification({ message: isBn ? "সিরিয়াল/IMEI সফলভাবে যুক্ত হয়েছে" : "Serial/IMEI added successfully", type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleRemoveImei = async (type: 'imei' | 'serial', value: string) => {
    if (!selectedProductForImei) return;
    const updatedImeis = type === 'imei' 
      ? (selectedProductForImei.imeis || []).filter(item => item !== value)
      : (selectedProductForImei.imeis || []);
    const updatedSerials = type === 'serial'
      ? (selectedProductForImei.serials || []).filter(item => item !== value)
      : (selectedProductForImei.serials || []);

    try {
      await updateDoc(doc(db, 'products', selectedProductForImei.id), {
        imeis: updatedImeis,
        serials: updatedSerials
      });

      setSelectedProductForImei(prev => prev ? {
        ...prev,
        imeis: updatedImeis,
        serials: updatedSerials
      } : null);

      setNotification({ message: isBn ? "আইটেম সফলভাবে মুছে ফেলা হয়েছে" : "Item removed successfully", type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  // Simulated Camera Barcode Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scannerForField, setScannerForField] = useState<'imei' | 'serial' | 'search'>('imei');

  const triggerSimulatedScan = () => {
    // Generate standard-looking device codes
    const mockIMEIs = ['358902115674892', '354890112874950', '863901048671295', '359302104586712'];
    const mockSerials = ['SN-SMSG992B2026', 'SN-IPH15PM928L', 'SN-XIOM13C-N92', 'SN-REALM11-P88'];
    
    if (scannerForField === 'imei') {
      const selected = mockIMEIs[Math.floor(Math.random() * mockIMEIs.length)];
      setNewImeiValue(selected);
    } else if (scannerForField === 'serial') {
      const selected = mockSerials[Math.floor(Math.random() * mockSerials.length)];
      setNewSerialValue(selected);
    } else {
      // search
      const barcodes = products.map(p => p.barcode).filter(Boolean);
      if (barcodes.length > 0) {
        setImeiSearch(barcodes[Math.floor(Math.random() * barcodes.length)]);
      }
    }
    setNotification({ message: isBn ? "বারকোড স্ক্যান সফল হয়েছে!" : "Barcode successfully scanned!", type: 'success' });
    setShowScanner(false);
  };


  // --- 2. CUSTOM BARCODE GENERATOR ---
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [barcodeQty, setBarcodeQty] = useState(9);
  const [barcodeSearch, setBarcodeSearch] = useState('');

  const barcodeFilteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(barcodeSearch.toLowerCase()) ||
      (p.barcode && p.barcode.includes(barcodeSearch))
    );
  }, [products, barcodeSearch]);

  const handlePrintBarcodes = (isA4Grid: boolean = true) => {
    const code = customCodeInput.trim() || barcodeProduct?.barcode || '';
    if (!code) {
      setNotification({ message: isBn ? "অনুগ্রহ করে একটি কোড নির্ধারণ করুন" : "Please specify a code to print", type: 'error' });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    let contents = '';
    const labelTitle = barcodeProduct?.name || 'Mobile Spare Part';
    const labelPrice = barcodeProduct ? `${settings.currency || '৳'}${barcodeProduct.price}` : '';

    if (isA4Grid) {
      contents += `<div class="a4-grid">`;
      for(let i = 0; i < barcodeQty; i++) {
        contents += `
          <div class="a4-label-box">
            <div class="shop-name">${settings.name}</div>
            <div class="product-name">${labelTitle}</div>
            <svg id="barcode-${i}"></svg>
            <div class="price-tag">${labelPrice}</div>
          </div>`;
      }
      contents += `</div>`;
    } else {
      for(let i = 0; i < barcodeQty; i++) {
        contents += `
          <div class="content-wrapper">
            <div class="shop-name">${settings.name}</div>
            <div class="product-name">${labelTitle}</div>
            <svg id="barcode-${i}"></svg>
            <div class="price-tag">${labelPrice}</div>
          </div>`;
      }
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Custom Barcode Print</title>
          <style>
            @media print {
              ${isA4Grid ? `
                @page { size: A4; margin: 10mm; }
                body { margin: 0; padding: 0; background: #fff; }
                .a4-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
                .a4-label-box { border: 1px dashed #ddd; padding: 4mm; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-inside: avoid; height: 42mm; text-align: center; }
              ` : `
                @page { size: 50mm 25mm; margin: 0; }
                body { margin: 0; padding: 0; width: 50mm; height: 25mm; bg: #fff; }
                .content-wrapper { page-break-after: always; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 25mm; overflow: hidden; text-align: center; }
              `}
            }
            body { font-family: system-ui, sans-serif; margin: 0; padding: 0; background: #fff; }
            ${isA4Grid ? `
              .a4-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; padding: 10mm; }
              .a4-label-box { border: 1px dashed #ddd; padding: 4mm; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 42mm; text-align: center; }
              .shop-name { font-size: 8px; font-weight: 800; color: #666; margin-bottom: 2px; text-transform: uppercase; }
              .product-name { font-size: 9px; font-weight: 700; max-height: 24px; overflow: hidden; margin-bottom: 2px; }
              svg { max-width: 55mm; max-height: 20mm; }
              .price-tag { font-size: 10px; font-weight: 900; color: #111; margin-top: 2px; }
            ` : `
              .content-wrapper { width: 50mm; height: 25mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; page-break-after: always; }
              .shop-name { font-size: 7px; font-weight: 800; color: #666; margin-bottom: 1px; }
              .product-name { font-size: 8px; font-weight: 700; overflow: hidden; max-height: 16px; margin-bottom: 1px; }
              svg { max-width: 48mm; max-height: 12mm; }
              .price-tag { font-size: 9px; font-weight: 900; margin-top: 1px; }
            `}
          </style>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"></script>
        </head>
        <body>
          <script>
            window.onload = () => {
              const codeString = "${code}";
              for (let i = 0; i < ${barcodeQty}; i++) {
                try {
                  JsBarcode("#barcode-" + i, codeString, {
                    format: "CODE128",
                    width: 1.5,
                    height: 35,
                    displayValue: true,
                    fontSize: 10,
                    margin: 2
                  });
                } catch(e) {
                  console.error(e);
                }
              }
              window.print();
              setTimeout(() => window.close(), 1000);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };


  // --- 3. WARRANTY CERTIFICATE & CLIENT REGISTRY ---
  const [warrantyCustomer, setWarrantyCustomer] = useState<Customer | null>(null);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [warrantyProduct, setWarrantyProduct] = useState<Product | null>(null);
  const [warrantySelectedImei, setWarrantySelectedImei] = useState('');
  const [customImeiField, setCustomImeiField] = useState('');
  const [warrantyPeriodSelect, setWarrantyPeriodSelect] = useState('1 Year (১ বছর)');
  const [warrantyNote, setWarrantyNote] = useState('');

  const [warrantyRecords, setWarrantyRecords] = useState<any[]>([]);

  const handleRegisterWarranty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warrantyProduct) {
      setNotification({ message: isBn ? "অনুগ্রহ করে প্রোডাক্ট সিলেক্ট করুন" : "Please select a product", type: 'error' });
      return;
    }

    let customerObj: any = warrantyCustomer;

    // Fast quick customer creation
    if (!customerObj && newCustName.trim() && newCustPhone.trim()) {
      const custId = await onAddCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        points: 0,
        totalSpent: 0,
        currentDue: 0
      });
      if (custId) {
        customerObj = { id: custId, name: newCustName.trim(), phone: newCustPhone.trim() };
      }
    }

    const customerName = customerObj?.name || newCustName || 'Retail Customer (খুচরা ক্রেতা)';
    const customerPhone = customerObj?.phone || newCustPhone || '';
    const targetImei = warrantySelectedImei || customImeiField || 'N/A';

    const newRecord = {
      id: `WRN_${Date.now()}`,
      customerId: customerObj?.id || '',
      customerName,
      customerPhone,
      productId: warrantyProduct.id,
      productName: warrantyProduct.name,
      imei: targetImei,
      warrantyDuration: warrantyPeriodSelect,
      notes: warrantyNote,
      createdAt: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // Default 1 year expiry
    };

    try {
      await addDoc(collection(db, 'warranty_registry'), {
        ...newRecord,
        shopId: user.shopId
      });

      setWarrantyRecords(prev => [newRecord, ...prev]);

      // Trigger standard beautiful printer
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Digital Warranty Certificate</title>
              <style>
                body { font-family: system-ui, sans-serif; padding: 25px; color: #1e293b; background: #fff; }
                .cert-container { border: 4px double #4f46e5; border-radius: 16px; padding: 30px; max-width: 800px; margin: 0 auto; background: #fdfdfd; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
                .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 25px; }
                .logo-title { font-size: 28px; font-weight: 900; color: #1e1b4b; text-transform: uppercase; margin: 0; }
                .banner { display: inline-block; background: #4f46e5; color: white; padding: 6px 20px; border-radius: 8px; font-weight: bold; font-size: 14px; margin-top: 10px; letter-spacing: 1.5px; }
                .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
                .info-card { background: #f8fafc; padding: 15px; border-radius: 12px; border-left: 4px solid #4f46e5; }
                .info-card-sub { border-left-color: #10b981; }
                .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: 800; margin: 0 0 6px 0; }
                .info-text { font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
                .details-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                .details-table th { background: #f1f5f9; padding: 12px; text-align: left; font-size: 12px; font-weight: bold; color: #475569; }
                .details-table td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; }
                .policy-box { border: 1.5px solid #4f46e5; border-radius: 12px; padding: 15px; background: #fcfcff; font-size: 11px; line-height: 1.6; margin-bottom: 40px; }
                .policy-title { font-weight: 800; color: #4f46e5; font-size: 12.5px; border-bottom: 1px solid #e0e7ff; padding-bottom: 4px; margin-bottom: 8px; }
                .signatures { display: flex; justify-content: space-between; margin-top: 50px; padding: 0 10px; }
                .sig-line { border-top: 1.5px solid #cbd5e1; width: 180px; text-align: center; font-size: 12px; font-weight: bold; color: #64748b; padding-top: 8px; }
              </style>
            </head>
            <body>
              <div class="cert-container">
                <div class="header">
                  <div class="logo-title">${settings.name}</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 600;">${settings.address || ''}</div>
                  <div class="banner">DIGITAL WARRANTY CERTIFICATE</div>
                </div>

                <div class="grid-info">
                  <div class="info-card">
                    <div class="section-title">CUSTOMER DETAILS</div>
                    <div class="info-text">Name: ${customerName}</div>
                    <div class="info-text">Phone: ${customerPhone || 'N/A'}</div>
                  </div>
                  <div class="info-card info-card-sub">
                    <div class="section-title">CERTIFICATE INFO</div>
                    <div class="info-text">Sl No: #${newRecord.id}</div>
                    <div class="info-text">Date: ${new Date().toLocaleDateString()}</div>
                  </div>
                </div>

                <table class="details-table">
                  <thead>
                    <tr>
                      <th>Product Description</th>
                      <th>Device IMEI / Serial No</th>
                      <th>Warranty Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>${warrantyProduct.name}</td>
                      <td style="font-family: monospace; font-size: 12px;">${targetImei}</td>
                      <td style="color: #4f46e5; font-weight: bold;">${warrantyPeriodSelect}</td>
                    </tr>
                  </tbody>
                </table>

                <div class="policy-box">
                  <div class="policy-title">🛡️ WARRANTY TERMS & CONDITIONS (ওয়ারেন্টি নীতি ও শর্তাবলী)</div>
                  <ul style="margin: 0; padding-left: 15px; color: #475569;">
                    <li><strong>English:</strong> Warranty claims require bringing this original printout certificate and matching device IMEI registration. Liquid damage, cracks, physical shock, and broken stickers instantly void all warranty claims.</li>
                    <li><strong>বাংলা:</strong> ওয়ারেন্টি দাবীর সময় অবশ্যই এই ডিজিটাল রসিদটি সাথে আনতে হবে। তরল পদার্থ প্রবেশ, স্ক্রিনে ফাটল, শারীরিক আঘাত বা স্টিকার ছেঁড়া থাকলে ওয়ারেন্টি বাতিল বলে গণ্য হবে।</li>
                  </ul>
                </div>

                <div class="signatures">
                  <div class="sig-line">Customer Signature</div>
                  <div class="sig-line">Authorized Signatory</div>
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
        printWindow.document.close();
      }

      // Reset
      setWarrantyProduct(null);
      setWarrantyCustomer(null);
      setNewCustName('');
      setNewCustPhone('');
      setWarrantySelectedImei('');
      setCustomImeiField('');
      setWarrantyNote('');
      setNotification({ message: isBn ? "ডিজিটাল ওয়ারেন্টি কার্ড সফলভাবে রেজিস্টার হয়েছে!" : "Digital warranty registered and print opened!", type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };


  // --- 4. DYNAMIC PARTS IMPORT (EXCEL CSV OR MANUAL SPREADSHEET) ---
  const [manualParts, setManualParts] = useState([
    { name: 'Spare Battery (iPhone 13)', barcode: 'PART-BAT-IP13', cost: 1200, price: 2200, stock: 10, warranty: '6 Months' },
    { name: 'Replacement Liquid Retina Display (iPad)', barcode: 'PART-DISP-IPAD', cost: 4500, price: 6500, stock: 5, warranty: '3 Months' },
    { name: 'Original 25W Fast Charger', barcode: 'PART-CHG-25W', cost: 650, price: 1250, stock: 15, warranty: '1 Year' }
  ]);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map((row: any) => ({
          name: row.Name || row.name || 'Unknown Part',
          barcode: row.Barcode || row.barcode || `PART-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          cost: Number(row.Cost || row.cost || 0),
          price: Number(row.Price || row.price || 0),
          stock: Number(row.Stock || row.stock || 0),
          warranty: row.Warranty || row.warranty || '6 Months'
        }));
        setManualParts(parsed);
        setNotification({ message: isBn ? "এক্সেল ফাইল থেকে পার্টস সফলভাবে লোড হয়েছে!" : "Successfully loaded parts from CSV!", type: 'success' });
      },
      error: (err) => {
        setNotification({ message: `CSV Error: ${err.message}`, type: 'error' });
      }
    });
  };

  const handleImportAllParts = async () => {
    let successCount = 0;
    try {
      for (const part of manualParts) {
        await onAddProduct({
          name: part.name,
          category: 'Mobile Parts',
          price: part.price,
          cost: part.cost,
          stock: part.stock,
          unit: 'unit',
          barcode: part.barcode,
          warranty: part.warranty,
          brand: 'Importer Oem'
        });
        successCount++;
      }
      setNotification({ message: isBn ? `সফলভাবে ${successCount} টি পার্টস ইনভেন্টরিতে যুক্ত হয়েছে!` : `Successfully imported ${successCount} parts directly to inventory!`, type: 'success' });
      setManualParts([]);
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const handleAddManualRow = () => {
    setManualParts(prev => [
      ...prev,
      { name: '', barcode: `PART-${Date.now()}`, cost: 0, price: 0, stock: 5, warranty: '6 Months' }
    ]);
  };

  const handleUpdateManualCell = (index: number, key: string, val: any) => {
    setManualParts(prev => prev.map((item, idx) => {
      if (idx === index) {
        return { ...item, [key]: val };
      }
      return item;
    }));
  };

  const handleRemoveManualRow = (index: number) => {
    setManualParts(prev => prev.filter((_, idx) => idx !== index));
  };


  return (
    <div className="space-y-6">
      {/* Upper Brand Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/40 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="z-10 space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 text-indigo-300">
              <Smartphone className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{isBn ? "মোবাইল ও ইলেকট্রনিক্স শপ মডিউল" : "Mobile & Electronics Suite"}</h1>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400">Inventory Serial tracking & Warranty Builder</span>
            </div>
          </div>
          <p className="text-slate-400 text-xs font-semibold max-w-xl">
            {isBn 
              ? "ডিভাইসের আইএমইআই (IMEI) ও সিরিয়াল নম্বর ট্র্যাকিং, কাস্টম পার্টস বারকোড জেনারেটর এবং কাস্টমার ওয়ারেন্টি কার্ড রিসিট প্রিন্ট করার কমপ্লিট সলিউশন।"
              : "Advanced module for tracking smartphone IMEIs and product serials, automated camera parsing, dynamic mobile spare parts import, and printable warranty certs."}
          </p>
        </div>

        {/* Tab Selector Pill list */}
        <div className="flex bg-slate-950/40 p-1.5 rounded-2xl border border-slate-800/80 self-start md:self-auto overflow-x-auto shrink-0 scrollbar-none z-10">
          {[
            { id: 'imei', label: isBn ? 'IMEI / সিরিয়াল স্টক' : 'IMEI Tracker', icon: Smartphone },
            { id: 'barcode', label: isBn ? 'বারকোড জেনারেটর' : 'Barcode Print', icon: Barcode },
            { id: 'warranty', label: isBn ? 'ওয়ারেন্টি কার্ড' : 'Warranty Registry', icon: ShieldCheck },
            { id: 'parts_import', label: isBn ? 'ডাইনামিক ইম্পোর্ট' : 'Parts Import', icon: FileSpreadsheet },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
                  active 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
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

      {/* Main Tab Render Space */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-3xl shadow-sm overflow-hidden min-h-[500px]">
        
        {/* TAB 1: IMEI / SERIAL INVENTORY MANAGER */}
        {activeTab === 'imei' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Product selector panel */}
              <div className="lg:col-span-1 space-y-4 border-r border-slate-100 dark:border-slate-800/60 pr-0 lg:pr-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                    {isBn ? "ডিভাইস তালিকা" : "Smartphones / Devices"}
                  </h3>
                  <button 
                    onClick={() => {
                      setScannerForField('search');
                      setShowScanner(true);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-black uppercase tracking-wider border border-indigo-100 dark:border-indigo-900/30 transition-all"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {isBn ? "ক্যামেরা স্ক্যান" : "Cam Scan"}
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={isBn ? "মডেল বা বারকোড দিয়ে খুঁজুন..." : "Filter device or barcode..."}
                    value={imeiSearch}
                    onChange={(e) => setImeiSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950/50 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none text-xs focus:ring-2 focus:ring-indigo-600/20 font-semibold"
                  />
                </div>

                <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                  {filteredImeiProducts.map(p => {
                    const activeSelect = selectedProductForImei?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedProductForImei(p);
                          setWarrantyDurationInput(p.warranty || '1 Year');
                        }}
                        className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                          activeSelect 
                            ? 'bg-indigo-50/60 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900/60' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-xs text-slate-800 dark:text-slate-100">{p.name}</div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">{p.category}</span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                            p.stock > 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/10' : 'bg-rose-50 text-rose-600'
                          }`}>
                            Qty: {p.stock}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredImeiProducts.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      {isBn ? "কোনো ডিভাইস মিল মেলেনি" : "No device products found"}
                    </div>
                  )}
                </div>
              </div>

              {/* IMEI/Serial assign panel */}
              <div className="lg:col-span-2 space-y-6">
                {selectedProductForImei ? (
                  <div className="space-y-6">
                    <div className="p-4 bg-slate-50 dark:bg-slate-950/30 rounded-2xl border border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{isBn ? "নির্বাচিত ডিভাইস" : "Active Device Specification"}</h4>
                        <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mt-1">{selectedProductForImei.name}</h3>
                        <p className="text-xs font-semibold text-indigo-600 mt-1">
                          {isBn ? `বারকোড: ${selectedProductForImei.barcode || 'N/A'}` : `MFR Code: ${selectedProductForImei.barcode || 'N/A'}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] block font-extrabold text-slate-400 uppercase tracking-widest">{isBn ? "স্টক ব্যালেন্স" : "Stock level"}</span>
                        <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{selectedProductForImei.stock} <span className="text-sm font-bold text-slate-400">unit</span></span>
                      </div>
                    </div>

                    {/* Dual Action Form */}
                    <form onSubmit={handleAddImeiToProduct} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center gap-2 text-xs font-black text-indigo-600 uppercase tracking-wide">
                        <PlusCircle className="w-4 h-4" />
                        {isBn ? "নতুন IMEI বা ইউনিক সিরিয়াল নাম্বার যোগ করুন" : "Assign Unit Serials & Devices Tracker"}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            <span>{isBn ? "IMEI নাম্বার" : "IMEI Number / Device Code"}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setScannerForField('imei');
                                setShowScanner(true);
                              }}
                              className="text-indigo-600 hover:underline font-bold flex items-center gap-1 normal-case"
                            >
                              <Camera className="w-3 h-3" /> {isBn ? "ক্যামেরা দিয়ে স্ক্যান" : "Cam Scan"}
                            </button>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 358902115674892"
                            value={newImaiValue}
                            onChange={(e) => setNewImeiValue(e.target.value)}
                            className="w-full text-xs font-mono font-semibold px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between">
                            <span>{isBn ? "সিরিয়াল নাম্বার" : "Unique Serial Number / SN"}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setScannerForField('serial');
                                setShowScanner(true);
                              }}
                              className="text-indigo-600 hover:underline font-bold flex items-center gap-1 normal-case"
                            >
                              <Camera className="w-3 h-3" /> {isBn ? "ক্যামেরা দিয়ে স্ক্যান" : "Cam Scan"}
                            </button>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. SN-IPH15PM2026"
                            value={newSerialValue}
                            onChange={(e) => setNewSerialValue(e.target.value)}
                            className="w-full text-xs font-mono font-semibold px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ওয়ারেন্টি মেয়াদ" : "Device Warranty Period"}</label>
                          <select
                            value={warrantyDurationInput}
                            onChange={(e) => setWarrantyDurationInput(e.target.value)}
                            className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-950/20 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                          >
                            <option value="1 Year">1 Year Warranty (১ বছর)</option>
                            <option value="2 Years">2 Years Warranty (২ বছর)</option>
                            <option value="6 Months">6 Months Warranty (৬ মাস)</option>
                            <option value="3 Months">3 Months Warranty (৩ মাস)</option>
                            <option value="No Warranty">No Warranty (ওয়ারেন্টি প্রযোজ্য নয়)</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.98]"
                          >
                            {isBn ? "তালিকায় যুক্ত করুন" : "Assign to Inventory"}
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Registered IMEI Lists */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      {/* IMEI list */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                          {isBn ? "নিবন্ধিত IMEI সমূহ" : "Registered IMEIs"}
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400 rounded-full font-bold">
                            {(selectedProductForImei.imeis || []).length}
                          </span>
                        </h4>
                        <div className="border border-slate-100 dark:border-slate-800/80 rounded-2xl max-h-[220px] overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                          {(selectedProductForImei.imeis || []).map(im => (
                            <div key={im} className="px-4 py-2.5 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-950/30 transition-colors">
                              <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100">{im}</span>
                              <button
                                onClick={() => handleRemoveImei('imei', im)}
                                className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          {(selectedProductForImei.imeis || []).length === 0 && (
                            <div className="text-center py-8 text-xs text-slate-400 italic">
                              {isBn ? "কোনো আইএমইআই (IMEI) নিবন্ধিত নেই" : "No registered device IMEIs"}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Serial list */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-500" />
                          {isBn ? "নিবন্ধিত সিরিয়াল নাম্বার" : "Registered Serials"}
                          <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400 rounded-full font-bold">
                            {(selectedProductForImei.serials || []).length}
                          </span>
                        </h4>
                        <div className="border border-slate-100 dark:border-slate-800/80 rounded-2xl max-h-[220px] overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                          {(selectedProductForImei.serials || []).map(sr => (
                            <div key={sr} className="px-4 py-2.5 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-950/30 transition-colors">
                              <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100">{sr}</span>
                              <button
                                onClick={() => handleRemoveImei('serial', sr)}
                                className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          {(selectedProductForImei.serials || []).length === 0 && (
                            <div className="text-center py-8 text-xs text-slate-400 italic">
                              {isBn ? "কোনো সিরিয়াল পাওয়া যায়নি" : "No unique serials registered"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[350px] border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl p-6 text-center text-slate-400 space-y-3">
                    <Smartphone className="w-12 h-12 text-slate-300 animate-bounce" />
                    <div>
                      <p className="font-bold text-sm text-slate-600 dark:text-slate-300">{isBn ? "ডিভাইস সিলেক্ট করুন" : "Select Phone/Device Model"}</p>
                      <p className="text-xs mt-1">{isBn ? "বামে তালিকা থেকে যেকোনো মোবাইলে ক্লিক করে তার IMEI ও ওয়ারেন্টি ট্র্যাক করতে পারেন।" : "Click any product from the left menu to manage individual unit tracking."}</p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: CUSTOM BARCODE GENERATOR */}
        {activeTab === 'barcode' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              {/* Product picker */}
              <div className="lg:col-span-1 space-y-4 border-r border-slate-100 dark:border-slate-800 pr-0 lg:pr-6">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">{isBn ? "প্রোডাক্ট/পার্টস নির্বাচন" : "Select Product / Spare Part"}</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={isBn ? "প্রোডাক্ট দিয়ে খুঁজুন..." : "Search matching items..."}
                    value={barcodeSearch}
                    onChange={(e) => setBarcodeSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-2xl outline-none text-xs font-semibold"
                  />
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
                  {barcodeFilteredProducts.map(p => {
                    const selected = barcodeProduct?.id === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setBarcodeProduct(p);
                          setCustomCodeInput(p.barcode || '');
                        }}
                        className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                          selected 
                            ? 'bg-indigo-50/60 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900/60' 
                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-200'
                        }`}
                      >
                        <div className="font-bold text-xs text-slate-800 dark:text-slate-100">{p.name}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5 font-mono">{p.barcode || 'NO BARCODE'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Barcode settings and preview visual */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-slate-50 dark:bg-slate-950/30 p-5 rounded-3xl border border-slate-100 dark:border-slate-800/80 space-y-4">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Barcode className="w-5 h-5 text-indigo-500" />
                    {isBn ? "কাস্টম কোড ও প্রিন্ট টাইপ" : "Custom Barcodes Specifications"}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "প্রোডাক্ট এর কোড (যেমন- 128001)" : "Barcode Value / Unique SKU"}</label>
                      <input
                        type="text"
                        placeholder="e.g. 128912A"
                        value={customCodeInput}
                        onChange={(e) => setCustomCodeInput(e.target.value)}
                        className="w-full text-xs font-mono font-bold px-3 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "প্রিন্ট লেবেল সংখ্যা" : "Quantity to print"}</label>
                      <input
                        type="number"
                        value={barcodeQty}
                        onChange={(e) => setBarcodeQty(Math.max(1, Number(e.target.value)))}
                        className="w-full text-xs font-bold px-3 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={() => handlePrintBarcodes(false)}
                      className="flex-1 py-3 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/60 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
                    >
                      <Printer className="w-4 h-4" />
                      {isBn ? "সিঙ্গেল লেবেল প্রিন্ট (50x25mm)" : "Print Single Label (50x25mm)"}
                    </button>
                    <button
                      onClick={() => handlePrintBarcodes(true)}
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                    >
                      <Printer className="w-4 h-4" />
                      {isBn ? "এ৪ লেবেল শীট (৩x৩ গ্রিড)" : "Print A4 Sheet (3x3 Grid)"}
                    </button>
                  </div>
                </div>

                {/* Aesthetic mock visual */}
                <div className="border border-slate-100 dark:border-slate-800 p-6 rounded-3xl bg-slate-50/50 dark:bg-slate-950/10 flex flex-col items-center justify-center min-h-[160px] text-center">
                  <div className="w-48 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-xl shadow-sm text-center">
                    <span className="text-[7.5px] block font-extrabold uppercase tracking-widest text-slate-400 mb-1">{settings.name || 'ShopMaster'}</span>
                    <span className="text-[9px] block font-black text-slate-800 dark:text-slate-100 overflow-hidden text-ellipsis whitespace-nowrap mb-2">{barcodeProduct?.name || 'Device/Parts Mock'}</span>
                    <div className="h-10 bg-slate-100 dark:bg-slate-800 flex items-center justify-center rounded">
                      <Barcode className="w-8 h-8 text-slate-400 animate-pulse" />
                    </div>
                    <span className="text-[8px] font-mono block text-slate-500 mt-1">{customCodeInput || 'CODE-MOCK'}</span>
                    <span className="text-[10px] block font-black text-indigo-600 mt-1">{barcodeProduct ? `${settings.currency || '৳'}${barcodeProduct.price}` : 'Tk 0.00'}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-widest flex items-center gap-1">
                    <Info className="w-3 h-3" /> {isBn ? "প্রিন্ট দেওয়ার পূর্বে আপনার ফিজিক্যাল পেজ সেটআপ কনফিগার করুন" : "Verify alignment before firing prints to laser labels"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WARRANTY REGISTER & CARDS */}
        {activeTab === 'warranty' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Warranty register builder form */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-3xl space-y-5">
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-500" />
                  {isBn ? "নতুন ডিজিটাল ওয়ারেন্টি কার্ড ইস্যু" : "Issue Digital Warranty Certificate"}
                </h3>

                <form onSubmit={handleRegisterWarranty} className="space-y-4">
                  {/* Select product */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "প্রোডাক্ট সিলেক্ট করুন" : "Select Sold Device / Spare Part"}</label>
                    <select
                      value={warrantyProduct?.id || ''}
                      onChange={(e) => {
                        const target = products.find(p => p.id === e.target.value);
                        setWarrantyProduct(target || null);
                        setWarrantySelectedImei('');
                      }}
                      className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                    >
                      <option value="">-- {isBn ? "প্রোডাক্ট নির্বাচন করুন" : "Pick device model"} --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
                      ))}
                    </select>
                  </div>

                  {/* Pick IMEI / Serial dropdown if available, else manual */}
                  {warrantyProduct && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ডিভাইস আইএমইআই (IMEI)" : "Device IMEI / Serial list"}</label>
                      {(warrantyProduct.imeis && warrantyProduct.imeis.length > 0) || (warrantyProduct.serials && warrantyProduct.serials.length > 0) ? (
                        <select
                          value={warrantySelectedImei}
                          onChange={(e) => setWarrantySelectedImei(e.target.value)}
                          className="w-full text-xs font-mono font-bold px-3 py-2 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                        >
                          <option value="">-- {isBn ? "IMEI/Serial নির্বাচন করুন অথবা নিচে লিখুন" : "Select assigned serial or type manual below"} --</option>
                          {warrantyProduct.imeis?.map(im => (
                            <option key={im} value={im}>{im} (IMEI)</option>
                          ))}
                          {warrantyProduct.serials?.map(sr => (
                            <option key={sr} value={sr}>{sr} (Serial)</option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ম্যানুয়াল IMEI/সিরিয়াল ইনপুট (যদি উপরে সিলেক্ট না করা হয়ে থাকে)" : "Manual IMEI/Serial Input (If not picked above)"}</label>
                    <input
                      type="text"
                      placeholder="e.g. SN-IPHONE15-MEMBER8"
                      value={customImeiField}
                      onChange={(e) => setCustomImeiField(e.target.value)}
                      className="w-full text-xs font-mono font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "কাস্টমার এর নাম" : "Customer Name"}</label>
                      <input
                        type="text"
                        placeholder="e.g. Rahim Uddin"
                        value={newCustName}
                        onChange={(e) => setNewCustName(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "মোবাইল নাম্বার" : "Customer Phone"}</label>
                      <input
                        type="text"
                        placeholder="e.g. 01700000000"
                        value={newCustPhone}
                        onChange={(e) => setNewCustPhone(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "ওয়ারেন্টি মেয়াদ" : "Warranty Period"}</label>
                      <input
                        type="text"
                        placeholder="e.g. 1 Year / ১ বছর"
                        value={warrantyPeriodSelect}
                        onChange={(e) => setWarrantyPeriodSelect(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isBn ? "বিশেষ দ্রষ্টব্য" : "Warranty Notes"}</label>
                      <input
                        type="text"
                        placeholder="e.g. Box included"
                        value={warrantyNote}
                        onChange={(e) => setWarrantyNote(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-800 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                  >
                    <Printer className="w-4 h-4" />
                    {isBn ? "ওয়ারেন্টি কার্ড প্রিন্ট দিন" : "Register and Open Print Certificate"}
                  </button>
                </form>
              </div>

              {/* Warranty directory lists */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center justify-between">
                  <span>{isBn ? "নিবন্ধিত কাস্টমার ওয়ারেন্টি রেকর্ড" : "Device Warranty Registry"}</span>
                  <span className="text-[10px] px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full font-black">
                    {warrantyRecords.length} Active
                  </span>
                </h3>

                <div className="space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                  {warrantyRecords.map(rec => (
                    <div 
                      key={rec.id}
                      className="p-4 bg-slate-50 dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col justify-between hover:border-slate-200 dark:hover:border-slate-700 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-100">{rec.productName}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight flex items-center gap-1">
                            <User className="w-3 h-3 text-indigo-500" />
                            {rec.customerName} ({rec.customerPhone || 'Walk-in'})
                          </div>
                        </div>
                        <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full uppercase tracking-widest">
                          {rec.warrantyDuration}
                        </span>
                      </div>

                      <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <span className="text-[10px] font-mono text-slate-500">IMEI: {rec.imei}</span>
                        <span className="text-[9px] font-bold text-slate-400">{new Date(rec.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                  {warrantyRecords.length === 0 && (
                    <div className="text-center py-20 border border-dashed border-slate-100 dark:border-slate-800 rounded-3xl text-slate-400 italic text-xs flex flex-col items-center gap-2">
                      <ShieldCheck className="w-8 h-8 text-slate-300" />
                      {isBn ? "কোনো ওয়ারেন্টি কার্ড এখনও ইস্যু করা হয়নি" : "No recent warranty records found"}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: DYNAMIC PARTS IMPORT */}
        {activeTab === 'parts_import' && (
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-950/30 p-5 rounded-3xl border border-slate-100 dark:border-slate-800/80">
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-500 animate-bounce" />
                    {isBn ? "মোবাইল পার্টস বা মালামাল বাল্ক ইম্পোর্ট" : "Bulk Spare Parts & Smartphone Importer"}
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                    {isBn 
                      ? "পদ্ধতি: এক্সেল বা CSV ফাইল সরাসরি আপলোড করুন অথবা নিচের ইনপুট শিট থেকে এক ক্লিকেই সমস্ত ডিসপ্লে, আইসি, চার্জার আপনার ইনভেন্টরিতে যুক্ত করুন।" 
                      : "Instructions: Standardized spreadsheet-like wizard. Parse Excel/CSV schemas directly, or write custom items manually, then hit bulk sync."}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                  <label className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl cursor-pointer shadow-sm transition-all flex items-center gap-1.5 active:scale-95">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    {isBn ? "এক্সেল ডাইরেক্ট আপলোড" : "Upload Excel (.csv)"}
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={handleCsvUpload} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              {/* Dynamic spreadsheet list items */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800/80">
                      <th className="p-3 text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">{isBn ? "পার্টস/মিডিয়া নাম" : "Specification Name"}</th>
                      <th className="p-3 text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">{isBn ? "কাস্টম কোড (বারকোড)" : "SKU / Custom Code"}</th>
                      <th className="p-3 text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">{isBn ? "ক্রয় মূল্য" : "Cost Price"}</th>
                      <th className="p-3 text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">{isBn ? "বিক্রয় মূল্য" : "Sales Retail"}</th>
                      <th className="p-3 text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">{isBn ? "প্রারম্ভিক স্টক" : "Initial stock"}</th>
                      <th className="p-3 text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">{isBn ? "ওয়ারেন্টি মেয়াদ" : "Warranty"}</th>
                      <th className="p-3 text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans text-center">{isBn ? "মুছে ফেলুন" : "Discard"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs text-slate-700">
                    {manualParts.map((part, index) => (
                      <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-all">
                        <td className="p-1 px-3">
                          <input
                            type="text"
                            value={part.name}
                            placeholder="e.g. Samsung A54 Original Display"
                            onChange={(e) => handleUpdateManualCell(index, 'name', e.target.value)}
                            className="bg-transparent font-bold w-full p-2 outline-none border border-transparent hover:border-slate-200 dark:hover:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100"
                          />
                        </td>
                        <td className="p-1 px-3 font-mono">
                          <input
                            type="text"
                            value={part.barcode}
                            placeholder="e.g. PART-DIS-A54"
                            onChange={(e) => handleUpdateManualCell(index, 'barcode', e.target.value)}
                            className="bg-transparent w-full p-2 outline-none border border-transparent hover:border-slate-200 dark:hover:border-slate-800 rounded-lg text-slate-700 dark:text-slate-200"
                          />
                        </td>
                        <td className="p-1 px-3">
                          <input
                            type="number"
                            value={part.cost}
                            onChange={(e) => handleUpdateManualCell(index, 'cost', Number(e.target.value))}
                            className="bg-transparent w-full p-2 outline-none border border-transparent hover:border-slate-200 dark:hover:border-slate-800 rounded-lg text-slate-700 dark:text-slate-100"
                          />
                        </td>
                        <td className="p-1 px-3">
                          <input
                            type="number"
                            value={part.price}
                            onChange={(e) => handleUpdateManualCell(index, 'price', Number(e.target.value))}
                            className="bg-transparent w-full p-2 outline-none border border-transparent hover:border-slate-200 dark:hover:border-slate-800 rounded-lg text-slate-700 dark:text-slate-100"
                          />
                        </td>
                        <td className="p-1 px-3">
                          <input
                            type="number"
                            value={part.stock}
                            onChange={(e) => handleUpdateManualCell(index, 'stock', Number(e.target.value))}
                            className="bg-transparent w-full p-2 outline-none border border-transparent hover:border-slate-200 dark:hover:border-slate-800 rounded-lg text-slate-700 dark:text-slate-100"
                          />
                        </td>
                        <td className="p-1 px-3">
                          <input
                            type="text"
                            value={part.warranty}
                            placeholder="e.g. 6 Months"
                            onChange={(e) => handleUpdateManualCell(index, 'warranty', e.target.value)}
                            className="bg-transparent w-full p-2 outline-none border border-transparent hover:border-slate-200 dark:hover:border-slate-800 rounded-lg text-slate-600 dark:text-slate-300"
                          />
                        </td>
                        <td className="p-1 px-3 text-center">
                          <button
                            onClick={() => handleRemoveManualRow(index)}
                            className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-600 rounded-xl transition-all"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {manualParts.length === 0 && (
                  <div className="text-center py-20 text-slate-400 text-xs italic">
                    {isBn ? "তালিকা শূন্য। নতুন রো যোগ করতে নিচে ক্লিক করুন।" : "Spares list empty. Click 'Add row' or load CSV above."}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center gap-4">
                <button
                  onClick={handleAddManualRow}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs tracking-wider rounded-xl uppercase transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <PlusCircle className="w-4.5 h-4.5 text-indigo-500" />
                  {isBn ? "নতুন রো যুক্ত করুন" : "Add Spare row"}
                </button>
                
                {manualParts.length > 0 && (
                  <button
                    onClick={handleImportAllParts}
                    className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs tracking-wider rounded-2xl uppercase transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 active:scale-95"
                  >
                    <CheckCircle2 className="w-5 h-5 animate-pulse" />
                    {isBn ? "ইনভেন্টরিতে ইম্পোর্ট করুন" : "Sync & Import All Parts"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL: CAM SCANNER SIMULATOR */}
      <AnimatePresence>
        {showScanner && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white max-w-md w-full shadow-2xl relative"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto text-indigo-400">
                  <Camera className="w-8 h-8 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-black">{isBn ? "ক্যামেরা বারকোড স্ক্যানার" : "Camera / Scanner Stream"}</h3>
                  <p className="text-xs text-slate-400 mt-1">{isBn ? "বারকোড রিডার বা ফোন ক্যামেরাটি ডিভাইসের কোডের কাছে ধরুন।" : "Align device IMEI or original packaging label under target bounds"}</p>
                </div>

                {/* Laser scan animation window */}
                <div className="w-full h-44 bg-slate-950 rounded-2xl border-2 border-indigo-500/20 relative overflow-hidden flex items-center justify-center shadow-inner">
                  {/* Neon laser line animation */}
                  <div className="absolute left-0 right-0 h-0.5 bg-indigo-500 shadow-lg shadow-indigo-500/50 scale-y-110 top-0 animate-[scan_2s_infinite]"></div>
                  <Smartphone className="w-16 h-16 text-slate-800 animate-pulse" />
                  <style>{`
                    @keyframes scan {
                      0%, 100% { top: 5%; }
                      50% { top: 95%; }
                    }
                  `}</style>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowScanner(false)}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    {isBn ? "বাতিল" : "Cancel"}
                  </button>
                  <button
                    onClick={triggerSimulatedScan}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
                  >
                    {isBn ? "কোড সনাক্ত করুন" : "Simulate Capture"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
