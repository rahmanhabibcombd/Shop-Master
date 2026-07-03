import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  HelpCircle, 
  Bug, 
  Sparkles, 
  Star, 
  UploadCloud, 
  X, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ChevronDown, 
  Filter, 
  Trash2, 
  User, 
  Mail, 
  FileText, 
  Image as ImageIcon, 
  Send, 
  Eye,
  Check,
  LifeBuoy,
  Phone,
  ThumbsUp,
  Sliders,
  Settings
} from 'lucide-react';
import { db, auth, 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  updateDoc
} from '../firebase';

interface SupportTicket {
  id: string;
  shopId: string;
  userId: string;
  userEmail: string;
  title: string;
  type: 'bug' | 'feature' | 'question' | 'feedback';
  description: string;
  screenshot?: string;
  rating?: number;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  developerNote?: string;
  createdAt: string;
  updatedAt: string;
}

interface SupportPageProps {
  user: any;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' }) => void;
  lang?: 'en' | 'bn';
}

export const SupportPage: React.FC<SupportPageProps> = ({ user, setNotification, lang = 'en' }) => {
  const isBn = lang === 'bn';
  const userEmail = user?.email || '';
  const isMasterAdmin = userEmail.toLowerCase().trim() === 'stratproamz@gmail.com';

  // State
  const [activeTab, setActiveTab] = useState<'new_ticket' | 'my_tickets' | 'developer_dashboard'>(
    isMasterAdmin ? 'developer_dashboard' : 'new_ticket'
  );
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [allTickets, setAllTickets] = useState<SupportTicket[]>([]); // For developer admin
  const [isLoading, setIsLoading] = useState(true);

  // Dynamic Clock & Timer States
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeOffsetMinutes, setTimeOffsetMinutes] = useState(0); // offset in minutes
  const [isClockOpen, setIsClockOpen] = useState(false);
  const [timerMode, setTimerMode] = useState<'clock' | 'stopwatch' | 'countdown'>('clock');
  
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  
  const [countdownSeconds, setCountdownSeconds] = useState(300); // 5 minutes default
  const [isCountdownRunning, setIsCountdownRunning] = useState(false);

  // Live Clock Tick
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Stopwatch Tick
  useEffect(() => {
    let interval: any = null;
    if (isStopwatchRunning && timerMode === 'stopwatch') {
      interval = setInterval(() => {
        setStopwatchSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isStopwatchRunning, timerMode]);

  // Countdown Tick
  useEffect(() => {
    let interval: any = null;
    if (isCountdownRunning && timerMode === 'countdown') {
      interval = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            setIsCountdownRunning(false);
            setNotification({
              message: isBn ? "⏰ কাউন্টডাউন শেষ হয়েছে!" : "⏰ Countdown timer finished!",
              type: 'success'
            });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCountdownRunning, timerMode, isBn, setNotification]);

  const getAdjustedTime = () => {
    return new Date(currentTime.getTime() + timeOffsetMinutes * 60 * 1000);
  };

  const formatStopwatch = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Form State
  const [title, setTitle] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [type, setType] = useState<'bug' | 'feature' | 'question' | 'feedback'>('bug');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [screenshot, setScreenshot] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Developer Control state
  const [developerReply, setDeveloperReply] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'open' | 'in_progress' | 'resolved' | 'closed'>('resolved');
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [devFilterType, setDevFilterType] = useState<string>('all');
  const [devFilterStatus, setDevFilterStatus] = useState<string>('all');

  // Preview screenshot modal state
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Load User tickets
  useEffect(() => {
    if (!user?.shopId) return;

    setIsLoading(true);
    const q = query(
      collection(db, 'support_tickets'),
      where('shopId', '==', user.shopId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: SupportTicket[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as SupportTicket);
      });
      setTickets(list);
      setIsLoading(false);
    }, (err) => {
      console.error("Error fetching support tickets:", err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user?.shopId]);

  // Load all tickets for developer/master admin
  useEffect(() => {
    if (!isMasterAdmin) return;

    const q = query(
      collection(db, 'support_tickets'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: SupportTicket[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as SupportTicket);
      });
      setAllTickets(list);
    }, (err) => {
      console.error("Error fetching all support tickets for admin:", err);
    });

    return () => unsubscribe();
  }, [isMasterAdmin]);

  // Handle image upload and compression/conversion to base64
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setNotification({
        message: isBn ? "অনুগ্রহ করে শুধু একটি ছবি (image) সিলেক্ট করুন।" : "Please upload image files only.",
        type: 'error'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result !== 'string') return;

      const img = new Image();
      img.onload = () => {
        // Target max width/height
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Compress as JPEG with 0.7 quality
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setScreenshot(compressedDataUrl);
        } else {
          // Fallback if canvas is not supported
          setScreenshot(event.target?.result as string);
        }
      };
      img.src = event.target.result;
    };
    reader.onerror = () => {
      setNotification({
        message: isBn ? "ছবি লোড করতে সমস্যা হয়েছে।" : "Error loading image file.",
        type: 'error'
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  };

  // Submit new ticket
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setNotification({
        message: isBn ? "শিরোনাম এবং বিস্তারিত বিবরণ আবশ্যক।" : "Title and Description are required.",
        type: 'error'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        shopId: user?.shopId || 'global',
        userId: user?.uid || 'anonymous',
        userEmail: contactEmail.trim() || userEmail,
        title: title.trim(),
        type,
        description: description.trim(),
        screenshot: screenshot || '',
        rating: type === 'feedback' ? rating : null,
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        developerNote: ''
      };

      await addDoc(collection(db, 'support_tickets'), payload);

      setNotification({
        message: isBn 
          ? "আপনার বার্তা সফলভাবে আমাদের কাছে পাঠানো হয়েছে! আমরা দ্রুত সমাধান করব।" 
          : "Support ticket registered successfully! We will review and contact you shortly.",
        type: 'success'
      });

      // Reset
      setTitle('');
      setDescription('');
      setScreenshot('');
      setRating(5);
      setActiveTab('my_tickets');
    } catch (err: any) {
      setNotification({
        message: isBn ? `দুঃখিত, সমস্যা হয়েছে: ${err.message}` : `Error saving support ticket: ${err.message}`,
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete ticket (Shop Owners can clean up their list)
  const handleDeleteTicket = async (ticketId: string) => {
    if (!window.confirm(isBn ? 'আপনি কি নিশ্চিত যে এই সাপোর্ট টিকেটটি মুছে ফেলতে চান?' : 'Are you sure you want to delete this support ticket?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'support_tickets', ticketId));
      setNotification({
        message: isBn ? "টিকেটটি সফলভাবে মুছে ফেলা হয়েছে।" : "Support ticket deleted successfully.",
        type: 'success'
      });
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  // Developer updates a ticket (reply & change status)
  const handleDeveloperUpdate = async (ticketId: string) => {
    try {
      await updateDoc(doc(db, 'support_tickets', ticketId), {
        status: selectedStatus,
        developerNote: developerReply.trim(),
        updatedAt: new Date().toISOString()
      });

      setNotification({
        message: isBn ? "টিকেটের স্ট্যাটাস ও রিপ্লাই সফলভাবে আপডেট হয়েছে!" : "Ticket status and developer reply updated successfully!",
        type: 'success'
      });

      setEditingTicketId(null);
      setDeveloperReply('');
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <span className="px-2 py-1 bg-red-950/80 border border-red-800 text-red-400 text-[10px] font-black uppercase rounded-lg flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 animate-pulse" />
            {isBn ? "ওপেন / পেন্ডিং" : "Open / Pending"}
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2 py-1 bg-amber-950/80 border border-amber-800 text-amber-400 text-[10px] font-black uppercase rounded-lg flex items-center gap-1">
            <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
            {isBn ? "কাজ চলছে" : "In Progress"}
          </span>
        );
      case 'resolved':
        return (
          <span className="px-2 py-1 bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-[10px] font-black uppercase rounded-lg flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {isBn ? "সমাধানকৃত" : "Resolved ✔"}
          </span>
        );
      case 'closed':
        return (
          <span className="px-2 py-1 bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-black uppercase rounded-lg flex items-center gap-1">
            <X className="w-3 h-3" />
            {isBn ? "বন্ধ" : "Closed"}
          </span>
        );
      default:
        return null;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'bug':
        return (
          <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-extrabold rounded-md flex items-center gap-1">
            <Bug className="w-3 h-3" />
            {isBn ? "বাগ / সমস্যা" : "Bug"}
          </span>
        );
      case 'feature':
        return (
          <span className="px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-extrabold rounded-md flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {isBn ? "নতুন ফিচার" : "Feature Request"}
          </span>
        );
      case 'question':
        return (
          <span className="px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-extrabold rounded-md flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            {isBn ? "জিজ্ঞাসা" : "Question"}
          </span>
        );
      case 'feedback':
        return (
          <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-extrabold rounded-md flex items-center gap-1">
            <ThumbsUp className="w-3 h-3" />
            {isBn ? "ফিডব্যাক" : "Feedback"}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
      
      {/* HEADER HERO */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/60 border border-slate-800 p-6 lg:p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-emerald-600/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 rounded-2xl">
              <LifeBuoy className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl lg:text-2xl font-black text-slate-100 tracking-tight">
                {isBn ? "ডেভেলপার সাপোর্ট ও ফিডব্যাক সেন্টার" : "Developer Support & Feedback"}
              </h2>
              <p className="text-xs text-slate-400 font-bold">
                {isBn ? "অ্যাপের সমস্যা রিপোর্ট, ফিডব্যাক বা ডেভেলপারদের সাথে যোগাযোগের মূল প্যানেল" : "Report application bugs, request features, share ratings, and get expert help"}
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Clock & Timer Widget with Custom Offset Time */}
        <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl flex flex-col items-stretch gap-2.5 shrink-0 backdrop-blur-xl relative z-10 min-w-[240px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-950 text-indigo-400 border border-indigo-800 rounded-xl flex items-center justify-center font-black">
                {timerMode === 'clock' && <Clock className="w-4 h-4 animate-pulse" />}
                {timerMode === 'stopwatch' && <Clock className="w-4 h-4" />}
                {timerMode === 'countdown' && <Clock className="w-4 h-4" />}
              </div>
              <div className="text-left">
                <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">
                  {timerMode === 'clock' && (isBn ? "ডায়নামিক ক্লক" : "Interactive Clock")}
                  {timerMode === 'stopwatch' && (isBn ? "স্টপওয়াচ" : "Support Stopwatch")}
                  {timerMode === 'countdown' && (isBn ? "কাউন্টডাউন টাইমার" : "Session Countdown")}
                </span>
                
                {/* Active Mode Time Display */}
                <span className="block font-mono text-sm font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)] select-none">
                  {timerMode === 'clock' && getAdjustedTime().toLocaleTimeString('en-US', { hour12: true })}
                  {timerMode === 'stopwatch' && formatStopwatch(stopwatchSeconds)}
                  {timerMode === 'countdown' && formatCountdown(countdownSeconds)}
                </span>
              </div>
            </div>

            {/* Quick offset buttons or controls toggle */}
            <button
              onClick={() => setIsClockOpen(!isClockOpen)}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-100 transition-all flex items-center gap-1 text-[10px] font-black uppercase"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400 animate-spin" style={{ animationDuration: '6s' }} />
              {isClockOpen ? (isBn ? "বন্ধ" : "Hide") : (isBn ? "সময় যোগ" : "Add Time")}
            </button>
          </div>

          {/* Expanded controls dropdown panel */}
          <AnimatePresence>
            {isClockOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-t border-slate-850 pt-2.5 space-y-2.5"
              >
                {/* Mode Selector */}
                <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
                  <button
                    onClick={() => setTimerMode('clock')}
                    className={`py-1 text-[9px] font-black uppercase rounded-lg transition-all ${
                      timerMode === 'clock' 
                        ? 'bg-indigo-600 text-white' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isBn ? "ঘড়ি" : "Clock"}
                  </button>
                  <button
                    onClick={() => {
                      setTimerMode('stopwatch');
                      setIsStopwatchRunning(false);
                    }}
                    className={`py-1 text-[9px] font-black uppercase rounded-lg transition-all ${
                      timerMode === 'stopwatch' 
                        ? 'bg-indigo-600 text-white' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isBn ? "স্টপওয়াচ" : "Stopwatch"}
                  </button>
                  <button
                    onClick={() => {
                      setTimerMode('countdown');
                      setIsCountdownRunning(false);
                    }}
                    className={`py-1 text-[9px] font-black uppercase rounded-lg transition-all ${
                      timerMode === 'countdown' 
                        ? 'bg-indigo-600 text-white' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isBn ? "টাইমার" : "Timer"}
                  </button>
                </div>

                {/* Clock Mode Controls (Add/Sub hours) */}
                {timerMode === 'clock' && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <span className="text-[8px] font-bold uppercase text-slate-500 block">
                      {isBn ? "ঘড়িতে সময় যোগ করুন:" : "Adjust Clock Time (Offset):"}
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        onClick={() => setTimeOffsetMinutes(prev => prev + 60)}
                        className="py-1 bg-slate-900 hover:bg-indigo-950 border border-slate-800 text-slate-300 hover:text-indigo-400 rounded-lg text-[9px] font-black"
                      >
                        +1 Hr
                      </button>
                      <button
                        onClick={() => setTimeOffsetMinutes(prev => prev + 15)}
                        className="py-1 bg-slate-900 hover:bg-indigo-950 border border-slate-800 text-slate-300 hover:text-indigo-400 rounded-lg text-[9px] font-black"
                      >
                        +15m
                      </button>
                      <button
                        onClick={() => setTimeOffsetMinutes(prev => prev - 60)}
                        className="py-1 bg-slate-900 hover:bg-rose-950 border border-slate-800 text-slate-300 hover:text-rose-400 rounded-lg text-[9px] font-black"
                      >
                        -1 Hr
                      </button>
                      <button
                        onClick={() => setTimeOffsetMinutes(0)}
                        className="py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-[9px] font-black"
                      >
                        Reset
                      </button>
                    </div>
                    {timeOffsetMinutes !== 0 && (
                      <span className="text-[8px] font-semibold font-mono text-indigo-400 block text-right">
                        Offset: {timeOffsetMinutes > 0 ? `+${timeOffsetMinutes}` : timeOffsetMinutes} mins
                      </span>
                    )}
                  </div>
                )}

                {/* Stopwatch Mode Controls */}
                {timerMode === 'stopwatch' && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <span className="text-[8px] font-bold uppercase text-slate-500 block">
                      {isBn ? "স্টপওয়াচ কন্ট্রোল ও সময় যোগ:" : "Stopwatch Control & Offset:"}
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        onClick={() => setStopwatchSeconds(prev => prev + 60)}
                        className="py-1 bg-slate-900 hover:bg-indigo-950 border border-slate-800 text-slate-300 rounded-lg text-[9px] font-black"
                      >
                        +1m
                      </button>
                      <button
                        onClick={() => setStopwatchSeconds(prev => prev + 300)}
                        className="py-1 bg-slate-900 hover:bg-indigo-950 border border-slate-800 text-slate-300 rounded-lg text-[9px] font-black"
                      >
                        +5m
                      </button>
                      <button
                        onClick={() => setIsStopwatchRunning(!isStopwatchRunning)}
                        className={`py-1 rounded-lg text-[9px] font-black ${
                          isStopwatchRunning 
                            ? 'bg-rose-600 text-white' 
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {isStopwatchRunning ? (isBn ? "থামুন" : "Pause") : (isBn ? "শুরু" : "Start")}
                      </button>
                      <button
                        onClick={() => {
                          setStopwatchSeconds(0);
                          setIsStopwatchRunning(false);
                        }}
                        className="py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-lg text-[9px] font-black"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}

                {/* Countdown Timer Mode Controls */}
                {timerMode === 'countdown' && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <span className="text-[8px] font-bold uppercase text-slate-500 block">
                      {isBn ? "টাইমারে সময় যোগ করুন:" : "Timer Controls & Add Time:"}
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        onClick={() => setCountdownSeconds(prev => prev + 60)}
                        className="py-1 bg-slate-900 hover:bg-indigo-950 border border-slate-800 text-slate-300 rounded-lg text-[9px] font-black"
                      >
                        +1 Min
                      </button>
                      <button
                        onClick={() => setCountdownSeconds(prev => prev + 300)}
                        className="py-1 bg-slate-900 hover:bg-indigo-950 border border-slate-800 text-slate-300 rounded-lg text-[9px] font-black"
                      >
                        +5 Min
                      </button>
                      <button
                        onClick={() => setIsCountdownRunning(!isCountdownRunning)}
                        className={`py-1 rounded-lg text-[9px] font-black ${
                          isCountdownRunning 
                            ? 'bg-rose-600 text-white' 
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {isCountdownRunning ? (isBn ? "থামুন" : "Pause") : (isBn ? "শুরু" : "Start")}
                      </button>
                      <button
                        onClick={() => {
                          setCountdownSeconds(300);
                          setIsCountdownRunning(false);
                        }}
                        className="py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-lg text-[9px] font-black"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* VIEW SELECTOR TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-850 pb-4">
        {!isMasterAdmin && (
          <button
            onClick={() => setActiveTab('new_ticket')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'new_ticket'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {isBn ? "নতুন টিকেট সাবমিট" : "Create Support Ticket"}
          </button>
        )}

        {!isMasterAdmin && (
          <button
            onClick={() => setActiveTab('my_tickets')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 relative ${
              activeTab === 'my_tickets'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            {isBn ? "আমার টিকেট খাতা" : "My Active Tickets"}
            {tickets.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
                {tickets.length}
              </span>
            )}
          </button>
        )}

        {isMasterAdmin && (
          <button
            onClick={() => setActiveTab('developer_dashboard')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 relative ${
              activeTab === 'developer_dashboard'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            {isBn ? "ডেভেলপার ড্যাশবোর্ড (সকল টিকেট)" : "Developer Admin Dashboard"}
            {allTickets.filter(t => t.status === 'open').length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                {allTickets.filter(t => t.status === 'open').length} {isBn ? "পেনন্ডিং" : "New"}
              </span>
            )}
          </button>
        )}
      </div>

      {/* RENDER DYNAMIC VIEW PANEL */}
      <div className="space-y-6">
        
        {/* TAB 1: NEW TICKET FORM */}
        {activeTab === 'new_ticket' && !isMasterAdmin && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Form Column */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 p-6 lg:p-8 rounded-[2rem] shadow-xl space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-indigo-400" />
                  {isBn ? "নতুন সাপোর্ট ও ফিডব্যাক টিকেট" : "Submit Bug / Feature Proposal"}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold">
                  {isBn ? "দয়া করে বিস্তারিত বিবরণ দিন যাতে আমরা দ্রুত আপনার সমস্যা সমাধান করতে পারি।" : "Fill out the fields carefully. Screenshots help us find & squash bugs immediately."}
                </p>
              </div>

              <form onSubmit={handleSubmitTicket} className="space-y-5">
                
                {/* Title */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    {isBn ? "টিকেটের শিরোনাম (Title)" : "Ticket Title"}
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={isBn ? "যেমন: প্রিন্ট করার সময় ভ্যাট হিসেব মিলছে না..." : "e.g., Thermal Printer layout cropped on right side..."}
                    className="w-full px-4 py-2.5 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none focus:border-indigo-600 transition-all"
                  />
                </div>

                {/* Contact Email Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    {isBn ? "যোগাযোগের ইমেইল (Contact Email)" : "Contact Email"}
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder={isBn ? "যেমন: email@example.com" : "e.g., email@example.com"}
                    className="w-full px-4 py-2.5 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none focus:border-indigo-600 transition-all"
                  />
                </div>

                {/* Type & Optional Rating */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                      {isBn ? "টিকেটের ধরণ (Category)" : "Category / Request Type"}
                    </label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-xl outline-none focus:border-indigo-600"
                    >
                      <option value="bug">🐛 {isBn ? "বাগ / সফটওয়্যার সমস্যা (Software Bug)" : "Software Bug / Issue"}</option>
                      <option value="feature">✨ {isBn ? "নতুন ফিচার প্রস্তাবনা (Feature Request)" : "Feature Suggestion"}</option>
                      <option value="question">❓ {isBn ? "জিজ্ঞাসা / তথ্য জিজ্ঞাসা (General Query)" : "General Query"}</option>
                      <option value="feedback">💬 {isBn ? "মতামত ও রেটিং (App Experience)" : "App Experience / Rating"}</option>
                    </select>
                  </div>

                  {type === 'feedback' && (
                    <div className="space-y-1 animate-fadeIn">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                        {isBn ? "সিস্টেম রেটিং (1-5 Stars)" : "How is your overall experience?"}
                      </label>
                      <div className="flex items-center gap-1.5 h-10">
                        {[1, 2, 3, 4, 5].map((starVal) => (
                          <button
                            key={starVal}
                            type="button"
                            onClick={() => setRating(starVal)}
                            className="focus:outline-none transition-transform active:scale-90"
                          >
                            <Star 
                              className={`w-6 h-6 transition-all ${
                                starVal <= rating 
                                  ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]' 
                                  : 'text-slate-650 hover:text-slate-400'
                              }`} 
                            />
                          </button>
                        ))}
                        <span className="text-xs font-black text-amber-400 ml-2">
                          ({rating}/5)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    {isBn ? "বিস্তারিত বিবরণ / সমস্যা কি পেলেন (Details)" : "Provide full description of the issue / suggestion"}
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={isBn 
                      ? "আপনার অভিজ্ঞতা বিস্তারিত লিখুন বা বাসায় কাজ করার সময় কি সমস্যা পেলেন তা সুন্দরভাবে শেয়ার করুন..." 
                      : "Describe your experience. E.g., What step failed? What did you expect to happen? Your suggestions will make our system more user-friendly!"}
                    className="w-full px-4 py-3 bg-slate-950 text-xs font-bold text-slate-200 border border-slate-850 rounded-2xl outline-none focus:border-indigo-600 transition-all resize-none placeholder:text-slate-600"
                  />
                </div>

                {/* Drag-and-drop screenshot upload */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                    {isBn ? "স্ক্রিনশট আপলোড (ঐচ্ছিক)" : "Attach Screenshot (Optional)"}
                  </label>
                  
                  {!screenshot ? (
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                        dragActive 
                          ? 'border-indigo-500 bg-indigo-950/20 text-indigo-400' 
                          : 'border-slate-800 bg-slate-950/20 text-slate-500 hover:border-slate-700'
                      }`}
                    >
                      <UploadCloud className="w-8 h-8 mx-auto text-slate-500 mb-2 animate-bounce" style={{ animationDuration: '3s' }} />
                      <p className="text-xs font-bold text-slate-350">{isBn ? "ফাইলের ছবি এখানে ড্র্যাগ করুন অথবা" : "Drag screenshot image here, or"}</p>
                      
                      <label className="mt-2 inline-block cursor-pointer bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase text-slate-200 px-3 py-1.5 rounded-lg border border-slate-750 transition-all">
                        {isBn ? "পিসি/মোবাইল থেকে খুঁজুন" : "Browse Device"}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                      <p className="text-[9px] text-slate-500 mt-1.5 font-semibold">Supports JPEG, PNG under 1MB</p>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-950 border border-slate-850 rounded-2xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={screenshot} 
                          alt="Screenshot upload" 
                          className="w-16 h-12 object-cover rounded-lg border border-slate-850 cursor-pointer" 
                          onClick={() => setPreviewImage(screenshot)}
                        />
                        <div>
                          <span className="text-[10px] font-black text-indigo-400 uppercase block">{isBn ? "স্ক্রিনশট রেডি ✔" : "Screenshot Attached ✔"}</span>
                          <button 
                            type="button" 
                            onClick={() => setPreviewImage(screenshot)}
                            className="text-[9px] font-semibold text-slate-400 hover:text-slate-200 underline"
                          >
                            {isBn ? "বড় করে দেখুন" : "Preview image"}
                          </button>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => setScreenshot('')}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      {isBn ? "টিকেট পাঠানো হচ্ছে..." : "Submitting Ticket..."}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {isBn ? "ডেভেলপারদের বার্তা পাঠান নিশ্চিত করুন ✔" : "Submit Support Ticket ✔"}
                    </>
                  )}
                </button>

              </form>
            </div>

            {/* Quick Tips Side column */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4">
                <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-emerald-400" />
                  {isBn ? "প্রয়োজনীয় গাইডলাইন" : "How to submit effective logs"}
                </h4>
                
                <ul className="space-y-3.5 text-[10px] text-slate-400 font-bold leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <span className="p-1 bg-emerald-950 text-emerald-400 rounded-lg text-[9px] font-mono">1</span>
                    <p>{isBn ? "বাসায় বা দোকানে কোনো নতুন বাগ পেলে তার বিবরণ এবং কোড/পেজের নাম নির্দিষ্ট করে লিখুন।" : "Mention the module tab or the feature name (e.g. DSR, Invoices, Offline Sync) where you hit the roadblock."}</p>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="p-1 bg-emerald-950 text-emerald-400 rounded-lg text-[9px] font-mono">2</span>
                    <p>{isBn ? "ভুল উইন্ডো বা এররের সময় কোনো স্ক্রিনশট থাকলে তা আপলোড করুন। এটি আমাদের ডিবাগ করতে ৯০% সাহায্য করে।" : "Upload screenshots of error popups or broken layouts. This solves the problem 5x faster."}</p>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="p-1 bg-emerald-950 text-emerald-400 rounded-lg text-[9px] font-mono">3</span>
                    <p>{isBn ? "আমাদের সিস্টেমের অভিজ্ঞতা উন্নত করার যেকোনো প্রস্তাব ফিডব্যাক ক্যাটাগরিতে শেয়ার করতে পারেন।" : "Have an idea for a more intuitive layout? Share it under the App Experience category!"}</p>
                  </li>
                </ul>
              </div>

              {/* Developer contact direct info */}
              <div className="bg-indigo-950/30 border border-indigo-900/40 p-5 rounded-3xl space-y-3.5">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded-lg border border-indigo-800">{isBn ? "ডেভ টিম লাইন" : "Direct Hotline"}</span>
                  <Phone className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h5 className="text-xs font-black text-slate-200">{isBn ? "জরুরী সমস্যা সমাধানের হটলাইন" : "Urgent System Crash Support"}</h5>
                  <p className="text-[10px] text-slate-400 mt-1 font-semibold">{isBn ? "যদি কোনো বড় সমস্যা বা সিস্টেম ক্র্যাশ হয়, সরাসরি নিচের নম্বরে যোগাযোগ করতে পারেন:" : "If you encounter any workspace lockouts or sync blockers, call us directly:"}</p>
                </div>
                <div className="pt-2 border-t border-indigo-900/40 font-mono text-xs text-indigo-300 font-extrabold flex items-center justify-between">
                  <span>📞 +8801604877281</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase">{isBn ? "হোয়াটসঅ্যাপ" : "WhatsApp Only"}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 2: MY TICKETS LIST */}
        {activeTab === 'my_tickets' && !isMasterAdmin && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {isLoading ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-bold">{isBn ? "আপনার টিকেট খতিয়ান লোড হচ্ছে..." : "Loading support ticket register..."}</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-slate-850 rounded-[2rem] bg-slate-900/40 text-slate-500 space-y-4">
                <LifeBuoy className="w-12 h-12 mx-auto text-slate-650" />
                <div className="space-y-1">
                  <h4 className="font-black text-slate-350 text-sm uppercase tracking-wider">{isBn ? "কোনো টিকেট পাওয়া যায়নি" : "No Support Tickets Found"}</h4>
                  <p className="text-xs text-slate-500 font-bold">{isBn ? "আপনার বর্তমানে কোনো সমাধান প্রত্যাশী বা পেন্ডিং টিকেট রেজিস্টার করা নাই।" : "You haven't submitted any bug reports or support tickets yet."}</p>
                </div>
                <button
                  onClick={() => setActiveTab('new_ticket')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  {isBn ? "প্রথম টিকেট সাবমিট করুন" : "Submit Your First Ticket"}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tickets.map((ticket) => (
                  <div 
                    key={ticket.id}
                    className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 flex flex-col justify-between"
                  >
                    {/* Top Row */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-start gap-3">
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-xs text-slate-200">{ticket.title}</h4>
                          <span className="text-[9px] text-slate-500 block font-mono">{new Date(ticket.createdAt).toLocaleString('en-GB')}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {getStatusBadge(ticket.status)}
                          {getTypeBadge(ticket.type)}
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-[10px] text-slate-400 font-bold bg-slate-950/40 p-3 rounded-2xl border border-slate-850/60 leading-relaxed whitespace-pre-line">
                        {ticket.description}
                      </p>

                      {/* Rating (if feedback) */}
                      {ticket.type === 'feedback' && ticket.rating && (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase mr-1">{isBn ? "রেটিং:" : "User Rating:"}</span>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star 
                              key={i} 
                              className={`w-3.5 h-3.5 ${i < (ticket.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}`} 
                            />
                          ))}
                        </div>
                      )}

                      {/* Screenshot Thumbnail */}
                      {ticket.screenshot && (
                        <div className="flex items-center gap-2">
                          <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-[9px] font-black text-slate-500 uppercase">{isBn ? "স্ক্রিনশট:" : "Attached Image:"}</span>
                          <button
                            onClick={() => setPreviewImage(ticket.screenshot || null)}
                            className="text-[9px] font-black text-indigo-400 hover:underline hover:text-indigo-300"
                          >
                            [{isBn ? "ছবি দেখুন" : "View Attached Image"}]
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Developer Response Box */}
                    <div className="pt-4 border-t border-slate-850 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider block">{isBn ? "ডেভেলপার ফিডব্যাক ও রিপ্লাই" : "Developer Response"}</span>
                        
                        {/* Option to cancel ticket if resolved */}
                        <button
                          onClick={() => handleDeleteTicket(ticket.id)}
                          className="text-[10px] font-bold text-rose-500 hover:text-rose-400 flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {isBn ? "মুছে ফেলুন" : "Delete"}
                        </button>
                      </div>

                      {ticket.developerNote ? (
                        <div className="p-3 bg-emerald-950/15 border border-emerald-900/30 rounded-xl text-[10px] text-emerald-400 font-bold leading-relaxed relative">
                          <span className="absolute top-2 right-2 bg-emerald-950 border border-emerald-800 text-[8px] px-1 py-0.5 rounded text-emerald-400 uppercase font-black">
                            {isBn ? "রিপ্লাই" : "Reply"}
                          </span>
                          <p className="pr-12">{ticket.developerNote}</p>
                          <span className="text-[8px] text-slate-500 font-mono block mt-1">Updated: {new Date(ticket.updatedAt).toLocaleDateString('en-GB')}</span>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl text-[10px] text-slate-500 font-bold">
                          {isBn 
                            ? "⏳ ডেভেলপার আপনার টিকেটটি দেখছেন। দ্রুত জবাব দেওয়া হবে।" 
                            : "⏳ Awaiting developer verification. Support rep will respond soon."}
                        </div>
                      )}
                    </div>

                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 3: DEVELOPER DASHBOARD CONTROL ( stratproamz@gmail.com ) */}
        {activeTab === 'developer_dashboard' && isMasterAdmin && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <span className="text-[9px] font-black text-slate-500 uppercase block">{isBn ? "মোট জমাকৃত টিকেট" : "Total Tickets"}</span>
                <span className="text-xl font-black font-mono text-slate-100 mt-1 block">{allTickets.length}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <span className="text-[9px] font-black text-rose-400 uppercase block">{isBn ? "পেন্ডিং / ওপেন" : "Pending Open"}</span>
                <span className="text-xl font-black font-mono text-rose-400 mt-1 block">
                  {allTickets.filter(t => t.status === 'open').length}
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <span className="text-[9px] font-black text-amber-500 uppercase block">{isBn ? "কাজ চলমান" : "In Progress"}</span>
                <span className="text-xl font-black font-mono text-amber-500 mt-1 block">
                  {allTickets.filter(t => t.status === 'in_progress').length}
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                <span className="text-[9px] font-black text-emerald-400 uppercase block">{isBn ? "সমাধানকৃত" : "Resolved"}</span>
                <span className="text-xl font-black font-mono text-emerald-400 mt-1 block">
                  {allTickets.filter(t => t.status === 'resolved').length}
                </span>
              </div>
            </div>

            {/* Filter controls */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center gap-4 justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-black uppercase text-slate-300">{isBn ? "ফিল্টার প্যানেল:" : "Filters:"}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Category Filter */}
                <select
                  value={devFilterType}
                  onChange={(e) => setDevFilterType(e.target.value)}
                  className="bg-slate-950 text-xs font-bold text-slate-200 border border-slate-800 rounded-xl p-2 outline-none"
                >
                  <option value="all">{isBn ? "সব ধরণ (All Types)" : "All Types"}</option>
                  <option value="bug">🐛 {isBn ? "বাগ / সমস্যা" : "Bugs"}</option>
                  <option value="feature">✨ {isBn ? "ফিচার প্রস্তাব" : "Features"}</option>
                  <option value="question">❓ {isBn ? "জিজ্ঞাসা" : "Questions"}</option>
                  <option value="feedback">💬 {isBn ? "ফিডব্যাক" : "Feedback"}</option>
                </select>

                {/* Status Filter */}
                <select
                  value={devFilterStatus}
                  onChange={(e) => setDevFilterStatus(e.target.value)}
                  className="bg-slate-950 text-xs font-bold text-slate-200 border border-slate-800 rounded-xl p-2 outline-none"
                >
                  <option value="all">{isBn ? "সব স্ট্যাটাস (All Status)" : "All Status"}</option>
                  <option value="open">🔴 {isBn ? "ওপেন" : "Open"}</option>
                  <option value="in_progress">🟡 {isBn ? "চলমান" : "In Progress"}</option>
                  <option value="resolved">🟢 {isBn ? "সমাধানকৃত" : "Resolved"}</option>
                  <option value="closed">⚪ {isBn ? "বন্ধ" : "Closed"}</option>
                </select>
              </div>
            </div>

            {/* Master Ticket list */}
            <div className="space-y-4">
              {allTickets
                .filter(t => devFilterType === 'all' || t.type === devFilterType)
                .filter(t => devFilterStatus === 'all' || t.status === devFilterStatus)
                .map((ticket) => {
                  const isEditing = editingTicketId === ticket.id;
                  return (
                    <div 
                      key={ticket.id}
                      className={`bg-slate-900 border p-5 rounded-3xl transition-all ${
                        ticket.status === 'open' 
                          ? 'border-rose-900/40 bg-gradient-to-br from-slate-900 to-rose-950/10' 
                          : 'border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getTypeBadge(ticket.type)}
                            {getStatusBadge(ticket.status)}
                            <span className="text-[10px] bg-slate-950 border border-slate-850 px-2 py-0.5 rounded-lg text-slate-400 font-mono">
                              Shop: {ticket.shopId}
                            </span>
                          </div>

                          <h4 className="font-extrabold text-xs text-slate-100">{ticket.title}</h4>
                          <p className="text-[10px] text-slate-400 bg-slate-950/50 p-3.5 rounded-xl border border-slate-850 max-w-3xl whitespace-pre-line leading-relaxed font-semibold">
                            {ticket.description}
                          </p>

                          {ticket.screenshot && (
                            <div className="flex items-center gap-2 pt-1">
                              <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                              <span className="text-[9px] font-black text-slate-500 uppercase">{isBn ? "স্ক্রিনশট:" : "Attached Screenshot:"}</span>
                              <button
                                onClick={() => setPreviewImage(ticket.screenshot || null)}
                                className="text-[9px] font-black text-indigo-400 hover:underline"
                              >
                                [{isBn ? "ছবি খুলুন" : "Open Image"}]
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-4 text-[9px] text-slate-500 font-mono">
                            <span>User: {ticket.userEmail || 'N/A'}</span>
                            <span>•</span>
                            <span>Submitted: {new Date(ticket.createdAt).toLocaleString('en-GB')}</span>
                          </div>
                        </div>

                        {/* Reply / Status Change Action Board */}
                        <div className="w-full md:w-64 shrink-0 bg-slate-950/60 p-4 border border-slate-850 rounded-2xl space-y-3">
                          <span className="text-[8px] font-black text-slate-400 uppercase block tracking-widest">{isBn ? "অ্যাকশন ও সমাধান প্যানেল" : "Response Board"}</span>
                          
                          {isEditing ? (
                            <div className="space-y-3 animate-fadeIn">
                              <div className="space-y-1">
                                <label className="text-[8px] text-slate-500 font-black uppercase block">{isBn ? "রিপ্লাই মন্তব্য লিখুন" : "Write reply"}</label>
                                <textarea
                                  value={developerReply}
                                  onChange={(e) => setDeveloperReply(e.target.value)}
                                  rows={3}
                                  placeholder={isBn ? "যেমন: আমরা কোড ফিক্স করেছি..." : "e.g., Fix published in release v1.0.4..."}
                                  className="w-full p-2 bg-slate-900 text-[10px] text-slate-100 border border-slate-800 rounded-lg outline-none focus:border-emerald-600 resize-none font-bold"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[8px] text-slate-500 font-black uppercase block">{isBn ? "স্ট্যাটাস পরিবর্তন" : "Change Status"}</label>
                                <select
                                  value={selectedStatus}
                                  onChange={(e) => setSelectedStatus(e.target.value as any)}
                                  className="w-full p-1.5 bg-slate-900 text-[10px] text-slate-200 border border-slate-800 rounded-lg outline-none font-bold"
                                >
                                  <option value="open">{isBn ? "খোলা / ওপেন (Open)" : "Open / Pending"}</option>
                                  <option value="in_progress">{isBn ? "চলমান (In Progress)" : "In Progress"}</option>
                                  <option value="resolved">{isBn ? "সমাধানকৃত (Resolved)" : "Resolved"}</option>
                                  <option value="closed">{isBn ? "বন্ধ করুন (Closed)" : "Closed"}</option>
                                </select>
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDeveloperUpdate(ticket.id)}
                                  className="w-1/2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-wider rounded-lg"
                                >
                                  {isBn ? "সেভ" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingTicketId(null)}
                                  className="w-1/2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-[9px] uppercase tracking-wider rounded-lg"
                                >
                                  {isBn ? "বাতিল" : "Cancel"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {ticket.developerNote && (
                                <div className="p-2 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-[9px] text-slate-300 font-bold leading-normal">
                                  <span className="font-mono text-emerald-400 block text-[8px] uppercase">Reply Note:</span>
                                  {ticket.developerNote}
                                </div>
                              )}
                              
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTicketId(ticket.id);
                                  setDeveloperReply(ticket.developerNote || '');
                                  setSelectedStatus(ticket.status);
                                }}
                                className="w-full py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-200 font-black text-[10px] uppercase rounded-lg border border-slate-750 transition-all flex items-center justify-center gap-1"
                              >
                                <Send className="w-3 h-3" />
                                {isBn ? "রিপ্লাই / আপডেট" : "Reply & Update Status"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              
              {allTickets.length === 0 && (
                <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40 text-slate-500 text-xs font-semibold">
                  {isBn ? "কোনো টিকেট সিস্টেমে জমা হয়নি।" : "No support tickets submitted in the master log yet."}
                </div>
              )}
            </div>
          </motion.div>
        )}

      </div>

      {/* SCREENSHOT PREVIEW LIGHTBOX MODAL */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-4 right-4 z-50 p-2 bg-slate-900/80 hover:bg-slate-800/90 text-white rounded-full transition-all border border-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
              
              <img 
                src={previewImage} 
                alt="Ticket attachment full preview" 
                className="max-w-full max-h-[80vh] object-contain block mx-auto p-2"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
