import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Layout, Link2, Settings, Smartphone, Eye, Copy, Check, Upload, ExternalLink, Brush, ChevronDown, ChevronUp, GripVertical, Image as ImageIcon } from 'lucide-react';

interface LinkItem {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

interface BioProfile {
  name: string;
  bio: string;
  photoUrl: string;
}

const THEMES = [
  { id: 'minimal', name: 'Minimal Light', bg: 'bg-white', text: 'text-gray-900', btnBg: 'bg-gray-100', btnText: 'text-gray-900', btnHover: 'hover:bg-gray-200' },
  { id: 'dark', name: 'Sleek Dark', bg: 'bg-slate-900', text: 'text-white', btnBg: 'bg-slate-800', btnText: 'text-white', btnHover: 'hover:bg-slate-700' },
  { id: 'gradient_purple', name: 'Purple Gradient', bg: 'bg-gradient-to-br from-fuchsia-600 to-purple-900', text: 'text-white', btnBg: 'bg-white/20 backdrop-blur-md border border-white/30', btnText: 'text-white', btnHover: 'hover:bg-white/30' },
  { id: 'gradient_ocean', name: 'Ocean Vibes', bg: 'bg-gradient-to-br from-cyan-500 to-blue-700', text: 'text-white', btnBg: 'bg-white', btnText: 'text-blue-900', btnHover: 'hover:bg-gray-50' },
  { id: 'brutalist', name: 'Brutalist', bg: 'bg-[#FFE500]', text: 'text-black', btnBg: 'bg-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]', btnText: 'text-black font-black uppercase', btnHover: 'hover:translate-x-1 hover:translate-y-1 hover:shadow-none' },
  { id: 'monochrome', name: 'Monochrome', bg: 'bg-gray-200', text: 'text-gray-900', btnBg: 'bg-black rounded-full', btnText: 'text-white', btnHover: 'hover:bg-gray-800' },
];

export default function BusinessBio() {
  const [activeTab, setActiveTab] = useState<'links' | 'appearance' | 'settings'>('links');
  const [profile, setProfile] = useState<BioProfile>({
    name: 'Your Business Name',
    bio: 'Welcome to our official link page. Find all our services and social profiles below.',
    photoUrl: ''
  });
  const [links, setLinks] = useState<LinkItem[]>([
    { id: '1', title: 'Visit Our Website', url: 'https://example.com', isActive: true },
    { id: '2', title: 'Follow on Facebook', url: 'https://facebook.com', isActive: true },
    { id: '3', title: 'Shop Now', url: 'https://shop.example.com', isActive: true },
  ]);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [copied, setCopied] = useState(false);
  const [isMobilePreview, setIsMobilePreview] = useState(true);

  const handleAddLink = () => {
    setLinks([...links, { id: Date.now().toString(), title: 'New Link', url: 'https://', isActive: true }]);
  };

  const handleUpdateLink = (id: string, field: keyof LinkItem, value: string | boolean) => {
    setLinks(links.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const handleDeleteLink = (id: string) => {
    setLinks(links.filter(l => l.id !== id));
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`https://app.sellerscampus.com/bio/${profile.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderPreview = () => {
    return (
      <div className={`w-full overflow-y-auto custom-scrollbar h-full flex flex-col items-center py-10 px-6 ${selectedTheme.bg} transition-colors duration-500`}>
        <div className="w-24 h-24 rounded-full overflow-hidden mb-4 border-2 border-white/50 shadow-xl bg-white/20 flex flex-shrink-0 items-center justify-center">
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className={`w-8 h-8 ${selectedTheme.text} opacity-50`} />
          )}
        </div>
        <h2 className={`text-xl font-bold mb-2 ${selectedTheme.text} text-center`}>{profile.name || 'Business Name'}</h2>
        <p className={`text-sm mb-8 text-center max-w-[280px] ${selectedTheme.text} opacity-90`}>
          {profile.bio || 'Add a short bio to introduce yourself.'}
        </p>

        <div className="w-full space-y-4">
          {links.filter(l => l.isActive).map(link => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block w-full py-4 px-6 text-center rounded-xl transition-all duration-300 font-semibold shadow-sm ${selectedTheme.btnBg} ${selectedTheme.btnText} ${selectedTheme.btnHover}`}
            >
              {link.title || 'Untitled Link'}
            </a>
          ))}
        </div>
        
        <div className="mt-auto pt-10">
          <p className={`text-[10px] font-bold tracking-widest uppercase ${selectedTheme.text} opacity-50`}>
            Powered by Business Suite
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col md:flex-row bg-slate-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800">
      
      {/* Editor Section */}
      <div className="flex-[1.5] lg:flex-[2] flex flex-col overflow-hidden border-r border-gray-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="bg-white dark:bg-slate-950 px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between z-10">
          <div>
            <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Business Bio</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your bio link page & templates</p>
          </div>
          <button 
            onClick={handleCopyLink}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied Link!' : 'Copy Link'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-800 px-6 bg-white dark:bg-slate-950">
          {[
            { id: 'links', icon: Link2, label: 'Links' },
            { id: 'appearance', icon: Brush, label: 'Appearance' },
            { id: 'settings', icon: Settings, label: 'Settings' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 font-semibold text-sm border-b-2 transition-colors ${
                activeTab === tab.id 
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Editor Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900 custom-scrollbar">
          
          {activeTab === 'links' && (
            <div className="max-w-2xl mx-auto space-y-6">
              
              <button 
                onClick={handleAddLink}
                className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.99]"
              >
                <Plus className="w-5 h-5" /> Add New Link
              </button>

              <div className="space-y-4 mt-8">
                {links.map((link, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={link.id} 
                    className="bg-white dark:bg-slate-950 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-2 cursor-grab text-gray-400 hover:text-gray-600">
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <input 
                            type="text"
                            value={link.title}
                            onChange={(e) => handleUpdateLink(link.id, 'title', e.target.value)}
                            placeholder="Link Title"
                            className="bg-transparent font-bold text-gray-900 dark:text-white border-0 focus:ring-0 p-0 text-base flex-1 placeholder:text-gray-400"
                          />
                          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                            <input type="checkbox" className="sr-only peer" checked={link.isActive} onChange={(e) => handleUpdateLink(link.id, 'isActive', e.target.checked)} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-500"></div>
                          </label>
                        </div>
                        <input 
                          type="url"
                          value={link.url}
                          onChange={(e) => handleUpdateLink(link.id, 'url', e.target.value)}
                          placeholder="URL (e.g. https://example.com)"
                          className="w-full bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                      <button 
                        onClick={() => handleDeleteLink(link.id)}
                        className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors mt-1"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
                
                {links.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Link2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No links added yet. Click the button above to add your first link.</p>
                  </div>
                )}
              </div>

            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="max-w-2xl mx-auto space-y-10">
              
              {/* Profile Editor */}
              <div className="bg-white dark:bg-slate-950 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Profile</h3>
                <div className="flex items-start gap-6">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                      {profile.photoUrl ? (
                         <img src={profile.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                         <ImageIcon className="w-8 h-8 text-gray-400" />
                      )}
                    </div>
                    <button className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full font-semibold text-xs">
                      <Upload className="w-4 h-4 mb-1" /> Upload
                    </button>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Profile Title</label>
                      <input 
                        type="text" 
                        value={profile.name}
                        onChange={e => setProfile({...profile, name: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Bio</label>
                      <textarea 
                        rows={3}
                        value={profile.bio}
                        onChange={e => setProfile({...profile, bio: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Themes */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Themes ({THEMES.length})</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {THEMES.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => setSelectedTheme(theme)}
                      className={`text-left rounded-xl overflow-hidden border-2 transition-all ${selectedTheme.id === theme.id ? 'border-indigo-600 scale-[1.02] shadow-md' : 'border-gray-200 dark:border-slate-700 hover:border-indigo-300'}`}
                    >
                      <div className={`h-24 ${theme.bg} p-3 flex flex-col gap-2 items-center justify-center`}>
                        <div className="w-8 h-8 rounded-full bg-white/20 border border-white/40 mb-1"></div>
                        <div className={`w-16 h-3 rounded-lg ${theme.btnBg} border border-white/20`}></div>
                        <div className={`w-16 h-3 rounded-lg ${theme.btnBg} border border-white/20`}></div>
                      </div>
                      <div className="p-3 bg-white dark:bg-slate-800">
                        <p className="text-xs font-bold text-gray-900 dark:text-white">{theme.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'settings' && (
             <div className="max-w-2xl mx-auto py-10 text-center">
                 <Settings className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                 <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Advanced Settings</h3>
                 <p className="text-gray-500">SEO, Custom Domain, and Analytics integrations will be available here.</p>
             </div>
          )}

        </div>
      </div>

      {/* Preview Section */}
      <div className={`hidden md:flex flex-1 lg:flex-[1.2] bg-slate-100 dark:bg-slate-950 items-center justify-center p-8 relative isolate overflow-hidden`}>
        {/* Background Decor */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-50 z-0"></div>
        
        {/* Mobile Device Frame */}
        <div className="relative z-10 w-full max-w-[340px] h-[680px] bg-black rounded-[3rem] p-3 shadow-2xl ring-1 ring-gray-900/10 dark:ring-white/10">
          <div className="absolute top-0 inset-x-0 h-7 bg-black rounded-t-[3rem] z-20 flex justify-center pt-2">
            <div className="w-20 h-5 bg-black rounded-b-xl"></div>
          </div>
          <div className="w-full h-full bg-white rounded-[2.25rem] overflow-hidden relative">
            {renderPreview()}
          </div>
        </div>
      </div>

    </div>
  );
}
