import React, { useState, useEffect } from 'react';
import { 
  Video, 
  Calendar as CalendarIcon, 
  Clock, 
  Copy, 
  ExternalLink, 
  Plus, 
  Trash, 
  Check, 
  Loader2, 
  Share2, 
  FileSpreadsheet, 
  ShieldAlert,
  Search,
  RefreshCw,
  VideoOff,
  User,
  Mail,
  Sparkles,
  Tag,
  Sliders,
  CheckCircle2,
  X
} from 'lucide-react';
import { 
  db, 
  auth, 
  googleProvider, 
  getCachedAccessToken, 
  setCachedAccessToken,
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy 
} from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface MeetSession {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  spaceName: string;
  createdAt: string;
  shopId: string;
  exportedToSheet?: boolean;
  shopName?: string;
  shopCode?: string;
  merchantEmail?: string;
  meetingType?: string;
  merchantNotes?: string;
  createdByAdmin?: boolean;
  hostEmail?: string;
  recipientEmail?: string;
}

interface MeetSchedulerProps {
  shopId: string;
  user: any;
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' }) => void;
}

export const MeetScheduler: React.FC<MeetSchedulerProps> = ({ shopId, user, setNotification }) => {
  const [token, setToken] = useState<string | null>(getCachedAccessToken());
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [sessions, setSessions] = useState<MeetSession[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Custom Role Detection
  const adminEmail = 'stratproamz@gmail.com';
  const isAdmin = user?.email?.toLowerCase().trim() === adminEmail || user?.role === 'master_admin' || user?.shopId === 'master';

  // Form fields
  const [meetingTitle, setMeetingTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState('30'); // in minutes
  const [meetingType, setMeetingType] = useState('Video Onboarding');
  const [merchantNotes, setMerchantNotes] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [backupNotes, setBackupNotes] = useState('');

  const handleAiOptimize = async (mode: 'optimize' | 'email-en' | 'email-bn') => {
    setIsAiLoading(true);
    setBackupNotes(merchantNotes);
    try {
      let promptText = '';
      let systemInstruction = '';
      
      const referenceNotes = merchantNotes.trim() || `No draft was provided. Just compose a clean initial professional agenda and detailed list based on meeting title: "${meetingTitle || 'Business Review Sync'}" and meeting type: "${meetingType}".`;

      if (mode === 'optimize') {
        promptText = `Please optimize, correct grammatical structure, and polish the following text to sound extremely professional, polite, and executive-level. Retain the general language (Bangla or English) of the original draft.
        
Original Draft:
"${referenceNotes}"`;
        systemInstruction = "You are an executive assistant and master polisher for merchants and administrators. Your goal is to rewrite the input to sound polite, professional, concise, and structured. Return ONLY the polished text. Do not include any preachy introductions, greetings, meta-commentary, or markdown blocks.";
      } else if (mode === 'email-en') {
        promptText = `Write a professional invitation/follow-up email in English regarding this meeting.
Meeting Title: "${meetingTitle || 'Business Evaluation'}"
Meeting Type: "${meetingType}"
Meeting Duration: ${duration} minutes
Additional Notes/Points: "${referenceNotes}"`;
        systemInstruction = "You are a professional corporate communicator. Write a formal invitation and agenda email in professional English. Ensure standard greetings, structured bullet-point details of what will be discussed, duration, and highly polite closing. Return ONLY the email body itself. Do not include subject headers or notes pre/post response.";
      } else if (mode === 'email-bn') {
        promptText = `Write a professional invitation/follow-up email in pure formal Bangla regarding this meeting.
Meeting Title: "${meetingTitle || 'ব্যবসায়িক আলোচনা'}"
Meeting Type: "${meetingType}"
Meeting Duration: ${duration} minutes
Additional Notes/Points: "${referenceNotes}"`;
        systemInstruction = "You are a professional communicator in Bangladesh who speaks highly respectful and formal Bangla (সাধু নয়, প্রমিত চলিত বাংলা). Write an invitation and agenda email in professional formal Bangla. Ensure standard warm greeting, structured bullet-point details, duration, and extremely polite closing. Return ONLY the email body. Do not include subject lines or intro explanation.";
      }

      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          systemInstruction: systemInstruction
        })
      });

      if (!response.ok) {
        throw new Error('Could not optimize notes via Gemini Server API.');
      }

      const data = await response.json();
      if (data.text) {
        setMerchantNotes(data.text.trim());
        setNotification({ message: 'AI-চালিত প্রফেশনাল ড্রাফটিং সফল হয়েছে!', type: 'success' });
      } else {
        throw new Error('AI returned an empty response.');
      }
    } catch (err: any) {
      console.error('Gemini Optimization Error:', err);
      setNotification({ message: `AI Error: ${err.message || 'API request failed'}`, type: 'error' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleUndoAI = () => {
    if (backupNotes !== undefined) {
      setMerchantNotes(backupNotes);
      setBackupNotes('');
      setNotification({ message: 'আগের লেখাটি সফলভাবে ফিরিয়ে আনা হয়েছে (Undo successful).', type: 'info' });
    }
  };

  // Merchant search & selection (Admin only)
  const [allShops, setAllShops] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState<any | null>(null);
  const [merchantSearch, setMerchantSearch] = useState('');

  // Export state
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Sync token from memory cache
  useEffect(() => {
    setToken(getCachedAccessToken());
  }, []);

  // Fetch all registered merchant shops from DB to enable search
  useEffect(() => {
    if (isAdmin) {
      const fetchShops = async () => {
        try {
          const snap = await getDocs(collection(db, 'shops'));
          const list = snap.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          }));
          setAllShops(list);
        } catch (err) {
          console.error('Error loading matching global shops list:', err);
        }
      };
      fetchShops();
    }
  }, [isAdmin]);

  // Fetch saved sessions from Firestore (dynamic scope matching)
  const fetchSessions = async () => {
    setIsFetching(true);
    try {
      let q;
      if (isAdmin) {
        // Master admin can read and inspect all meet logs in the system
        q = query(
          collection(db, 'meet_sessions'),
          orderBy('createdAt', 'desc')
        );
      } else {
        // Merchants can strictly only fetch scheduling items involving their shopId
        q = query(
          collection(db, 'meet_sessions'),
          where('shopId', '==', shopId),
          orderBy('createdAt', 'desc')
        );
      }
      const snap = await getDocs(q);
      const fetched: MeetSession[] = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as any)
      })) as MeetSession[];
      setSessions(fetched);
    } catch (err) {
      console.warn('Query indexing exception, executing robust in-memory sort fallback:', err);
      try {
        let fallbackQuery;
        if (isAdmin) {
          fallbackQuery = query(collection(db, 'meet_sessions'));
        } else {
          fallbackQuery = query(collection(db, 'meet_sessions'), where('shopId', '==', shopId));
        }
        const snap = await getDocs(fallbackQuery);
        const fetched: MeetSession[] = snap.docs.map(docSnap => ({
          id: docSnap.id,
          ...(docSnap.data() as any)
        })) as MeetSession[];
        // Sort in memory to bypass temporary firestore index limitations indexless
        fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSessions(fetched);
      } catch (innerErr) {
        console.error('Robust fallback load failed:', innerErr);
      }
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [shopId]);

  // Request/Refresh Access Token using Google Sign In with scopes
  const handleAuthorize = async () => {
    setIsAuthorizing(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedAccessToken(credential.accessToken);
        setToken(credential.accessToken);
        setNotification({ message: 'Google Auth connected successfully!', type: 'success' });
        fetchSessions();
      } else {
        throw new Error('Access Token could not be retrieved.');
      }
    } catch (err: any) {
      const isPopupClosed = 
        err?.code === 'auth/popup-closed-by-user' || 
        err?.code === 'auth/cancelled-popup-request' ||
        (err?.message && (err.message.includes('popup-closed-by-user') || err.message.includes('cancelled-popup-request'))) ||
        String(err).includes('popup-closed-by-user') ||
        String(err).includes('cancelled-popup-request');

      if (isPopupClosed) {
        console.warn('Authorization cancelled: the popup was closed before completing OAuth sign-in.');
        setNotification({ message: 'Google Auth popup was closed. Please complete the login in the pop-up window.', type: 'info' });
      } else {
        console.error('Authorization failed:', err);
        setNotification({ message: `Google Authorization Failed: ${err.message ?? err}`, type: 'error' });
      }
    } finally {
      setIsAuthorizing(false);
    }
  };

  // Dispatch Invitation Email through the authenticated Google Gmail Client API
  const sendMeetInvitationEmail = async (toEmail: string, meetTitle: string, dateStr: string, timeStr: string, link: string) => {
    if (!token) {
      console.warn("Could not email invite because Google OAuth has not been done yet");
      return false;
    }
    try {
      const subject = `New Scheduled ShopMaster Meeting: ${meetTitle}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 25px; border: 1px solid #e1e8ed; border-radius: 16px; max-width: 600px; background-color: #ffffff; color: #1e293b; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #4f46e5; margin: 0; font-size: 22px; tracking-tight: -0.5px;">ShopMaster Meeting Scheduled</h2>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            Hello, a secure and private video meeting space has been officially registered down in your ShopMaster system and is synchronized on Google. Here are the meeting coordinates:
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #64748b; width: 130px;">Event Title:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${meetTitle}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Scheduled Date:</td>
                <td style="padding: 6px 0; color: #334155;">${dateStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Scheduled Time:</td>
                <td style="padding: 6px 0; color: #334155;">${timeStr} (UTC/Local)</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Meeting Room Video:</td>
                <td style="padding: 6px 0;">
                  <a href="${link}" style="color: #4f46e5; font-weight: bold; text-decoration: underline;" target="_blank">${link}</a>
                </td>
              </tr>
            </table>
          </div>
          <p style="font-size: 13px; line-height: 1.5; color: #64748b;">
            Please click on the link above inside any desktop browser, computer, or telephone app to join our synchronization session.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 11px; text-align: center; color: #94a3b8; margin: 0;">
            This email represents secure automated synchronization notifications. Reply directly to stratproamz@gmail.com for support.
          </p>
        </div>
      `;

      const rfcMessage = [
        `To: ${toEmail.trim()}`,
        `Subject: ${subject.trim()}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        emailHtml
      ].join('\r\n');

      const base64 = btoa(unescape(encodeURIComponent(rfcMessage)));
      const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: base64url })
      });

      return res.ok;
    } catch (err) {
      console.error("Failed sending meeting email invitation MIME:", err);
      return false;
    }
  };

  // Create Google Meet Space
  const handleCreateMeetingSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setNotification({ message: 'Please authorize Google workspace first.', type: 'error' });
      return;
    }
    if (!meetingTitle.trim()) {
      setNotification({ message: 'Please enter a meeting title.', type: 'error' });
      return;
    }
    if (!startDate || !startTime) {
      setNotification({ message: 'Please select start date and time.', type: 'error' });
      return;
    }

    // Validation constraint for Admin
    if (isAdmin && !selectedShop) {
      setNotification({ message: 'Please search and select a merchant to schedule a meeting.', type: 'error' });
      return;
    }

    setIsCreating(true);
    try {
      // 1. Call Google Meet API to create beautiful Space
      const response = await fetch('https://meet.googleapis.com/v2/spaces', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: {
            accessType: 'OPEN' // OPEN type or TRUSTED
          }
        })
      });

      if (!response.ok) {
        const errDetail = await response.json().catch(() => ({}));
        throw new Error(errDetail?.error?.message || 'Failed to call Google Meet API. Try re-authorizing Gmail / Workspace.');
      }

      const meetData = await response.json();
      
      const meetLink = meetData.meetingUri || `https://meet.google.com/${meetData.meetingCode}`;
      const spaceName = meetData.name || ''; // spaces/space_id

      // Calculate start and end ISO strings
      const startDateTimeStr = `${startDate}T${startTime}`;
      const startDateObj = new Date(startDateTimeStr);
      const endDateObj = new Date(startDateObj.getTime() + parseInt(duration) * 60000);

      // Define recipients
      const targetShopId = isAdmin ? selectedShop.id : (user?.shopId || shopId);
      const targetShopCode = isAdmin ? (selectedShop.shopCode || '') : (user?.shopCode || '');
      const targetShopName = isAdmin ? (selectedShop.name || '') : (user?.name || user?.displayName || 'Merchant');
      const targetMerchantEmail = isAdmin ? (selectedShop.ownerEmail || '') : (user?.email || '');

      const newSessionInput = {
        title: meetingTitle,
        startTime: startDateObj.toISOString(),
        endTime: endDateObj.toISOString(),
        meetLink,
        spaceName,
        createdAt: new Date().toISOString(),
        shopId: targetShopId,
        exportedToSheet: false,

        // Custom properties added for multi-user/role tracking
        shopName: targetShopName,
        shopCode: targetShopCode,
        merchantEmail: targetMerchantEmail,
        meetingType: meetingType,
        merchantNotes: merchantNotes,
        createdByAdmin: isAdmin,
        hostEmail: isAdmin ? adminEmail : (user?.email || ''),
        recipientEmail: isAdmin ? targetMerchantEmail : adminEmail
      };

      // 2. Save securely to Firestore permanent database
      const docRef = await addDoc(collection(db, 'meet_sessions'), newSessionInput);
      
      // Update local state
      setSessions(prev => [{ id: docRef.id, ...newSessionInput }, ...prev]);
      
      // Reset form fields
      setMeetingTitle('');
      setStartDate('');
      setStartTime('');
      setMerchantNotes('');
      // Keep selectedShop selected or let user schedule more
      
      // Send dynamic email notification via Gmail API
      const mailRecipient = isAdmin ? targetMerchantEmail : adminEmail;
      let invitationSent = false;
      
      if (mailRecipient) {
        invitationSent = await sendMeetInvitationEmail(
          mailRecipient,
          `${meetingTitle} (${meetingType})`,
          startDate,
          startTime,
          meetLink
        );
      }

      if (invitationSent) {
        setNotification({ 
          message: `Scheduled Google Meet successfully! Invitation email has been sent to ${mailRecipient}`, 
          type: 'success' 
        });
      } else {
        setNotification({ 
          message: `Scheduled Google Meet successfully! (Email not dispatched: please ensure Gmail scopes are authorized).`, 
          type: 'success' 
        });
      }
    } catch (err: any) {
      console.error('Error creating meeting space:', err);
      // Check if unauthorized, let user re-auth
      if (err.message?.includes('401') || err.message?.toLowerCase().includes('unauthorized') || err.message?.toLowerCase().includes('auth')) {
        setNotification({ message: 'Session expired. Please reconnect your Google Account and try again.', type: 'error' });
        setToken(null);
        setCachedAccessToken(null);
      } else {
        setNotification({ message: `Google Meet error: ${err.message}`, type: 'error' });
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Delete Meeting Space from list (and Database) with confirmation
  const handleDeleteSession = async (currSession: MeetSession) => {
    const isConfirmed = window.confirm(`Are you sure you want to delete "${currSession.title}" meeting? This cannot be undone.`);
    if (!isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'meet_sessions', currSession.id));
      setSessions(prev => prev.filter(s => s.id !== currSession.id));
      setNotification({ message: 'Meeting session deleted successfully.', type: 'success' });
    } catch (err: any) {
      console.error('Error deleting session:', err);
      setNotification({ message: `Failed to delete session: ${err.message}`, type: 'error' });
    }
  };

  // Copy meeting link to clipboard
  const handleCopyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    setNotification({ message: 'Meeting link copied to clipboard!', type: 'success' });
  };

  // Export the meeting session to Google Sheets
  const handleExportToSheet = async (session: MeetSession) => {
    if (!token) {
      setNotification({ message: 'Please reconnect Google Auth first.', type: 'error' });
      return;
    }
    setExportingId(session.id);
    try {
      // 1. Create a new Spreadsheet or append to it. 
      // We can search for an existing "ShopMaster_Meet_Log" spreadsheet, or create a brand new one
      const title = `ShopMaster Meetings Log`;
      
      // Attempt to create a spreadsheet
      const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: title
          }
        })
      });

      if (!createResponse.ok) {
        throw new Error('Could not initialize Google Spreadsheet.');
      }

      const sheetData = await createResponse.json();
      const spreadsheetId = sheetData.spreadsheetId;
      const sheetUrl = sheetData.spreadsheetUrl;

      // 2. Add header row and session data row to the spreadsheet
      const appendResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:E2:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [
            ['Meeting Title', 'Start Date & Time', 'End Location / Time', 'Google Meet Url', 'Log Status'],
            [session.title, new Date(session.startTime).toLocaleString(), new Date(session.endTime).toLocaleString(), session.meetLink, 'Verified Permanent Logs']
          ]
        })
      });

      if (!appendResponse.ok) {
        throw new Error('Failed to append data logs to Spreadsheet.');
      }

      setNotification({ message: `Logs successfully saved to your Google Sheets: ${title}`, type: 'success' });
      
      // Update UI state
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, exportedToSheet: true } : s));
    } catch (err: any) {
      console.error('Sheets integration error:', err);
      setNotification({ message: `Sheets Sync Failed: ${err.message}`, type: 'error' });
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div id="meet-scheduler-container" className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 bg-slate-50 min-h-screen">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 border border-slate-800 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden shadow-xl text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent pointer-events-none"></div>
        
        <div className="space-y-3 text-center md:text-left relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <span className="p-3 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-2xl shadow-lg">
              <Video className="w-7 h-7 animate-pulse" />
            </span>
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">গুগল মিট সিডিউলার (Google Meet Scheduler)</h2>
              <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-widest mt-0.5 font-mono flex items-center justify-center md:justify-start gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                ShopMaster Synchronous Meet Ecosystem
              </div>
            </div>
          </div>
          <p className="text-slate-300 text-xs md:text-sm max-w-xl leading-relaxed">
            মার্চেন্টদের জন্য গুগল মিট সরাসরি তৈরি ও শিডিউল করার চমৎকার প্ল্যাটফর্ম। সিস্টেমে থাকা যেকোনো মার্চেন্টকে তাদের ইউনিক কোড, নাম বা ইমেইল দিয়ে খুঁজে সরাসরি শিডিউল করুন।
          </p>
          

        </div>

        {/* Auth Status & Connection Action */}
        <div className="flex flex-col items-center md:items-end gap-3 shrink-0 relative z-10">
          {token ? (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-2.5 rounded-2xl text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              গুগল কানেক্টেড (Google Sync Enabled)
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-4 py-2.5 rounded-2xl text-xs font-bold">
              <ShieldAlert className="w-4 h-4 text-amber-400 animate-pulse" />
              অথরাইজেশন কানেকশন নেই (Auth Pending)
            </div>
          )}

          <button
            onClick={handleAuthorize}
            disabled={isAuthorizing}
            className={`w-full md:w-auto h-11 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${
              token 
                ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
            }`}
          >
            {isAuthorizing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : token ? (
              <>
                <RefreshCw className="w-4 h-4 text-indigo-300" />
                কানেকশন রিফ্রেশ করুন (Refresh Session)
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                লগইন এবং কানেক্ট (Authorize Google)
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Create Meeting Frame */}
        <div className="col-span-1 lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-800">নতুন মিটিং শিডিউল করুন (Schedule Meet)</h3>
            <p className="text-slate-400 text-xs mt-1">ক্যালেন্ডার ও ভিডিও রুম মেটাডাটা সরাসরি এখানে তৈরি করুন</p>
          </div>

          <form onSubmit={handleCreateMeetingSpace} className="space-y-5">
            
            {/* Merchant Identification Slot */}
            {isAdmin ? (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-600 tracking-wide uppercase block">
                  মার্চেন্ট খুঁজুন (Search Merchant Shop)
                </label>
                
                {selectedShop ? (
                  <div className="bg-gradient-to-r from-indigo-50 to-indigo-50/50 border-2 border-indigo-100 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-600 text-white rounded-xl">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{selectedShop.name || 'Unnamed Merchant'}</div>
                        <div className="text-[11px] text-indigo-700 font-mono font-bold flex items-center gap-1.5 mt-0.5">
                          <Tag className="w-3 h-3" /> Code: {selectedShop.shopCode || 'No Code'}
                          <span className="text-slate-300">|</span>
                          <Mail className="w-3 h-3" /> {selectedShop.ownerEmail || 'No Email'}
                        </div>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setSelectedShop(null);
                        setMerchantSearch('');
                      }}
                      className="p-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </div>
                    <input 
                      type="text"
                      value={merchantSearch}
                      onChange={(e) => setMerchantSearch(e.target.value)}
                      placeholder="মার্চেন্টের নাম, ইউনিক কোড বা জিমেইল টাইপ করুন..."
                      className="w-full h-11 pl-10 pr-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-600 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400 text-xs sm:text-sm font-medium"
                    />
                    
                    {/* Autocomplete drawer */}
                    {merchantSearch.trim() !== '' && (
                      <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-50">
                        {allShops.filter(s => {
                          const query = merchantSearch.toLowerCase().trim();
                          const code = (s.shopCode || '').toString().toLowerCase();
                          const name = (s.name || '').toLowerCase();
                          const email = (s.ownerEmail || '').toLowerCase();
                          return code.includes(query) || name.includes(query) || email.includes(query);
                        }).length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 font-medium">
                            কোন মার্চেন্ট পাওয়া যায়নি
                          </div>
                        ) : (
                          allShops.filter(s => {
                            const query = merchantSearch.toLowerCase().trim();
                            const code = (s.shopCode || '').toString().toLowerCase();
                            const name = (s.name || '').toLowerCase();
                            const email = (s.ownerEmail || '').toLowerCase();
                            return code.includes(query) || name.includes(query) || email.includes(query);
                          }).map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setSelectedShop(s);
                                setMerchantSearch('');
                              }}
                              className="w-full p-3.5 text-left hover:bg-indigo-50/50 flex flex-col gap-1 transition-all"
                            >
                              <div className="font-bold text-slate-800 text-xs sm:text-sm">{s.name || 'Unnamed Merchant'}</div>
                              <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono font-bold mt-0.5">
                                <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[9px]">Code: {s.shopCode || 'N/A'}</span>
                                <span>{s.ownerEmail || '(No Email Address)'}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-slate-700 text-xs sm:text-sm space-y-2">
                <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  প্রধান এডমিনের সাথে ব্যক্তিগত মিটিং সংযোগ
                </div>
                <p className="text-slate-500 font-medium leading-relaxed">
                  মার্চেন্ট নীতি অনুযায়ী শুধুমাত্র প্রধান এডমিনের (<strong>stratproamz@gmail.com</strong>) সাথে ওয়ান-টু-ওয়ান সংযোগ করতে পারবেন। অন্য মার্চেন্টের সাথে যোগাযোগ নিষিদ্ধ।
                </p>
              </div>
            )}

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-600 block">মিটিংয়ের নাম বা বিষয়বস্তু (Meeting Title)</label>
              <input 
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="যেমন: সাপ্তাহিক ব্যবসায়িক পর্যালোচনা, পণ্য ডেমো..."
                className="w-full h-11 px-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-600 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400 text-sm font-medium"
              />
            </div>

            {/* Meeting Type Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-600 block">মিটিংয়ের ধরন (Meeting Type)</label>
              <select
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value)}
                className="w-full h-11 px-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-600 focus:outline-none focus:bg-white transition-all text-sm font-semibold text-slate-700"
              >
                <option value="Video Onboarding">ভিডিও অনবোর্ডিং (Video Onboarding Sync)</option>
                <option value="Store Optimization">স্টোর অপ্টিমাইজেশন রিভিউ (Store Optimization review)</option>
                <option value="Technical Dispute Call">টেকনিক্যাল সাপোর্ট (Technical Help Dispute)</option>
                <option value="Monthly Strategy Alignment">মাসিক ব্যবসায়িক কৌশল (Monthly Strategy Align)</option>
              </select>
            </div>

            {/* Date and Time selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-600 block">তারিখ (Date)</label>
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-11 px-4 py-2 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-600 focus:bg-white focus:outline-none transition-all text-sm font-medium text-slate-700"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-600 block">সময় (Time)</label>
                <input 
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full h-11 px-4 py-2 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-600 focus:bg-white focus:outline-none transition-all text-sm font-medium text-slate-700"
                />
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-600 block">মিটিং এর সময়সীমা (Duration)</label>
              <select 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)}
                className="w-full h-11 px-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-600 focus:outline-none focus:bg-white transition-all text-sm font-semibold text-slate-700"
              >
                <option value="15">১৫ মিনিট (15 minutes)</option>
                <option value="30">৩০ মিনিট (30 minutes)</option>
                <option value="45">৪৫ মিনিট (45 minutes)</option>
                <option value="60">১ ঘণ্টা (60 minutes)</option>
                <option value="90">১ ঘণ্টা ৩০ মিনিট (90 minutes)</option>
                <option value="120">২ ঘণ্টা (120 minutes)</option>
              </select>
            </div>

            {/* Merchant Notes */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-slate-600 block">মিটিংয়ের বিবরণ / নোট (Notes & Agenda)</label>
                {backupNotes && (
                  <button
                    type="button"
                    onClick={handleUndoAI}
                    className="text-[10px] text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    ↩️ আগেরটি ফিরে যান (Undo)
                  </button>
                )}
              </div>
              <textarea 
                value={merchantNotes}
                onChange={(e) => setMerchantNotes(e.target.value)}
                placeholder="মিটিংয়ের এজেন্ডা বা মূল উদ্দেশ্য সংক্ষেপে লিখুন..."
                className="w-full h-24 px-4 py-2 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-indigo-600 focus:outline-none focus:bg-white transition-all text-sm font-medium placeholder:text-slate-400 resize-none"
              />
              
              {/* Premium AI Assist Toolbar */}
              <div className="bg-indigo-50/40 border border-indigo-105/50 p-3.5 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-700">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-600" />
                    Bismillah AI সহকারী (Professional Drafts Engine)
                  </div>
                  {isAiLoading && (
                    <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-extrabold animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> জেনারেট হচ্ছে...
                    </span>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={isAiLoading}
                    onClick={() => handleAiOptimize('optimize')}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 hover:text-white disabled:opacity-50 text-white text-[11px] font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    ✨ অপ্টিমাইজ করুন (Optimize)
                  </button>
                  <button
                    type="button"
                    disabled={isAiLoading}
                    onClick={() => handleAiOptimize('email-en')}
                    className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 text-[11px] font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    🇬🇧 ড্রাফট ইমেইল (English Email)
                  </button>
                  <button
                    type="button"
                    disabled={isAiLoading}
                    onClick={() => handleAiOptimize('email-bn')}
                    className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 text-[11px] font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    🇧🇩 ড্রাফট ইমেইল (Bangla Email)
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">
                  {`* নোটে কিছু পয়েন্ট লিখে যেকোনো ওপরে ক্লিক দিন। যদি নোট খালি থাকে, তবে ওপরে থাকা 'মিটিংয়ের বিষয়' (${meetingTitle || 'untitled'}) ও 'ধরন' (${meetingType}) অনুযায়ী স্বয়ংক্রিয় প্রফেশনাল ইমেইল লেখা হবে।`}
                </p>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isCreating || !token}
              className={`w-full h-12 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98 ${
                token 
                  ? 'bg-indigo-600 hover:bg-slate-900 text-white shadow-indigo-100 hover:shadow-slate-200' 
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  নতুন গুগল মিট তৈরি হচ্ছে...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  নতুন মিট শিডিউল নিশ্চিত করুন
                </>
              )}
            </button>
            {!token && (
              <p className="text-xs text-amber-600 text-center font-bold">
                * অনুগ্রহ করে প্রথমে গুগল একাউন্টটি অথরাইজ করুন।
              </p>
            )}
          </form>
        </div>

        {/* Right Side: Saved Scheduled Meetings Grid */}
        <div className="col-span-1 lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-800">শিডিউলকৃত মিটিং রুমসমূহ (Scheduled Sessions)</h3>
              <p className="text-slate-400 text-xs mt-1">ক্যালেন্ডার ও প্রুভড জেনারেটেড গুগল মিটস ডাটা তালিকা</p>
            </div>
            {sessions.length > 0 && (
              <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold px-3 py-1.5 rounded-xl text-xs font-mono">
                {sessions.length} Scheduled
              </span>
            )}
          </div>

          <div className="grow overflow-y-auto max-h-[6400px] space-y-4 pr-1 scrollbar-thin">
            {isFetching ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span className="text-sm font-bold text-slate-500">মিটিং ডাটা লোড হচ্ছে...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="h-48 border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center text-slate-400 gap-3">
                <VideoOff className="w-11 h-11 text-slate-300" />
                <div className="text-center">
                  <p className="text-sm font-black text-slate-600">কোন শিডিউল পাওয়া যায়নি</p>
                  <p className="text-xs text-slate-400 mt-1">এডমিন বা মার্চেন্ট মিটিং শিডিউল করলে তালিকা এখানে দৃশ্যমান হবে</p>
                </div>
              </div>
            ) : (
              sessions.map((session) => (
                <div 
                  key={session.id} 
                  className="p-5 border border-slate-100 hover:border-indigo-100 rounded-2xl bg-white hover:shadow-md transition-all flex flex-col gap-4 group"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-2.5">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-indigo-50 border border-indigo-100/60 text-indigo-700 font-bold px-2 py-0.5 rounded-lg text-[10px] font-mono">
                          {session.meetingType || 'Video Sync'}
                        </span>
                        
                        {session.shopCode && (
                          <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-lg text-[10px] font-mono">
                            Code: {session.shopCode}
                          </span>
                        )}
                      </div>
                      
                      <h4 className="font-extrabold text-slate-800 text-sm sm:text-base group-hover:text-indigo-600 transition-colors">
                        {session.title}
                      </h4>
                      
                      {/* Connection participants detail */}
                      <div className="text-[11px] font-medium text-slate-500 space-y-0.5 font-sans">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-700">Host (মিটিং হোস্ট):</span> 
                          <span>{session.createdByAdmin ? 'System Administrator' : (session.shopName || 'Merchant')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-700">Participant (অংশগ্রহণকারী):</span> 
                          <span>{session.createdByAdmin ? `${session.shopName || 'Merchant'} (${session.merchantEmail || 'No Email'})` : 'stratproamz@gmail.com (Admin)'}</span>
                        </div>
                      </div>

                      <p className="text-xs text-indigo-600 font-mono font-bold flex items-center gap-1 mt-1 break-all bg-indigo-50/30 px-2 py-1 rounded-lg">
                        <Video className="w-3.5 h-3.5 shrink-0" />
                        {session.meetLink}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-mono font-bold shrink-0 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="w-3.5 h-3.5 text-indigo-500" />
                        {new Date(session.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                      <span className="text-slate-300">|</span>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        {new Date(session.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  {/* Merchant Notes preview if available */}
                  {session.merchantNotes && (
                    <div className="bg-slate-50 border-l-4 border-slate-200 p-3 rounded-r-xl text-xs text-slate-600 leading-relaxed italic font-sans">
                      &ldquo;{session.merchantNotes}&rdquo;
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between border-t border-slate-50 pt-3 gap-3">
                    <div className="text-[10px] text-slate-400 font-mono font-bold">
                      Created: {new Date(session.createdAt).toLocaleDateString()}
                    </div>
                    
                    <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                      {/* Copy link button */}
                      <button
                        onClick={() => handleCopyLink(session.meetLink, session.id)}
                        className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 hover:text-slate-900 transition-all flex items-center justify-center shadow-xs cursor-pointer"
                        title="কপি লিংক"
                      >
                        {copiedId === session.id ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      {/* Join meeting space button */}
                      <a
                        href={session.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-xl text-indigo-700 transition-all flex items-center justify-center shadow-xs"
                        title="জয়েন মিটিং"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>

                      {/* Export log entries to sheet on click */}
                      <button
                        onClick={() => handleExportToSheet(session)}
                        disabled={exportingId === session.id}
                        className={`p-2 rounded-xl border transition-all flex items-center justify-center shadow-xs cursor-pointer ${
                          session.exportedToSheet
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                            : 'bg-white border-slate-200 hover:border-emerald-200 text-emerald-600 hover:text-emerald-800'
                        }`}
                        title={session.exportedToSheet ? "গুগল শিটে এক্সপোর্ট সম্পন্ন" : "গুগল শিটে এক্সপোর্ট করুন"}
                      >
                        {exportingId === session.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        ) : session.exportedToSheet ? (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4" />
                        )}
                      </button>

                      {/* Delete scheduled meeting with confirm */}
                      <button
                        onClick={() => handleDeleteSession(session)}
                        className="p-2 bg-red-50 border border-red-100 hover:bg-red-100 rounded-xl text-red-600 hover:text-red-800 transition-all flex items-center justify-center shadow-xs cursor-pointer"
                        title="মিটিং ডিলেট করুন"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Tips notification summary */}
          <div className="bg-indigo-500/5 border border-indigo-100 p-4 rounded-2xl flex items-start gap-3 mt-4">
            <span className="p-2 bg-indigo-50 text-indigo-700 rounded-xl shrink-0">
              <Share2 className="w-4.5 h-4.5" />
            </span>
            <div className="space-y-1 text-xs text-slate-700 leading-relaxed font-sans font-medium">
              <p className="font-black text-slate-800">মিটিং লিংক শেয়ার করার দিকনির্দেশনা (Sharing Instructions)</p>
              <p className="text-slate-500">
                মিটিং জেনারেট হওয়ার পরে কপি বাটনে চাপ দিলে সহজে লিংকটি মেমরিতে কপি হয়ে যাবে। এরপর আপনি যেকোনো নিরাপদ মেসেঞ্জার, এসএমএস, হোয়াটসএপ, ভাইবার বা ইমেইল পাঠিয়ে সরাসরি পার্টনারদের আমন্ত্রণ জানাতে পারবেন।
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
