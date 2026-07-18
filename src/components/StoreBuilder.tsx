import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { 
  Save, Store, Layout, Image, Palette, Link as LinkIcon, Loader2, 
  MonitorSmartphone, Brush, CheckCircle, ArrowRight, Heart, ShoppingCart, 
  Flame, ShieldCheck, HelpCircle, FileText, Smartphone, Laptop, Sparkles, 
  Facebook, Instagram, MessageSquare, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StoreBuilderProps {
  user: any;
  shopSettings: any;
}

export function StoreBuilder({ user, shopSettings }: StoreBuilderProps) {
  const [activeTab, setActiveTab] = useState<'main' | 'gallery' | 'preview'>('main');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('grocery');
  
  const [formData, setFormData] = useState({
    storeName: shopSettings?.businessName || '',
    storeHeadline: '',
    storeDescription: '',
    storeTheme: 'light',
    storePrimaryColor: 'bg-emerald-600',
    storePrimaryColorHover: 'hover:bg-emerald-700',
    storeLogo: '',
    storeHeroBanner: '',
    socialFacebook: '',
    socialInstagram: '',
    socialWhatsapp: '',
    merchantCode: user?.merchantCode || '',
    storeCategory: 'grocery'
  });

  useEffect(() => {
    const fetchSettings = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const shopId = shopSettings?.shopId || user.shopId || user.uid;
        const docRef = doc(db, 'shops', shopId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const storeCategory = data.storeCategory || 'grocery';
          setSelectedThemeId(storeCategory);
          setFormData(prev => ({
            ...prev,
            storeName: data.storeName || shopSettings?.businessName || '',
            storeHeadline: data.storeHeadline || '',
            storeDescription: data.storeDescription || '',
            storeTheme: data.storeTheme || 'light',
            storePrimaryColor: data.storePrimaryColor || 'bg-emerald-600',
            storePrimaryColorHover: data.storePrimaryColorHover || 'hover:bg-emerald-700',
            storeLogo: data.storeLogo || '',
            storeHeroBanner: data.storeHeroBanner || '',
            socialFacebook: data.socialFacebook || '',
            socialInstagram: data.socialInstagram || '',
            socialWhatsapp: data.socialWhatsapp || '',
            merchantCode: data.merchantCode || user.uid.substring(0, 8).toUpperCase(),
            storeCategory: storeCategory
          }));
        } else {
            setFormData(prev => ({
                ...prev,
                merchantCode: user.merchantCode || user.uid.substring(0, 8).toUpperCase()
            }));
        }
      } catch (err) {
        console.error("Error fetching store settings:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user, shopSettings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSave = async (silent = false) => {
    if (!user) return;
    setSaving(true);
    try {
      const shopId = shopSettings?.shopId || user.shopId || user.uid;
      const shopRef = doc(db, 'shops', shopId);
      await updateDoc(shopRef, formData);
      if (!silent) {
        alert(shopSettings?.systemLanguage === 'bn' ? 'স্টোর সেটিংস সফলভাবে সংরক্ষণ করা হয়েছে!' : 'Store settings saved successfully!');
      }
    } catch (err) {
      console.error("Error saving store settings:", err);
      if (!silent) {
        alert(shopSettings?.systemLanguage === 'bn' ? 'সংরক্ষণ করতে ব্যর্থ হয়েছে।' : 'Failed to save store settings.');
      }
    } finally {
      setSaving(false);
    }
  };

  const selectThemeCategory = async (categoryId: string, themeColor: string, hoverColor: string, storeTheme = 'light') => {
    setSelectedThemeId(categoryId);
    const updatedData = {
      ...formData,
      storeCategory: categoryId,
      storePrimaryColor: themeColor,
      storePrimaryColorHover: hoverColor,
      storeTheme: storeTheme
    };
    setFormData(updatedData);
    
    // Save directly to Firebase
    if (!user) return;
    setSaving(true);
    try {
      const shopId = shopSettings?.shopId || user.shopId || user.uid;
      const shopRef = doc(db, 'shops', shopId);
      await updateDoc(shopRef, updatedData);
      alert(shopSettings?.systemLanguage === 'bn' ? 'থিম সফলভাবে পরিবর্তন করা হয়েছে!' : `Theme switched successfully!`);
    } catch (err) {
      console.error("Error changing theme category:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        <span className="text-sm font-medium text-slate-500">Loading Store Configuration...</span>
      </div>
    );
  }

  const tabs = [
    { id: 'main', label: 'Main Panel', label_bn: 'মেইন প্যানেল', icon: Store },
    { id: 'gallery', label: 'Theme Gallery', label_bn: 'থিম গ্যালারী', icon: Brush },
    { id: 'preview', label: 'Public Store Front', label_bn: 'পাবলিক স্টোরফ্রন্ট', icon: MonitorSmartphone },
  ];

  const categories = [
    { 
      id: 'grocery', 
      name: 'Grocery & Mart', 
      name_bn: 'মুদি দোকান ও সুপারশপ', 
      type: 'Fresh Green Layout', 
      color: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800', 
      accent: 'bg-emerald-600',
      hoverAccent: 'hover:bg-emerald-700',
      desc: 'Optimized for fast item search, category-based list filtering, and straightforward food checkout.',
      desc_bn: 'সহজ ও দ্রুত আইটেম সার্চ, ক্যাটাগরি অনুযায়ী ফিল্টারিং এবং কুইক অর্ডারের জন্য ডিজাইন করা হয়েছে।',
      features: ['Quick Order Button', 'Vegetable/Fruit Badges', 'Easy WhatsApp Ordering'],
      previewBanner: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=60'
    },
    { 
      id: 'electronics', 
      name: 'Tech & Gadgets', 
      name_bn: 'ইলেকট্রনিক্স ও গ্যাজেট', 
      type: 'Futuristic Dark Accent', 
      color: 'bg-slate-900 border-slate-700 text-white dark:bg-slate-950/50', 
      accent: 'bg-indigo-600',
      hoverAccent: 'hover:bg-indigo-700',
      desc: 'Tech-focused styling with structured spec indicators, dark background mode toggle, and rich product views.',
      desc_bn: 'টেক এবং ইলেকট্রনিক্স ব্র্যান্ডের জন্য আকর্ষণীয় ডার্ক থিম, ওয়ারেন্টি ব্যাজ ও প্রিমিয়াম প্রোডাক্ট কার্ড।',
      features: ['Warranty Verification Badge', 'Specification Highlights', 'Sleek Futuristic Vibe'],
      previewBanner: 'https://images.unsplash.com/photo-1468436139062-f60a71c5c892?w=600&auto=format&fit=crop&q=60'
    },
    { 
      id: 'pharmacy', 
      name: 'Pharmacy & Health', 
      name_bn: 'মেডিসিন ও ফার্মেসী', 
      type: 'Clean Teal Healthcare', 
      color: 'bg-cyan-50 border-cyan-200 dark:bg-cyan-950/20 dark:border-cyan-800', 
      accent: 'bg-cyan-600',
      hoverAccent: 'hover:bg-cyan-700',
      desc: 'Clean layouts centered on medicine categories, prescription guidelines, and immediate contact details.',
      desc_bn: 'পরিষ্কার ও পরিচ্ছন্ন ডিজাইন, মেডিসিনের ক্যাটাগরি, প্রেসক্রিপশন আপলোড ব্যানার এবং ইমার্জেন্সি কল বাটন।',
      features: ['Prescription Upload Placeholder', 'Urgent Help Hotlines', 'Dosage Safety Notes'],
      previewBanner: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&auto=format&fit=crop&q=60'
    },
    { 
      id: 'wholesale', 
      name: 'Wholesale & B2B', 
      name_bn: 'পাইকারি ও হোলসেল', 
      type: 'Bold Multi-unit Layout', 
      color: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800', 
      accent: 'bg-indigo-600',
      hoverAccent: 'hover:bg-indigo-700',
      desc: 'Designed for bulk orders with clear wholesale tier pricings and bulk-addition tables.',
      desc_bn: 'পাইকারি বা বাল্ক অর্ডারের জন্য চমৎকার ডিজাইন, যেখানে মিনিমাম অর্ডার কুয়ান্টিটি (MOQ) পরিষ্কারভাবে প্রদর্শিত হবে।',
      features: ['Bulk Add Table', 'Minimum Order Quantity', 'Tiered Pricing Display'],
      previewBanner: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&auto=format&fit=crop&q=60'
    },
    { 
      id: 'ecommerce', 
      name: 'E-Commerce Retail', 
      name_bn: 'ই-কমার্স রিটেইল', 
      type: 'Crimson Lifestyle Showcase', 
      color: 'bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800', 
      accent: 'bg-rose-600',
      hoverAccent: 'hover:bg-rose-700',
      desc: 'Modern consumer lifestyle aesthetic with prominent hero sliders, flash sales, and cart checkouts.',
      desc_bn: 'ফ্যাশন বা আধুনিক রিটেইল শপের জন্য ট্রেন্ডি ক্রিপসন থিম, আকর্ষণীয় অফার স্লাইডার এবং ফ্ল্যাশ সেলস সেকশন।',
      features: ['Flash Sales Counter', 'Modern Grid View', 'Add-to-Wishlist Mockup'],
      previewBanner: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=600&auto=format&fit=crop&q=60'
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-100 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl">
            <Sparkles className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              Store Builder
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {shopSettings?.systemLanguage === 'bn' 
                ? 'আপনার পাবলিক অনলাইন স্টোরের ডিজাইন, থিম ও ক্যাটাগরি কাস্টমাইজ করুন।' 
                : 'Customize the style, category templates, and branding of your public store.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a 
            href={`/merchant/${formData.merchantCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2 text-sm"
          >
            <LinkIcon className="w-4 h-4" />
            {shopSettings?.systemLanguage === 'bn' ? 'লাইভ স্টোর দেখুন' : 'Live Store'}
          </a>
          <button 
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl font-semibold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2 text-sm disabled:opacity-70 cursor-pointer"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {shopSettings?.systemLanguage === 'bn' ? 'সেভ করুন' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/80 w-full overflow-x-auto custom-scrollbar">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap cursor-pointer ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15' 
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{shopSettings?.systemLanguage === 'bn' ? tab.label_bn : tab.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.2 }}
        >
          {/* Main Customization Panel */}
          {activeTab === 'main' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Form: Customizer */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3 mb-2">
                    <Store className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-bold text-slate-800 dark:text-white">
                      {shopSettings?.systemLanguage === 'bn' ? 'মৌলিক তথ্যসমূহ' : 'Basic Details'}
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        {shopSettings?.systemLanguage === 'bn' ? 'স্টোরের নাম' : 'Store Name'}
                      </label>
                      <input 
                        type="text"
                        name="storeName"
                        value={formData.storeName}
                        onChange={handleChange}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white outline-none"
                        placeholder="My Awesome Shop"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        {shopSettings?.systemLanguage === 'bn' ? 'স্টোর লিংক কোড' : 'Store Link Code'}
                      </label>
                      <div className="flex rounded-xl overflow-hidden">
                        <span className="inline-flex items-center px-3 border border-r-0 border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-slate-400 text-xs font-mono">
                          /merchant/
                        </span>
                        <input 
                          type="text"
                          name="merchantCode"
                          value={formData.merchantCode}
                          onChange={handleChange}
                          className="flex-1 min-w-0 block w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white outline-none"
                          placeholder="my-shop-code"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      {shopSettings?.systemLanguage === 'bn' ? 'হেডলাইন / মূল আকর্ষণ' : 'Store Headline'}
                    </label>
                    <input 
                      type="text"
                      name="storeHeadline"
                      value={formData.storeHeadline}
                      onChange={handleChange}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white outline-none"
                      placeholder="Welcome to our official fresh organic supermarket!"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      {shopSettings?.systemLanguage === 'bn' ? 'বর্ণনা / বিবরণ' : 'Description'}
                    </label>
                    <textarea 
                      name="storeDescription"
                      value={formData.storeDescription}
                      onChange={handleChange}
                      rows={3}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 custom-scrollbar dark:text-white outline-none"
                      placeholder="Browse our wide selection of freshly sourced groceries, greens, and everyday products."
                    />
                  </div>
                </div>

                {/* Theme & Design Block */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3 mb-2">
                    <Palette className="w-5 h-5 text-pink-500" />
                    <h3 className="font-bold text-slate-800 dark:text-white">
                      {shopSettings?.systemLanguage === 'bn' ? 'রং এবং থিম কাস্টমাইজেশন' : 'Branding & Color Palette'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        {shopSettings?.systemLanguage === 'bn' ? 'স্টোর ব্যাকগ্রাউন্ড মোড' : 'Store Theme Mode'}
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'light', name: 'Classic White', class: 'bg-white border-slate-200 text-slate-800' },
                          { id: 'dark', name: 'Dark Metal', class: 'bg-slate-900 border-slate-800 text-white' },
                        ].map(themeOption => (
                          <div 
                            key={themeOption.id}
                            onClick={() => setFormData({...formData, storeTheme: themeOption.id})}
                            className={`cursor-pointer rounded-xl border-2 p-3 text-center transition-all ${
                              formData.storeTheme === themeOption.id ? 'border-indigo-600 ring-4 ring-indigo-500/10' : 'border-slate-100 dark:border-slate-850 hover:border-slate-200'
                            } ${themeOption.class} shadow-sm`}
                          >
                            <span className="text-xs font-bold">{themeOption.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        {shopSettings?.systemLanguage === 'bn' ? 'মূল আকর্ষণ রং (Primary Accent)' : 'Primary Accent Color'}
                      </label>
                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {[
                          { bg: 'bg-emerald-600', hover: 'hover:bg-emerald-700', name: 'Emerald' },
                          { bg: 'bg-indigo-600', hover: 'hover:bg-indigo-700', name: 'Indigo' },
                          { bg: 'bg-cyan-600', hover: 'hover:bg-cyan-700', name: 'Cyan' },
                          { bg: 'bg-rose-600', hover: 'hover:bg-rose-700', name: 'Rose' },
                          { bg: 'bg-slate-800', hover: 'hover:bg-slate-900', name: 'Slate' },
                        ].map(color => (
                          <div 
                            key={color.bg}
                            onClick={() => setFormData({...formData, storePrimaryColor: color.bg, storePrimaryColorHover: color.hover})}
                            className={`w-9 h-9 rounded-full cursor-pointer ${color.bg} flex items-center justify-center transition-all hover:scale-110 shadow-sm ${
                              formData.storePrimaryColor === color.bg ? 'ring-4 ring-indigo-500/30 border-2 border-white' : ''
                            }`}
                            title={color.name}
                          >
                            {formData.storePrimaryColor === color.bg && <CheckCircle className="w-4 h-4 text-white" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Media & Banners */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3 mb-2">
                    <Image className="w-5 h-5 text-emerald-500" />
                    <h3 className="font-bold text-slate-800 dark:text-white">
                      {shopSettings?.systemLanguage === 'bn' ? 'মিডিয়া ও ব্যানার' : 'Store Media Assets'}
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        {shopSettings?.systemLanguage === 'bn' ? 'লোগো ইমেজ লিঙ্ক (URL)' : 'Logo Image Link (URL)'}
                      </label>
                      <input 
                        type="text"
                        name="storeLogo"
                        value={formData.storeLogo}
                        onChange={handleChange}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white outline-none"
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        {shopSettings?.systemLanguage === 'bn' ? 'হিরো ব্যানার ইমেজ লিঙ্ক (URL)' : 'Hero Banner Image Link (URL)'}
                      </label>
                      <input 
                        type="text"
                        name="storeHeroBanner"
                        value={formData.storeHeroBanner}
                        onChange={handleChange}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white outline-none"
                        placeholder="https://example.com/banner.jpg"
                      />
                    </div>
                  </div>
                </div>

                {/* Social Integration */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-50 dark:border-slate-800 pb-3 mb-2">
                    <LinkIcon className="w-5 h-5 text-sky-500" />
                    <h3 className="font-bold text-slate-800 dark:text-white">
                      {shopSettings?.systemLanguage === 'bn' ? 'সোশ্যাল মিডিয়া লিংক' : 'Social Connection Links'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Facebook URL</label>
                      <input 
                        type="text"
                        name="socialFacebook"
                        value={formData.socialFacebook}
                        onChange={handleChange}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white outline-none"
                        placeholder="https://facebook.com/myshop"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Instagram URL</label>
                      <input 
                        type="text"
                        name="socialInstagram"
                        value={formData.socialInstagram}
                        onChange={handleChange}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white outline-none"
                        placeholder="https://instagram.com/myshop"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">WhatsApp Mobile No</label>
                      <input 
                        type="text"
                        name="socialWhatsapp"
                        value={formData.socialWhatsapp}
                        onChange={handleChange}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white outline-none"
                        placeholder="e.g. 88017XXXXXXXX"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel: Interactive Layout Mockup/Previewer */}
              <div className="lg:col-span-5 lg:sticky lg:top-6 space-y-4">
                <div className="bg-slate-900 rounded-3xl p-4 shadow-xl border border-slate-800 text-white relative">
                  <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                    <button 
                      onClick={() => setPreviewMode('desktop')} 
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${previewMode === 'desktop' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      <Laptop className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setPreviewMode('mobile')} 
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${previewMode === 'mobile' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      <Smartphone className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 select-none ml-2">Interactive Preview Mockup</span>
                  </div>

                  {/* Device shell */}
                  <div className={`transition-all duration-300 mx-auto bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden ${previewMode === 'mobile' ? 'max-w-[280px]' : 'w-full'}`}>
                    {/* Embedded Virtual Store view */}
                    <div className="bg-white text-slate-900 text-xs min-h-[400px] flex flex-col justify-between">
                      {/* Store Header */}
                      <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {formData.storeLogo ? (
                            <img src={formData.storeLogo} className="w-5 h-5 rounded object-contain" alt="logo" />
                          ) : (
                            <div className={`w-5 h-5 rounded ${formData.storePrimaryColor || 'bg-emerald-600'} flex items-center justify-center text-[10px] text-white font-bold`}>
                              {(formData.storeName || 'S')[0]?.toUpperCase()}
                            </div>
                          )}
                          <span className="font-bold text-[11px] truncate max-w-[120px]">{formData.storeName || 'My Supermarket'}</span>
                        </div>
                        <div className="flex gap-2">
                          <ShoppingCart className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      </div>

                      {/* Store Hero Area */}
                      <div className="relative">
                        {formData.storeHeroBanner ? (
                          <div className="h-28 w-full">
                            <img src={formData.storeHeroBanner} className="w-full h-full object-cover" alt="banner" />
                          </div>
                        ) : (
                          <div className={`p-4 text-center text-white ${formData.storePrimaryColor || 'bg-emerald-600'}`}>
                            <h4 className="font-black text-xs line-clamp-1">{formData.storeHeadline || 'Welcome to our Premium Store!'}</h4>
                            <p className="text-[9px] opacity-85 mt-1 line-clamp-2">{formData.storeDescription || 'Order premium everyday goods with quick local delivery.'}</p>
                          </div>
                        )}
                      </div>

                      {/* Store Body content based on selected category */}
                      <div className="p-3 flex-1 bg-slate-50">
                        {formData.storeCategory === 'grocery' && (
                          <div className="space-y-2">
                            <div className="flex gap-1.5 overflow-x-auto py-1">
                              {['All', 'Fresh Greens', 'Oils', 'Spices'].map((cat, i) => (
                                <span key={cat} className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${i === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200/50 text-slate-600'}`}>{cat}</span>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { name: 'Fresh Tomato', price: '৳৭৫', img: '🍅' },
                                { name: 'Green Chili', price: '৳১২০', img: '🌶️' }
                              ].map(item => (
                                <div key={item.name} className="bg-white p-2 rounded-lg border border-slate-100/80 flex flex-col justify-between shadow-xs">
                                  <span className="text-lg text-center my-1 block">{item.img}</span>
                                  <h5 className="font-bold text-[9px] truncate">{item.name}</h5>
                                  <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-50">
                                    <span className="text-[9px] font-black text-emerald-600">{item.price}</span>
                                    <span className="p-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-bold">Buy</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {formData.storeCategory === 'electronics' && (
                          <div className="space-y-2">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 block mb-1">🔥 Top Deals</span>
                            <div className="bg-slate-900 text-white p-2.5 rounded-lg flex items-center justify-between border border-slate-800">
                              <div>
                                <h5 className="font-bold text-[9px]">Sleek Earbuds Pro</h5>
                                <span className="text-[8px] text-slate-400 block">1 Year Warranty</span>
                                <span className="text-[10px] font-bold text-indigo-400 block mt-1">৳১,৮৫০</span>
                              </div>
                              <span className="text-xl">🎧</span>
                            </div>
                          </div>
                        )}

                        {formData.storeCategory === 'pharmacy' && (
                          <div className="space-y-2">
                            <div className="bg-cyan-50 border border-cyan-100 p-2.5 rounded-lg text-cyan-800 flex items-center justify-between">
                              <div>
                                <h5 className="font-bold text-[9px]">Upload Prescription</h5>
                                <p className="text-[8px] opacity-80 mt-0.5">Quick order via photo upload</p>
                              </div>
                              <FileText className="w-4 h-4 text-cyan-600 shrink-0" />
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-100 flex items-center justify-between">
                              <div>
                                <h5 className="font-semibold text-[9px]">Napa Extend 665mg</h5>
                                <span className="text-[10px] font-bold text-cyan-600">৳১৫</span>
                              </div>
                              <span className="px-2 py-0.5 bg-cyan-600 text-white rounded text-[8px] font-bold">Add</span>
                            </div>
                          </div>
                        )}

                        {formData.storeCategory === 'wholesale' && (
                          <div className="space-y-2">
                            <span className="text-[8px] font-bold text-indigo-600 uppercase block">📦 Wholesale Deals</span>
                            <div className="bg-white border border-indigo-50 p-2 rounded-lg space-y-1.5">
                              <div className="flex items-center justify-between text-[9px] font-bold">
                                <span>Bulk Sacks Rice</span>
                                <span className="text-indigo-600">৳৩,৪৫০ / sack</span>
                              </div>
                              <div className="text-[8px] text-slate-400">Min. Order (MOQ): 10 sacks</div>
                              <button className="w-full bg-indigo-600 text-white text-[8px] py-1 font-bold rounded">Bulk Add</button>
                            </div>
                          </div>
                        )}

                        {formData.storeCategory === 'ecommerce' && (
                          <div className="space-y-2">
                            <div className="bg-rose-50 border border-rose-100 p-2 rounded-lg text-center">
                              <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest block">FLASH SALE - 30% OFF</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white p-2 rounded-lg border border-slate-100">
                                <span className="text-base block text-center">👕</span>
                                <h5 className="font-bold text-[9px] truncate">Premium Cotton Polo</h5>
                                <span className="text-[9px] text-rose-600 font-bold block mt-0.5">৳৫৫০ <span className="text-[8px] text-slate-400 line-through">৳৮০০</span></span>
                              </div>
                              <div className="bg-white p-2 rounded-lg border border-slate-100">
                                <span className="text-base block text-center">🕶️</span>
                                <h5 className="font-bold text-[9px] truncate">Classic Aviators</h5>
                                <span className="text-[9px] text-rose-600 font-bold block mt-0.5">৳৩৫০</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Store Footer */}
                      <div className="p-2 border-t border-slate-100 bg-white text-center text-[8px] text-slate-400">
                        &copy; {new Date().getFullYear()} {formData.storeName || 'My Supermarket'}. Powered by SellersCampus
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 space-y-2 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block text-slate-700 dark:text-slate-300">💡 Expert Branding Advice</span>
                      For a premium customer experience, we recommend using hostings like ImgBB or Unsplash to get direct image URLs, and keeping your social connections updated to ease direct client conversations!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Theme Gallery Sub-Page */}
          {activeTab === 'gallery' && (
            <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400 rounded-full text-xs font-bold uppercase tracking-wider">Business Categories</span>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white">Theme Layout Showcase</h3>
                <p className="text-slate-500 text-sm">
                  {shopSettings?.systemLanguage === 'bn' 
                    ? 'আপনার ব্যবসার ধরন অনুযায়ী কাস্টমাইজড লেআউট পছন্দ করুন। আপনার স্টোরের আইটেম ও থিম লেআউট সাথে সাথে বদলে যাবে।' 
                    : 'Activate a professionally handcrafted theme matching your business category. All product widgets, elements, and styles will adapt.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
                {categories.map(theme => {
                  const isActive = selectedThemeId === theme.id;
                  return (
                    <div 
                      key={theme.id} 
                      onClick={() => selectThemeCategory(theme.id, theme.accent, theme.hoverAccent)}
                      className={`group relative rounded-2xl border-2 overflow-hidden transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between ${
                        isActive 
                          ? 'border-indigo-600 ring-4 ring-indigo-500/10' 
                          : 'border-slate-100 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {/* Banner Visual */}
                      <div className="h-40 w-full relative overflow-hidden bg-slate-100">
                        <img 
                          src={theme.previewBanner} 
                          alt={theme.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent flex flex-col justify-end p-4">
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-300 block mb-1">
                            {theme.type}
                          </span>
                          <h4 className="font-bold text-white text-base">
                            {shopSettings?.systemLanguage === 'bn' ? theme.name_bn : theme.name}
                          </h4>
                        </div>

                        {isActive && (
                          <div className="absolute top-3 right-3 bg-indigo-600 text-white p-1.5 rounded-full shadow-lg">
                            <CheckCircle className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      {/* Info & Badges */}
                      <div className="p-5 flex-1 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          {shopSettings?.systemLanguage === 'bn' ? theme.desc_bn : theme.desc}
                        </p>

                        <div className="space-y-1.5">
                          <span className="text-[9px] font-extrabold tracking-wider text-slate-400 block uppercase">Included Features</span>
                          <div className="flex flex-wrap gap-1.5">
                            {theme.features.map(feat => (
                              <span key={feat} className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded text-[9px] font-bold text-slate-500 dark:text-slate-400">
                                {feat}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2">
                          <button 
                            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${
                              isActive 
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white'
                            }`}
                          >
                            {isActive 
                              ? (shopSettings?.systemLanguage === 'bn' ? '✓ থিম সক্রিয় আছে' : '✓ Active Theme') 
                              : (shopSettings?.systemLanguage === 'bn' ? 'থিম সক্রিয় করুন' : 'Activate Theme')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Live Store Preview */}
          {activeTab === 'preview' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800/80 shadow-sm overflow-hidden flex flex-col" style={{ height: '70vh' }}>
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                   <div className="flex gap-1.5">
                     <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                     <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                     <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                   </div>
                   <div className="ml-4 px-4 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 flex items-center gap-2 font-mono">
                     <MonitorSmartphone className="w-3.5 h-3.5 text-slate-400" />
                     {window.location.origin}/merchant/{formData.merchantCode}
                   </div>
                </div>
                <a 
                  href={`/merchant/${formData.merchantCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5"
                >
                  {shopSettings?.systemLanguage === 'bn' ? 'নতুন ট্যাবে খুলুন' : 'Open in New Tab'}
                  <LinkIcon className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 relative">
                <iframe 
                  src={`/merchant/${formData.merchantCode}`}
                  className="w-full h-full border-0 bg-white"
                  title="Live Public Store Preview"
                />
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
