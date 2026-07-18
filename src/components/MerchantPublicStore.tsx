import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { ShoppingBag, Facebook, Instagram, Twitter, MessageCircle, MapPin, Globe, Loader2 } from 'lucide-react';

export default function MerchantPublicStore() {
  const { merchantCode } = useParams();
  const [storeData, setStoreData] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStore = async () => {
      try {
        if (!merchantCode) return;
        
        // Find shop by merchantCode
        const shopsRef = collection(db, 'shops');
        const q = query(shopsRef, where('merchantCode', '==', merchantCode));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const shopData = snapshot.docs[0].data();
          const shopId = snapshot.docs[0].id;
          
          setStoreData({
            ...shopData,
            shopId
          });

          // Fetch products
          const productsRef = collection(db, 'products');
          const pQ = query(productsRef, where('shopId', '==', shopId));
          const pSnapshot = await getDocs(pQ);
          const pData = pSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          // Filter out out-of-stock or deleted if needed
          setProducts(pData.filter((p: any) => p.stock > 0));
        }
      } catch (err) {
        console.error("Error fetching merchant store:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStore();
  }, [merchantCode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <span className="ml-3 text-gray-600 font-medium">Loading Store...</span>
      </div>
    );
  }

  if (!storeData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <ShoppingBag className="w-16 h-16 text-gray-300 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Store Not Found</h1>
        <p className="text-gray-500 max-w-md">The merchant code "{merchantCode}" does not match any active store in our system.</p>
        <Link to="/" className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors">
          Return to Home
        </Link>
      </div>
    );
  }

  const theme = storeData.storeTheme || 'light';
  const bgColor = theme === 'dark' ? 'bg-slate-900' : theme === 'green' ? 'bg-emerald-50' : 'bg-gray-50';
  const textColor = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const cardBg = theme === 'dark' ? 'bg-slate-800' : 'bg-white';
  const primaryColor = storeData.storePrimaryColor || 'bg-indigo-600';
  const primaryColorHover = storeData.storePrimaryColorHover || 'hover:bg-indigo-700';

  return (
    <div className={`min-h-screen ${bgColor} ${textColor} font-sans`}>
      {/* Header */}
      <header className={`${cardBg} shadow-sm sticky top-0 z-50`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {storeData.storeLogo ? (
                <img src={storeData.storeLogo} alt={storeData.storeName || storeData.businessName} className="h-10 w-auto rounded" />
              ) : (
                <div className={`w-10 h-10 rounded-lg ${primaryColor} flex items-center justify-center text-white font-bold text-xl`}>
                  {(storeData.storeName || storeData.businessName || 'S')[0]?.toUpperCase()}
                </div>
              )}
              <h1 className="text-xl font-bold">{storeData.storeName || storeData.businessName || 'Merchant Store'}</h1>
            </div>
            
            <div className="hidden md:flex items-center gap-4">
              {storeData.socialFacebook && (
                <a href={storeData.socialFacebook} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors">
                  <Facebook className="w-5 h-5" />
                </a>
              )}
              {storeData.socialInstagram && (
                <a href={storeData.socialInstagram} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-pink-600 transition-colors">
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {storeData.socialWhatsapp && (
                <a href={`https://wa.me/${storeData.socialWhatsapp}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-green-500 transition-colors">
                  <MessageCircle className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative">
        {storeData.storeHeroBanner ? (
          <div className="h-64 md:h-96 w-full object-cover">
            <img src={storeData.storeHeroBanner} alt="Store Banner" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className={`h-48 md:h-64 w-full ${primaryColor} flex items-center justify-center px-4`}>
             <div className="text-center text-white">
                <h2 className="text-3xl md:text-5xl font-bold mb-4">{storeData.storeHeadline || 'Welcome to Our Store!'}</h2>
                <p className="text-white/80 max-w-2xl mx-auto md:text-lg">{storeData.storeDescription || 'Browse our collection of premium products.'}</p>
             </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Featured Products</h2>
        </div>

        {products.length === 0 ? (
          <div className={`p-8 rounded-2xl ${cardBg} border border-gray-200/20 text-center`}>
            <ShoppingBag className="w-12 h-12 mx-auto text-gray-400 mb-3" />
            <p className="text-gray-500">No products available at the moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {products.map((product) => (
              <div key={product.id} className={`${cardBg} rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group border border-gray-100 dark:border-slate-700/50`}>
                <div className="relative aspect-square bg-gray-100 dark:bg-slate-700">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <ShoppingBag className="w-8 h-8 opacity-50" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-sm md:text-base line-clamp-2 mb-1">{product.name}</h3>
                  <div className="flex items-center justify-between mt-3">
                    <span className="font-bold text-lg">৳{product.sellPrice || product.price}</span>
                  </div>
                  <button className={`w-full mt-4 py-2 rounded-lg text-white font-medium text-sm transition-colors ${primaryColor} ${primaryColorHover}`}>
                    Order Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className={`${cardBg} border-t border-gray-200/20 mt-12 py-12`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg ${primaryColor} flex items-center justify-center text-white font-bold`}>
                  {(storeData.storeName || storeData.businessName || 'S')[0]?.toUpperCase()}
                </div>
                <h3 className="font-bold text-lg">{storeData.storeName || storeData.businessName}</h3>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
                {storeData.storeDescription || 'Providing quality products and excellent customer service.'}
              </p>
            </div>
            
            <div>
              <h4 className="font-bold mb-4">Contact Us</h4>
              <ul className="space-y-3 text-sm text-gray-500">
                {storeData.businessPhone && (
                  <li className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-gray-400" />
                    <span>{storeData.businessPhone}</span>
                  </li>
                )}
                {storeData.businessEmail && (
                  <li className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <span>{storeData.businessEmail}</span>
                  </li>
                )}
                {storeData.businessAddress && (
                  <li className="flex items-center gap-2 items-start">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <span>{storeData.businessAddress}</span>
                  </li>
                )}
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold mb-4">Follow Us</h4>
              <div className="flex items-center gap-3">
                {storeData.socialFacebook && (
                  <a href={storeData.socialFacebook} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors">
                    <Facebook className="w-5 h-5" />
                  </a>
                )}
                {storeData.socialInstagram && (
                  <a href={storeData.socialInstagram} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center hover:bg-pink-100 transition-colors">
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
                {storeData.socialWhatsapp && (
                  <a href={`https://wa.me/${storeData.socialWhatsapp}`} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors">
                    <MessageCircle className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200/20 mt-12 pt-6 text-center text-sm text-gray-500 flex flex-col md:flex-row items-center justify-between">
            <p>&copy; {new Date().getFullYear()} {storeData.storeName || storeData.businessName}. All rights reserved.</p>
            <p className="mt-2 md:mt-0 flex items-center gap-1">Powered by <span className="font-semibold text-indigo-600">SellersCampus POS</span></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
