import React, { useState, useEffect } from 'react';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { 
  auth, 
  googleProvider, 
  setCachedAccessToken, 
  getCachedAccessToken 
} from '../firebase';
import { 
  Mail, 
  Send, 
  Inbox, 
  Trash2, 
  Star, 
  RefreshCw, 
  Search, 
  Plus, 
  ArrowLeft, 
  Reply, 
  CornerUpRight, 
  Check, 
  Loader2, 
  AlertCircle, 
  Clock, 
  User, 
  Sparkles,
  Link,
  ChevronRight,
  Archive,
  Eye,
  CheckCheck,
  MailOpen,
  Calendar,
  FileText,
  AlertOctagon,
  ShoppingBag,
  Users,
  Bell,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
export interface EmailHeader {
  name: string;
  value: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  isStarred: boolean;
  isUnread: boolean;
  labels: string[];
  attachments: EmailAttachment[];
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
}

// --- Gmail API Service Utility ---
export const gmailService = {
  // Helper to decode Base64Url to standard string
  decodeBase64(base64UrlStr: string): string {
    if (!base64UrlStr) return '';
    let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    try {
      return decodeURIComponent(escape(atob(base64)));
    } catch {
      try {
        return atob(base64);
      } catch {
        return '';
      }
    }
  },

  // Recursively extract attachments from parts structure
  parseAttachments(part: any, list: EmailAttachment[] = []): EmailAttachment[] {
    if (part.filename && part.body?.attachmentId) {
      list.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size || 0
      });
    }
    if (part.parts) {
      for (const subPart of part.parts) {
        this.parseAttachments(subPart, list);
      }
    }
    return list;
  },

  // Extract text and html message parts recursively
  parseBodyParts(part: any): { html: string; text: string } {
    let html = '';
    let text = '';

    if (part.mimeType === 'text/plain' && part.body?.data) {
      text = this.decodeBase64(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html = this.decodeBase64(part.body.data);
    }

    if (part.parts) {
      for (const subPart of part.parts) {
        const parsed = this.parseBodyParts(subPart);
        if (parsed.html) html += parsed.html;
        if (parsed.text) text += parsed.text;
      }
    }

    return { html, text };
  },

  // Helper to extract a header value
  getHeaderValue(headers: EmailHeader[], headerName: string): string {
    const h = headers?.find(item => item.name.toLowerCase() === headerName.toLowerCase());
    return h ? h.value : '';
  },

  // Fetch Logged-in Gmail user profile info
  async fetchProfile(token: string): Promise<GmailProfile | null> {
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (e) {
      console.error('Error fetching Gmail profile:', e);
      return null;
    }
  },

  // Fetch dynamic list of emails with details
  async fetchEmails(token: string, folder: string, queryParam?: string): Promise<EmailMessage[]> {
    let q = '';
    if (folder === 'INBOX') q = 'label:INBOX';
    else if (folder === 'SENT') q = 'label:SENT';
    else if (folder === 'STARRED') q = 'label:STARRED';
    else if (folder === 'SNOOZED') q = 'label:SNOOZED';
    else if (folder === 'IMPORTANT') q = 'label:IMPORTANT';
    else if (folder === 'SCHEDULED') q = 'label:SCHEDULED';
    else if (folder === 'DRAFT') q = 'label:DRAFT';
    else if (folder === 'SPAM') q = 'label:SPAM';
    else if (folder === 'TRASH') q = 'label:TRASH';
    else if (folder === 'CATEGORY_PURCHASES') q = 'category:purchases';
    else if (folder === 'CATEGORY_SOCIAL') q = 'category:social';
    else if (folder === 'CATEGORY_UPDATES') q = 'category:updates';
    else if (folder === 'CATEGORY_PROMOTIONS') q = 'category:promotions';
    else if (folder === 'ALL') q = ''; // Fetch all mail without specific label filter

    if (queryParam?.trim()) {
      q = q ? `${q} ${queryParam.trim()}` : queryParam.trim();
    }

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) {
      throw new Error('TOKEN_EXPIRED');
    }

    if (!res.ok) {
      throw new Error('FAILED_TO_LOAD_EMAILS');
    }

    const data = await res.json();
    const rawMessages = data.messages || [];

    if (rawMessages.length === 0) {
      return [];
    }

    // Load full details for each message
    const results = await Promise.all(
      rawMessages.map(async (msg: { id: string }) => {
        try {
          const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!detailRes.ok) return null;
          const fullMsg = await detailRes.json();
          
          const headers = fullMsg.payload?.headers || [];
          const subject = this.getHeaderValue(headers, 'subject') || '(No Subject)';
          const from = this.getHeaderValue(headers, 'from') || 'Unknown Sender';
          const to = this.getHeaderValue(headers, 'to') || '';
          const date = this.getHeaderValue(headers, 'date') || '';
          
          let bodyText = '';
          let bodyHtml = '';
          if (fullMsg.payload) {
            const parsed = this.parseBodyParts(fullMsg.payload);
            bodyText = parsed.text;
            bodyHtml = parsed.html;
            if (!bodyText && !bodyHtml && fullMsg.payload.body?.data) {
              const decoded = this.decodeBase64(fullMsg.payload.body.data);
              if (fullMsg.payload.mimeType === 'text/html') {
                bodyHtml = decoded;
              } else {
                bodyText = decoded;
              }
            }
          }

          const labelIds = fullMsg.labelIds || [];
          const isStarred = labelIds.includes('STARRED');
          const isUnread = labelIds.includes('UNREAD');
          const attachments = fullMsg.payload ? this.parseAttachments(fullMsg.payload) : [];

          return {
            id: fullMsg.id,
            threadId: fullMsg.threadId,
            snippet: fullMsg.snippet || '',
            subject,
            from,
            to,
            date,
            bodyText,
            bodyHtml,
            isStarred,
            isUnread,
            labels: labelIds,
            attachments
          } as EmailMessage;
        } catch {
          return null;
        }
      })
    );

    return results.filter(Boolean) as EmailMessage[];
  },

  // Toggle Favorite Star status 
  async setStarred(token: string, messageId: string, isCurrentlyStarred: boolean): Promise<boolean> {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        addLabelIds: isCurrentlyStarred ? [] : ['STARRED'],
        removeLabelIds: isCurrentlyStarred ? ['STARRED'] : []
      })
    });
    return res.ok;
  },

  // Move a specific message to Gmail Trash
  async trashMessage(token: string, messageId: string): Promise<boolean> {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok;
  },

  // Mark message as Read (removes the UNREAD label)
  async markAsRead(token: string, messageId: string): Promise<boolean> {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD']
      })
    });
    return res.ok;
  },

  // Send raw mime formatted RFC2822 email message
  async sendEmail(token: string, to: string, cc: string, subject: string, body: string): Promise<boolean> {
    const lines = [
      `To: ${to.trim()}`
    ];
    if (cc && cc.trim()) {
      lines.push(`Cc: ${cc.trim()}`);
    }
    lines.push(`Subject: ${subject.trim() || '(No Subject)'}`);
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('MIME-Version: 1.0');
    lines.push('');
    lines.push(body.replace(/\n/g, '<br/>'));

    const rfcMessage = lines.join('\r\n');

    const base64 = btoa(unescape(encodeURIComponent(rfcMessage)));
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: base64url })
    });

    return res.ok;
  }
};

// --- GmailClient React Component Implementation ---
interface GmailClientProps {
  setNotification: (notif: { message: string, type: 'success' | 'error' | 'info' }) => void;
  lang?: string;
  onSuccessAuthorize?: (token: string) => void;
  onDisconnectHandler?: () => void;
}

export function GmailClient({ setNotification, lang = 'bn', onSuccessAuthorize, onDisconnectHandler }: GmailClientProps) {
  const isBn = lang === 'bn';

  // Authentication State
  const [accessToken, setAccessToken] = useState<string | null>(getCachedAccessToken());
  const [profile, setProfile] = useState<GmailProfile | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Email Folders, Listing & Selection State
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<EmailMessage | null>(null);
  const [folder, setFolder] = useState<string>('INBOX');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Email Compose & Response State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Attachment preview and download states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ id: string; filename: string; mimeType: string; contentUrl: string } | null>(null);

  // Load profile metrics and cached secrets
  useEffect(() => {
    const cachedToken = getCachedAccessToken();
    if (cachedToken) {
      setAccessToken(cachedToken);
      loadUserProfile(cachedToken);
    }
  }, []);

  // Fetch emails thread when token/category selector updates
  useEffect(() => {
    if (accessToken) {
      loadGmailMessages();
    }
  }, [accessToken, folder]);

  const loadUserProfile = async (token: string) => {
    const prof = await gmailService.fetchProfile(token);
    if (prof) {
      setProfile(prof);
    }
  };

  const loadGmailMessages = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const fetched = await gmailService.fetchEmails(accessToken, folder, searchQuery);
      setMessages(fetched);
      setLastSynced(new Date());
    } catch (err: any) {
      if (err.message === 'TOKEN_EXPIRED') {
        handleLogOut(false);
        setNotification({
          message: isBn ? 'জিমেইল সেশন শেষ হয়ে গিয়েছে, দয়া করে আবার কানেক্ট করুন।' : 'Gmail session expired. Please connect again.',
          type: 'error'
        });
      } else {
        setNotification({
          message: isBn ? 'জিমেইল লোড করতে সমস্যা হয়েছে।' : 'Unable to synchronize Gmail feed.',
          type: 'error'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthConnect = async () => {
    setIsAuthorizing(true);
    try {
      const authInstance = getAuth();
      const res = await signInWithPopup(authInstance, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(res);
      if (credential?.accessToken) {
        setCachedAccessToken(credential.accessToken);
        setAccessToken(credential.accessToken);
        loadUserProfile(credential.accessToken);
        if (onSuccessAuthorize) onSuccessAuthorize(credential.accessToken);
        
        setNotification({
          message: isBn ? 'বিজনেস জিমেইল সফলভাবে সংযুক্ত হয়েছে!' : 'Gmail client connected successfully!',
          type: 'success'
        });
      } else {
        throw new Error('Access token could not be fetched.');
      }
    } catch (e: any) {
      console.error(e);
      const isPopupClosed = 
        e?.code === 'auth/popup-closed-by-user' || 
        e?.code === 'auth/cancelled-popup-request' ||
        (e?.message && (e.message.includes('popup-closed-by-user') || e.message.includes('cancelled-popup-request'))) ||
        String(e).includes('popup-closed-by-user') ||
        String(e).includes('cancelled-popup-request');

      if (isPopupClosed) {
        setNotification({
          message: isBn ? 'গুগল কানেকশন উইন্ডোটি বন্ধ করা হয়েছে।' : 'Google OAuth window popup was closed by user.',
          type: 'info'
        });
      } else {
        setNotification({
          message: isBn ? 'জিমেইল কানেকশন ব্যর্থ হয়েছে।' : 'OAuth Authorization to Gmail service failed.',
          type: 'error'
        });
      }
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleLogOut = (prompt = true) => {
    if (!prompt || window.confirm(isBn ? 'আপনি কি জিমেইল ডিসকানেক্ট করতে চান?' : 'Are you sure you want to disconnect Gmail?')) {
      setCachedAccessToken(null);
      setAccessToken(null);
      setProfile(null);
      setMessages([]);
      setSelectedMsg(null);
      if (onDisconnectHandler) onDisconnectHandler();
      if (prompt) {
        setNotification({
          message: isBn ? 'জিমেইল সফলভাবে ডিসকানেক্ট করা হয়েছে।' : 'Gmail account has been disconnected.',
          type: 'info'
        });
      }
    }
  };

  const handleStarToggle = async (e: React.MouseEvent, msg: EmailMessage) => {
    e.stopPropagation();
    if (!accessToken) return;

    // Optimistic UI update
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isStarred: !m.isStarred } : m));
    if (selectedMsg?.id === msg.id) {
      setSelectedMsg(prev => prev ? { ...prev, isStarred: !prev.isStarred } : null);
    }

    try {
      const ok = await gmailService.setStarred(accessToken, msg.id, msg.isStarred);
      if (!ok) throw new Error();
    } catch {
      // Revert upon error
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isStarred: msg.isStarred } : m));
      if (selectedMsg?.id === msg.id) {
        setSelectedMsg(prev => prev ? { ...prev, isStarred: msg.isStarred } : null);
      }
      setNotification({
        message: isBn ? 'স্টার আপডেট করতে ব্যর্থ হয়েছে।' : 'Star update failed.',
        type: 'error'
      });
    }
  };

  const handleTrashMail = async (msgId: string) => {
    if (!accessToken) return;
    const isConfirmed = window.confirm(
      isBn ? 'আপনি কি এই ইমেইলটি ট্র্যাশে পাঠাতে চান?' : 'Are you sure you want to move this message to trash?'
    );
    if (!isConfirmed) return;

    try {
      const ok = await gmailService.trashMessage(accessToken, msgId);
      if (!ok) throw new Error();

      setNotification({
        message: isBn ? 'মেসেজটি ট্র্যাশে পাঠানো হয়েছে।' : 'Message successfully trashed.',
        type: 'success'
      });

      setMessages(prev => prev.filter(m => m.id !== msgId));
      if (selectedMsg?.id === msgId) {
        setSelectedMsg(null);
      }
    } catch {
      setNotification({
        message: isBn ? 'ইমেইল ট্র্যাশে পাঠাতে ব্যর্থ হয়েছে।' : 'Failed to move email to trash bin.',
        type: 'error'
      });
    }
  };

  const handleDownloadAttachment = async (msgId: string, att: EmailAttachment) => {
    if (!accessToken) return;
    setDownloadingId(att.id);
    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${att.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Failed to fetch attachment from Gmail');
      const data = await res.json();
      if (!data.data) throw new Error('Attachment content empty');

      // Convert base64url to base64
      let base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }

      // Convert to binary array/blob
      const rawData = atob(base64);
      const rawLength = rawData.length;
      const array = new Uint8Array(new ArrayBuffer(rawLength));
      for (let i = 0; i < rawLength; i++) {
        array[i] = rawData.charCodeAt(i);
      }

      const blob = new Blob([array], { type: att.mimeType || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = att.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setNotification({
        message: isBn ? `"${att.filename}" সফলভাবে ডাউনলোড হয়েছে!` : `"${att.filename}" downloaded successfully!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setNotification({
        message: isBn ? 'ফাইলটি ডাউনলোড করতে সম্যসা হয়েছে।' : 'Failed to download the selected attachment.',
        type: 'error'
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePreviewAttachment = async (msgId: string, att: EmailAttachment) => {
    if (!accessToken) return;
    setDownloadingId(att.id);
    try {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${att.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Unsuccessful attachment load');
      const data = await res.json();
      if (!data.data) throw new Error('No content returned');

      let base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }

      const rawData = atob(base64);
      const rawLength = rawData.length;
      const array = new Uint8Array(new ArrayBuffer(rawLength));
      for (let i = 0; i < rawLength; i++) {
        array[i] = rawData.charCodeAt(i);
      }

      const blob = new Blob([array], { type: att.mimeType || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      setPreviewAttachment({
        id: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        contentUrl: url
      });
    } catch (e) {
      console.error(e);
      setNotification({
        message: isBn ? 'ফাইল প্রিভিউ লোড হতে ব্যর্থ হয়েছে।' : 'Could not fetch a preview for this attachment.',
        type: 'error'
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSelectMessage = async (msg: EmailMessage) => {
    setSelectedMsg(msg);
    if (msg.isUnread && accessToken) {
      // Optimistically clear unread badge locally
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isUnread: false } : m));
      try {
        await gmailService.markAsRead(accessToken, msg.id);
      } catch (err) {
        console.warn('Silent read-status sync failure:', err);
      }
    }
  };

  const handleSendMailForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    if (!composeTo.trim()) {
      setNotification({ message: isBn ? 'দয়া করে প্রাপকের ঠিকানা লিখুন।' : 'Please specify a recipient.', type: 'error' });
      return;
    }

    setIsSending(true);
    try {
      const ok = await gmailService.sendEmail(accessToken, composeTo, composeCc, composeSubject, composeBody);
      if (!ok) throw new Error('Send service failed');

      setNotification({
        message: isBn ? 'ইমেইল সফলভাবে পাঠানো হয়েছে!' : 'Email sent successfully!',
        type: 'success'
      });

      setComposeTo('');
      setComposeCc('');
      setComposeSubject('');
      setComposeBody('');
      setIsComposeOpen(false);

      if (folder === 'SENT') {
        loadGmailMessages();
      }
    } catch (err: any) {
      setNotification({
        message: isBn ? 'ইমেইল পাঠানো যায়নি।' : 'Failed to send outgoing email details.',
        type: 'error'
      });
    } finally {
      setIsSending(false);
    }
  };

  const openComposeForm = (msg: EmailMessage, mode: 'reply' | 'forward') => {
    let cleanEmail = '';
    const emailMatch = msg.from.match(/<([^>]+)>/);
    if (emailMatch && emailMatch[1]) {
      cleanEmail = emailMatch[1];
    } else {
      cleanEmail = msg.from;
    }

    if (mode === 'reply') {
      setComposeTo(cleanEmail);
      setComposeSubject(msg.subject.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject}`);
      setComposeBody(`\n\n--- On ${msg.date}, ${msg.from} wrote: ---\n> ${msg.snippet}`);
    } else {
      setComposeTo('');
      setComposeSubject(msg.subject.toLowerCase().startsWith('fwd:') ? msg.subject : `Fwd: ${msg.subject}`);
      setComposeBody(`\n\n--- Forwarded Message ---\nFrom: ${msg.from}\nDate: ${msg.date}\nSubject: ${msg.subject}\n\n${msg.bodyText || msg.snippet}`);
    }
    setIsComposeOpen(true);
  };

  // Safe inner doc rendering helper
  const renderFormattedBody = (msg: EmailMessage) => {
    if (msg.bodyHtml) {
      return (
        <div className="w-full h-[470px] border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-xs">
          <iframe
            srcDoc={`
              <html>
                <head>
                  <style>
                    body { 
                      font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                      line-height: 1.6; 
                      color: #1e293b; 
                      padding: 16px;
                      margin: 0;
                      background-color: #ffffff;
                    }
                    a { color: #4f46e5; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    img { max-width: 100%; height: auto; border-radius: 8px; }
                    blockquote { border-left: 3px solid #e2e8f0; padding-left: 12px; margin-left: 0; color: #64748b; }
                  </style>
                </head>
                <body>
                  ${msg.bodyHtml}
                </body>
              </html>
            `}
            className="w-full h-full"
            title="Gmail Content Preview"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      );
    }

    return (
      <div className="p-6 bg-white border border-gray-100 rounded-2xl font-sans text-sm text-gray-800 whitespace-pre-line leading-relaxed min-h-[250px] max-h-[470px] overflow-y-auto shadow-xs">
        {msg.bodyText || msg.snippet}
      </div>
    );
  };

  // Connect visual screen if no authorization exists
  if (!accessToken) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-indigo-50/10 min-h-[500px] flex items-center justify-center p-6 rounded-3xl border border-gray-150/60 max-w-4xl mx-auto shadow-md">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-white border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto shadow-lg text-indigo-600 mb-6">
            <Mail className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight mb-3">
            {isBn ? 'আপনার জিমেইল সংযুক্ত করুন' : 'Connect Your Google Business Mail'}
          </h2>
          <p className="text-gray-500 text-sm mb-8 leading-relaxed">
            {isBn 
              ? 'আপনার জিমেইল অ্যাকাউন্টটি লিঙ্ক করুন যাতে জিমেইল ইনবক্স সিঙ্ক করা যায় এবং সহজেই গ্রাহকদের মেসেজ বা ইনভয়েস রিসিভ এবং সেন্ড করা সম্ভব হয়।' 
              : 'Securely sync your official email inbox, review recent inquiries, draft responsive replies, and write emails to your customers directly.'}
          </p>

          <button
            onClick={handleOAuthConnect}
            disabled={isAuthorizing}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg ring-2 ring-indigo-500/10 transition-all duration-250 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {isAuthorizing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{isBn ? 'সংযোগ হচ্ছে...' : 'Connecting...'}</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.41 0-6.173-2.763-6.173-6.173s2.763-6.173 6.173-6.173c1.5 0 2.873.535 3.939 1.483l3.079-3.079C19.141 2.213 15.939 1 12.24 1 5.866 1 .72 6.146.72 12.5s5.146 11.5 11.52 11.5c6.545 0 11.64-4.8 11.64-11.64 0-.771-.091-1.35-.24-2.075H12.24z"/>
                </svg>
                <span>{isBn ? 'গুগল জিমেইল লিঙ্ক করুন' : 'Connect with Gmail'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[750px] max-w-7xl mx-auto">
      {/* Header Panel */}
      <div className="bg-slate-50/60 backdrop-blur-md px-6 py-4 border-b border-gray-150/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900 leading-tight tracking-tight">
              {isBn ? 'বিজনেস জিমেইল ক্লায়েন্ট' : 'Gmail Client'}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              <span>{profile?.emailAddress || 'Connected'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <button
            onClick={() => setIsComposeOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{isBn ? 'নতুন ইমেইল' : 'Compose Email'}</span>
          </button>

          <button
            onClick={loadGmailMessages}
            disabled={isLoading}
            className="p-2.5 bg-white border border-gray-150 hover:bg-gray-50 text-gray-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            title={isBn ? 'রিফ্রেশ করুন' : 'Refresh Inbox'}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => handleLogOut(true)}
            className="text-xs text-rose-600 hover:text-rose-700 font-extrabold border border-rose-150/60 hover:border-rose-300 rounded-xl px-3 py-2.5 bg-white hover:bg-rose-50 transition-colors cursor-pointer"
          >
            {isBn ? 'ডিসকানেক্ট' : 'Disconnect'}
          </button>
        </div>
      </div>

      {/* Main Container Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <div className="w-64 bg-slate-50/20 border-r border-gray-100 flex flex-col justify-between p-4 shrink-0 hidden md:flex">
          <div className="space-y-6 overflow-y-auto pr-1 max-h-[500px]">
            <div>
              <span className="block text-[10px] font-extrabold tracking-widest text-gray-400 uppercase pl-2 mb-3">
                {isBn ? 'ফোল্ডার তালিকা' : 'Labels'}
              </span>
              <div className="space-y-1">
                {[
                  { id: 'INBOX', label: isBn ? 'ইনবক্স' : 'Inbox', icon: Inbox, color: 'text-indigo-600' },
                  { id: 'STARRED', label: isBn ? 'তারকা চিহ্নিত' : 'Starred', icon: Star, color: 'text-amber-500' },
                  { id: 'SNOOZED', label: isBn ? 'স্নুজড' : 'Snoozed', icon: Clock, color: 'text-sky-500' },
                  { id: 'IMPORTANT', label: isBn ? 'গুরুত্বপূর্ণ' : 'Important', icon: AlertCircle, color: 'text-purple-500' },
                  { id: 'SENT', label: isBn ? 'সেন্ড লিস্ট' : 'Sent Items', icon: Send, color: 'text-violet-600' },
                  { id: 'SCHEDULED', label: isBn ? 'তফসিলভুক্ত' : 'Scheduled', icon: Calendar, color: 'text-teal-505' },
                  { id: 'DRAFT', label: isBn ? 'খসড়া' : 'Drafts', icon: FileText, color: 'text-orange-500' },
                  { id: 'ALL', label: isBn ? 'সব মেইল' : 'All Mail', icon: Mail, color: 'text-slate-600' },
                  { id: 'SPAM', label: isBn ? 'স্প্যাম' : 'Spam', icon: AlertOctagon, color: 'text-red-500' },
                  { id: 'TRASH', label: isBn ? 'ট্র্যাশ বিন' : 'Trash Folder', icon: Trash2, color: 'text-rose-500' }
                ].map(item => {
                  const IconComp = item.icon;
                  const isActive = folder === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setFolder(item.id);
                        setSelectedMsg(null);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-left font-bold text-xs transition-all duration-200 cursor-pointer ${
                        isActive 
                          ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100/50' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent'
                      }`}
                    >
                      <IconComp className={`w-3.5 h-3.5 ${isActive ? item.color : 'text-gray-400'}`} />
                      <span className="flex-1">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-[10px] font-extrabold tracking-widest text-gray-400 uppercase pl-2 mb-3">
                {isBn ? 'ক্যাটাগরি সমূহ' : 'Categories'}
              </span>
              <div className="space-y-1">
                {[
                  { id: 'CATEGORY_PURCHASES', label: isBn ? 'কেনাকাটা' : 'Purchases', icon: ShoppingBag, color: 'text-emerald-500' },
                  { id: 'CATEGORY_SOCIAL', label: isBn ? 'সামাজিক' : 'Social', icon: Users, color: 'text-indigo-500' },
                  { id: 'CATEGORY_UPDATES', label: isBn ? 'আপডেটসমূহ' : 'Updates', icon: Bell, color: 'text-cyan-500' },
                  { id: 'CATEGORY_PROMOTIONS', label: isBn ? 'প্রচারণা' : 'Promotions', icon: Tag, color: 'text-pink-500' }
                ].map(item => {
                  const IconComp = item.icon;
                  const isActive = folder === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setFolder(item.id);
                        setSelectedMsg(null);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-left font-bold text-xs transition-all duration-200 cursor-pointer ${
                        isActive 
                          ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100/50' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent'
                      }`}
                    >
                      <IconComp className={`w-3.5 h-3.5 ${isActive ? item.color : 'text-gray-400'}`} />
                      <span className="flex-1">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-indigo-50/40 border border-indigo-100/30 rounded-2xl p-4 text-center">
            <span className="block text-[11px] font-black text-indigo-600 tracking-wider uppercase mb-1">
              {isBn ? 'নিরাপদ সিঙ্ক' : 'Secure Integration'}
            </span>
            <span className="block text-[10px] text-gray-500 font-medium leading-relaxed">
              {isBn ? 'গুগল এপিআই দিয়ে সরাসরি নিয়ন্ত্রিত' : 'Powered directly by official Google Gmail API.'}
            </span>
          </div>
        </div>

        {/* Content Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Email List Drawer */}
          <div className={`w-full md:w-[400px] border-r border-gray-100 flex flex-col h-full shrink-0 ${selectedMsg ? 'hidden lg:flex' : 'flex'}`}>
            {/* Local Inbox Search Panel */}
            <div className="p-4 border-b border-transparent bg-white shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); loadGmailMessages(); }} className="relative">
                <input
                  type="text"
                  placeholder={isBn ? 'ইমেইল খুঁজুন...' : 'Search mail...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-gray-50 text-gray-950 placeholder-gray-400 rounded-xl text-xs border border-gray-150 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium transition-all"
                />
                <Search className="absolute left-3.5 top-3.5 w-3.5 h-3.5 text-gray-400" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setTimeout(() => loadGmailMessages(), 100); }}
                    className="absolute right-3 top-3.5 text-[10px] text-gray-405 hover:text-gray-600 font-bold"
                  >
                    Clear
                  </button>
                )}
              </form>

              {/* Mobile Folder Selector Tabs */}
              <div className="flex gap-1 overflow-x-auto min-w-0 mt-3 md:hidden">
                {[
                  { id: 'INBOX', name: isBn ? 'ইনবক্স' : 'Inbox' },
                  { id: 'STARRED', name: isBn ? 'তারকা' : 'Starred' },
                  { id: 'SNOOZED', name: isBn ? 'স্নুজড' : 'Snoozed' },
                  { id: 'IMPORTANT', name: isBn ? 'গুরুত্বপূর্ণ' : 'Important' },
                  { id: 'SENT', name: isBn ? 'সেন্ড' : 'Sent' },
                  { id: 'SCHEDULED', name: isBn ? 'তফসিল' : 'Scheduled' },
                  { id: 'DRAFT', name: isBn ? 'খসড়া' : 'Drafts' },
                  { id: 'ALL', name: isBn ? 'সব মেইল' : 'All' },
                  { id: 'SPAM', name: isBn ? 'স্প্যাম' : 'Spam' },
                  { id: 'TRASH', name: isBn ? 'ট্র্যাশ' : 'Trash' },
                  { id: 'CATEGORY_PURCHASES', name: isBn ? 'কেনাকাটা' : 'Purchases' },
                  { id: 'CATEGORY_SOCIAL', name: isBn ? 'সামাজিক' : 'Social' },
                  { id: 'CATEGORY_UPDATES', name: isBn ? 'আপডেট' : 'Updates' },
                  { id: 'CATEGORY_PROMOTIONS', name: isBn ? 'প্রচারণা' : 'Promos' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => { setFolder(f.id); setSelectedMsg(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase shrink-0 transition-colors ${folder === f.id ? 'bg-indigo-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Email Rows container */}
            <div className="flex-1 overflow-y-auto bg-slate-50/30 p-2 divide-y divide-gray-100/60">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <div className="py-12 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="text-xs font-semibold">{isBn ? 'ইনবক্স রিলোড হচ্ছে...' : 'Loading folders...'}</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 flex flex-col items-center justify-center px-4">
                    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                      <Inbox className="w-5 h-5 text-gray-300" />
                    </div>
                    <span className="text-sm font-black text-gray-800">{isBn ? 'কোনো ইমেইল পাওয়া যায়নি।' : 'No messages found.'}</span>
                    <p className="text-[11px] text-gray-500 mt-1 max-w-[200px] leading-relaxed">
                      {isBn ? 'এই ফোল্ডারে বা আপনার জিমেইল অ্যাকাউন্টে কোনো মেসেজ নেই।' : 'No messages match selected query or category.'}
                    </p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isSelected = selectedMsg?.id === msg.id;
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        key={msg.id}
                        onClick={() => handleSelectMessage(msg)}
                        className={`p-3.5 rounded-2xl cursor-pointer transition-all duration-200 border text-left flex flex-col mb-1.5 ${
                          isSelected 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100/50' 
                            : 'bg-white text-gray-700 hover:bg-slate-50 border-gray-100'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                            {msg.isUnread && (
                              <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                            )}
                            <span className={`font-black text-xs truncate ${isSelected ? 'text-white' : 'text-gray-900'} ${msg.isUnread ? 'font-extrabold' : 'font-semibold'}`}>
                              {msg.from.replace(/<.*?>/, '')}
                            </span>
                          </div>
                          <span className={`text-[9px] font-semibold shrink-0 uppercase tracking-tight ${isSelected ? 'text-indigo-200' : 'text-gray-400'}`}>
                            {msg.date.split(',').slice(0, 2).join(',').slice(0, 16)}
                          </span>
                        </div>
                        <h4 className={`text-xs font-bold leading-snug truncate mb-1 ${isSelected ? 'text-white' : 'text-gray-800'}`}>
                          {msg.subject}
                        </h4>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className={`text-[11px] leading-relaxed line-clamp-1 flex-1 ${isSelected ? 'text-indigo-100' : 'text-gray-500'}`}>
                            {msg.snippet}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={(e) => handleStarToggle(e, msg)}
                              className={`p-1 rounded-sm hover:scale-110 active:scale-95 transition-all outline-hidden`}
                            >
                              <Star className={`w-3.5 h-3.5 ${msg.isStarred ? 'fill-amber-400 text-amber-400' : isSelected ? 'text-indigo-300' : 'text-gray-300 hover:text-amber-400'}`} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleTrashMail(msg.id); }}
                              className={`p-1 rounded-sm hover:scale-110 active:scale-95 transition-all text-gray-300 hover:text-rose-500 outline-hidden`}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Email View Area */}
          <div className={`flex-1 overflow-y-auto bg-slate-50/20 flex flex-col h-full ${!selectedMsg ? 'hidden lg:flex' : 'flex'}`}>
            {selectedMsg ? (
              <div className="p-6 flex flex-col gap-6 flex-1 h-full overflow-y-auto">
                <div className="flex items-center gap-2 md:hidden">
                  <button
                    onClick={() => setSelectedMsg(null)}
                    className="flex items-center gap-1 text-xs font-black text-indigo-600 uppercase tracking-widest mb-4 outline-hidden"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{isBn ? 'ইনবক্স ফিরে যান' : 'Back to List'}</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-xs">
                  <div>
                    <h1 className="text-lg font-black text-gray-900 tracking-tight mb-2 leading-snug">
                      {selectedMsg.subject}
                    </h1>
                    <div className="space-y-1 text-xs font-medium text-gray-500">
                      <div>
                        <span className="font-extrabold text-gray-800">{isBn ? 'প্রেরক: ' : 'From: '}</span>
                        <span>{selectedMsg.from}</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-gray-800">{isBn ? 'প্রাপক: ' : 'To: '}</span>
                        <span>{selectedMsg.to}</span>
                      </div>
                      <div>
                        <span className="font-extrabold text-gray-800">{isBn ? 'তারিখ: ' : 'Date: '}</span>
                        <span>{selectedMsg.date}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openComposeForm(selectedMsg, 'reply')}
                      className="flex items-center gap-1 py-1.5 px-3 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer outline-hidden"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>{isBn ? 'উত্তর দিন' : 'Reply'}</span>
                    </button>
                    <button
                      onClick={() => openComposeForm(selectedMsg, 'forward')}
                      className="flex items-center gap-1 py-1.5 px-3 bg-violet-50 border border-violet-100 hover:bg-violet-100 text-violet-700 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer outline-hidden"
                    >
                      <CornerUpRight className="w-3.5 h-3.5" />
                      <span>{isBn ? 'ফরোয়ার্ড' : 'Forward'}</span>
                    </button>
                    <button
                      onClick={() => handleTrashMail(selectedMsg.id)}
                      className="p-2 border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl cursor-pointer outline-hidden"
                      title="Move to Trash"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Body Content Box */}
                <div className="flex-1 min-h-[300px]">
                  {renderFormattedBody(selectedMsg)}
                </div>

                {/* Attachments Section */}
                {selectedMsg.attachments && selectedMsg.attachments.length > 0 && (
                  <div className="border bg-slate-50/50 border-gray-150 p-4 rounded-2xl mt-4 shrink-0">
                    <span className="block text-xs font-black tracking-wider text-slate-700 uppercase mb-3 flex items-center gap-1.5">
                      📎 {isBn ? `সংযুক্ত ফাইলসমূহ (${selectedMsg.attachments.length}টি)` : `Attachments (${selectedMsg.attachments.length})`}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedMsg.attachments.map(att => {
                        const isImage = att.mimeType?.startsWith('image/');
                        const isPdf = att.mimeType === 'application/pdf';
                        const isText = att.mimeType?.startsWith('text/');
                        const sizeKB = Math.round(att.size / 1024);
                        return (
                          <div 
                            key={att.id} 
                            className="bg-white border border-gray-200/80 p-3 rounded-xl flex items-center justify-between gap-3 shadow-xs hover:border-indigo-200 transition-all duration-200"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5 animate-pulse" />
                              </div>
                              <div className="min-w-0">
                                <span className="block text-xs font-bold text-gray-900 truncate" title={att.filename}>
                                  {att.filename}
                                </span>
                                <span className="block text-[10px] text-gray-400 font-mono">
                                  {sizeKB > 1024 ? `${(sizeKB/1024).toFixed(1)} MB` : `${sizeKB} KB`}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {(isImage || isPdf || isText) && (
                                <button
                                  type="button"
                                  onClick={() => handlePreviewAttachment(selectedMsg.id, att)}
                                  disabled={downloadingId !== null}
                                  className="p-2 bg-gray-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                                  title={isBn ? 'প্রিভিউ দেখুন' : 'Preview Document'}
                                >
                                  {downloadingId === att.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDownloadAttachment(selectedMsg.id, att)}
                                disabled={downloadingId !== null}
                                className="p-2 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded-lg cursor-pointer transition-all disabled:opacity-50"
                                title={isBn ? 'ডাউনলোড' : 'Download File'}
                              >
                                {downloadingId === att.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-slate-50/10">
                {/* Dashboard Welcome Header */}
                <div className="bg-gradient-to-r from-indigo-50/50 via-slate-50 to-indigo-50/30 p-6 rounded-3xl border border-gray-100 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-indigo-600 font-extrabold text-xs uppercase tracking-widest mb-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isBn ? 'রিয়েল-টাইম জিমেইল সিঙ্ক' : 'Real-Time Gmail Synchronization'}</span>
                    </div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">
                      {isBn ? 'বিজনেস জিমেইল ড্যাশবোর্ড' : 'Business Mail Dashboard'}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {isBn 
                        ? `আপনার প্রোফাইল: ${profile?.emailAddress || 'সংযুক্ত নেই'}`
                        : `Synchronized Account: ${profile?.emailAddress || 'Not Authenticated'}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-1 shrink-0">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-full border border-emerald-100">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      {isBn ? 'সিঙ্ক চালু আছে' : 'API Sync Connected'}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      {isBn ? 'শেষ সিঙ্ক: ' : 'Last Synced: '}
                      {lastSynced ? lastSynced.toLocaleTimeString() : (isBn ? 'এখনই' : 'Just now')}
                    </span>
                  </div>
                </div>

                {/* Grid of Synced Labels */}
                <h4 className="text-[11px] font-black tracking-widest text-gray-400 uppercase mb-4 pl-1">
                  {isBn ? 'সিঙ্কড লেবেল তালিকা' : 'Synced Gmail Labels'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                  {[
                    { id: 'INBOX', label: isBn ? 'ইনবক্স' : 'Inbox Feed', icon: Inbox, color: 'bg-indigo-50 text-indigo-700 border-indigo-100/50', desc: isBn ? 'প্রাথমিক ইমেল ফিড' : 'Primary incoming emails', isLoaded: folder === 'INBOX' },
                    { id: 'SENT', label: isBn ? 'আউটবক্স / পাঠানো মেইল' : 'Sent Items', icon: Send, color: 'bg-violet-50 text-violet-700 border-violet-100/50', desc: isBn ? 'গ্রাহকদের পাঠানো বার্তা' : 'Dispatched emails list', isLoaded: folder === 'SENT' },
                    { id: 'DRAFT', label: isBn ? 'খসড়া সমূহ' : 'Draft Templates', icon: FileText, color: 'bg-orange-50 text-orange-700 border-orange-100/50', desc: isBn ? 'অসমাপ্ত বার্তার খসড়া' : 'Saved email templates', isLoaded: folder === 'DRAFT' },
                    { id: 'STARRED', label: isBn ? 'তারকা চিহ্নিত মেইল' : 'Starred Mail', icon: Star, color: 'bg-amber-50 text-amber-700 border-amber-100/50', desc: isBn ? 'গুরুত্বপূর্ণ ফ্লাগড মেইল' : 'Flagged & VIP messages', isLoaded: folder === 'STARRED' },
                    { id: 'IMPORTANT', label: isBn ? 'গুরুত্বপূর্ণ' : 'Important Alerts', icon: AlertCircle, color: 'bg-purple-50 text-purple-700 border-purple-100/50', desc: isBn ? 'জরুরি বিজ্ঞপ্তি' : 'High importance updates', isLoaded: folder === 'IMPORTANT' },
                    { id: 'TRASH', label: isBn ? 'মুছে ফেলা মেইল' : 'Trash Folder', icon: Trash2, color: 'bg-rose-50 text-rose-700 border-rose-100/50', desc: isBn ? 'বাতিলকৃত মেসেজ' : 'Deleted inbox messages', isLoaded: folder === 'TRASH' },
                  ].map(stat => {
                    const IconComponent = stat.icon;
                    return (
                      <div
                        key={stat.id}
                        onClick={() => { setFolder(stat.id); }}
                        className={`p-4 bg-white rounded-2xl border transition-all duration-200 cursor-pointer flex items-start gap-4 select-none group ${
                          folder === stat.id 
                            ? 'ring-2 ring-indigo-500 border-indigo-200 bg-indigo-50/10 shadow-xs' 
                            : 'border-gray-100 hover:border-indigo-150 hover:bg-slate-50/30 hover:shadow-xs'
                        }`}
                      >
                        <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-105 transition-transform shrink-0`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-black text-gray-950 group-hover:text-indigo-600 transition-colors">
                            {stat.label}
                          </span>
                          <span className="block text-[10px] text-gray-500 font-medium leading-tight mt-0.5">
                            {stat.desc}
                          </span>
                          <span className="inline-flex items-center gap-1 mt-2 text-[9px] font-bold uppercase tracking-wider text-indigo-600">
                            {stat.isLoaded ? (
                              <span className="flex items-center gap-1">
                                <span className="w-1 h-1 bg-indigo-600 rounded-full animate-ping" />
                                {isBn ? `${messages.length}টি লোড হয়েছে` : `${messages.length} items synced`}
                              </span>
                            ) : (
                              <span className="text-gray-400 group-hover:text-indigo-500 flex items-center gap-0.5">
                                {isBn ? 'সিঙ্ক করতে ক্লিক করুন' : 'Click to sync'}
                                <ChevronRight className="w-3 h-3" />
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Sub Panel for Recent Sync Messages Insight */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-gray-100">
                    <div>
                      <h4 className="text-xs font-black text-gray-900 uppercase tracking-wide">
                        {isBn ? 'সাম্প্রতিক লাইভ ইনবক্স ফিড' : 'Recent Live Feed Snapshot'}
                      </h4>
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                        {isBn 
                          ? `বর্তমান লেবেল: ${folder} - থেকে সর্বশেষ দেখা ৫টি ইমেইল`
                          : `Currently viewing top real-time updates inside ${folder}`}
                      </p>
                    </div>

                    <button 
                      onClick={() => setIsComposeOpen(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-[11px] uppercase tracking-wider rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {isBn ? 'নতুন ইমেইল বা ইনভয়েস লিখুন' : 'Compose Message Now'}
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {messages.slice(0, 3).map(msg => (
                      <div 
                        key={msg.id}
                        onClick={() => setSelectedMsg(msg)}
                        className="p-3 bg-slate-50/50 hover:bg-indigo-50/30 border border-gray-100 rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" style={{ opacity: msg.isUnread ? 1 : 0 }} />
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-gray-900 truncate">
                              {msg.from.replace(/<.*?>/, '')}
                            </span>
                            <span className="block text-[11px] text-gray-500 truncate mt-0.5 font-medium">
                              {msg.subject}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-[10px] font-semibold text-gray-400">
                          <span>{msg.date.split(',')[1]?.slice(0, 12) || msg.date.slice(0, 10)}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                        </div>
                      </div>
                    ))}
                    {messages.length === 0 && (
                      <div className="py-6 text-center text-gray-400 text-xs font-semibold">
                        {isBn ? 'এই ফোল্ডারে বর্তমানে কোনো লাইভ মেসেজ নেই।' : 'No messages currently loaded in this category. Click any label card to sync.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compose Form Modal */}
      <AnimatePresence>
        {isComposeOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl border border-gray-100 w-full max-w-2xl overflow-hidden flex flex-col shadow-indigo-950/10"
            >
              {/* Compose Title bar */}
              <div className="bg-slate-50 px-6 py-4 border-b border-gray-150 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-black text-gray-950 tracking-tight leading-tight">
                    {isBn ? 'নতুন মেসেজ খসড়া করুন' : 'New Message'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsComposeOpen(false)}
                  className="p-1 px-2.5 bg-gray-150/50 hover:bg-gray-150 hover:text-gray-900 text-gray-600 rounded-lg text-xs font-extrabold cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Compose Form Fields */}
              <form onSubmit={handleSendMailForm} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1.5 pl-1">
                    {isBn ? 'প্রাপক (To):' : 'Recipient (To):'}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={isBn ? 'গ্রাহকের ইমেইল অ্যাড্রেস লিখুন' : 'customer@example.com'}
                    value={composeTo}
                    onChange={(e) => setComposeTo(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-150 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1.5 pl-1">
                    {isBn ? 'সিসি (Cc - অন্য ইমেল):' : 'Cc (Other Email):'}
                  </label>
                  <input
                    type="text"
                    placeholder={isBn ? 'অন্যান্য প্রাপকদের ইমেইল কমা দিয়ে আলাদা করে লিখুন (ঐচ্ছিক)' : 'other@example.com, partner@example.com (optional)'}
                    value={composeCc}
                    onChange={(e) => setComposeCc(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-150 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1.5 pl-1">
                    {isBn ? 'বিষয় (Subject):' : 'Subject:'}
                  </label>
                  <input
                    type="text"
                    placeholder={isBn ? 'ইমেইল এর বিবরণী শিরোনাম' : 'Offer Details / Account Inquiry'}
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-150 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500 mb-1.5 pl-1">
                    {isBn ? 'বার্তার বিবরণী (Message Body):' : 'Message Body:'}
                  </label>
                  <textarea
                    required
                    rows={8}
                    placeholder={isBn ? 'আপনার বার্তা এখানে লিখুন...' : 'Write your email contents here...'}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-150 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium min-h-[150px]"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsComposeOpen(false)}
                    className="py-2.5 px-4 bg-gray-100 hover:bg-gray-150 text-gray-700 hover:text-gray-900 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
                  >
                    {isBn ? 'বাতিল' : 'Cancel'}
                  </button>

                  <button
                    type="submit"
                    disabled={isSending}
                    className="flex items-center justify-center gap-2 py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{isBn ? 'পাঠানো হচ্ছে...' : 'Sending...'}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{isBn ? 'পাঠিয়ে দিন' : 'Send'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dynamic Safe Document Preview Modal */}
      <AnimatePresence>
        {previewAttachment && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl border border-gray-150 w-full max-w-3xl overflow-hidden flex flex-col h-[80vh] shadow-indigo-950/20"
            >
              {/* Toolbar */}
              <div className="bg-slate-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                  <h3 className="font-black text-gray-950 truncate text-sm" title={previewAttachment.filename}>
                    {previewAttachment.filename}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={previewAttachment.contentUrl}
                    download={previewAttachment.filename}
                    className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1 shadow-xs transition-colors"
                  >
                    📥 {isBn ? 'ডাউনলোড' : 'Download'}
                  </a>
                  <button
                    onClick={() => {
                      window.URL.revokeObjectURL(previewAttachment.contentUrl);
                      setPreviewAttachment(null);
                    }}
                    className="p-1 px-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-black cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Preview Box */}
              <div className="flex-1 overflow-hidden p-6 bg-slate-50 flex items-center justify-center">
                {previewAttachment.mimeType?.startsWith('image/') ? (
                  <img
                    src={previewAttachment.contentUrl}
                    alt={previewAttachment.filename}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain rounded-xl border border-gray-150 bg-white shadow-xs"
                  />
                ) : previewAttachment.mimeType === 'application/pdf' ? (
                  <iframe
                    src={previewAttachment.contentUrl}
                    className="w-full h-full rounded-xl border border-gray-150 bg-white shadow-xs"
                    title="PDF Document Preview"
                    sandbox="allow-downloads"
                  />
                ) : (
                  // Native plain text / fallback document viewport
                  <iframe
                    src={previewAttachment.contentUrl}
                    className="w-full h-full rounded-xl border border-gray-150 bg-white p-4 font-mono text-xs overflow-auto shadow-xs"
                    title="Document Preview Fallback"
                    sandbox="allow-downloads"
                  />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
