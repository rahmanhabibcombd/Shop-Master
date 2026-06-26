import React, { useState, useEffect } from 'react';
import { db, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc, limit } from '../firebase';
import { User } from 'firebase/auth';
import { MessageSquare, Link as LinkIcon, Image as ImageIcon, Send, Clock, Trash2, Heart, MessageCircle, MoreVertical, Edit2, ShieldAlert, Search, Filter, Tag, Pin } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export type ReactionType = 'like' | 'love' | 'haha' | 'sad';

export interface ReactionRecord {
  [userId: string]: ReactionType;
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  sad: '😢',
};

interface Comment {
  id: string;
  text: string;
  merchantName: string;
  merchantId: string;
  createdAt: number;
  parentId?: string; // For replies
  reactions?: ReactionRecord;
}

interface Post {
  id: string;
  text: string;
  merchantName: string;
  shopName: string;
  merchantId: string;
  shopId: string;
  createdAt: any;
  likes?: number;
  reactions?: ReactionRecord;
  isAd?: boolean;
  comments?: Comment[];
  attachmentUrl?: string;
  tag?: string;
  isPinned?: boolean;
}

const TAGS = ['Discussion', 'Tips', 'Q&A', 'New Product', 'Urgent Help'];

interface CommunityHubPageProps {
  user: User;
  shopSettings: any;
}

// Helper to extract URLs
const extractIframeSrc = (text: string) => {
  const match = text.match(/<iframe.*?src=["'](.*?)["']/i);
  return match ? match[1] : null;
};

const extractUrls = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return (text.match(urlRegex) || []) as string[];
};

const getYoutubeId = (url: string) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

const isImageUrl = (url: string) => {
  const urlWithoutQuery = url.split('?')[0];
  if (/\.(jpeg|jpg|gif|png|webp|svg|bmp|avif)$/i.test(urlWithoutQuery)) return true;
  if (url.includes('scontent') && url.includes('fbcdn.net')) return true;
  if (url.includes('fbcdn.net/v/')) return true;
  if (url.includes('googleusercontent.com')) return true;
  if (url.includes('imgur.com') || url.includes('drive.google.com')) return true;
  if (url.match(/images?\/.*|photos?\/.*|\/p\/.*|static.*\/images?.*/i)) return true;
  return false;
};

const renderMentions = (text: string) => {
  return text.split(/(@\S+)/g).map((part, i) => {
    if (part.startsWith('@')) {
      return <span key={i} className="text-indigo-600 dark:text-indigo-400 font-semibold">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
};

const ReactionPicker = ({ onSelect }: { onSelect: (r: ReactionType) => void }) => {
  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 rounded-full flex gap-1 p-1.5 opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all pointer-events-none group-hover:pointer-events-auto z-50">
      {(Object.keys(REACTION_EMOJIS) as ReactionType[]).map(r => (
        <button
          key={r}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(r); }}
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-lg hover:scale-125 transition-transform"
          title={r}
        >
          {REACTION_EMOJIS[r]}
        </button>
      ))}
    </div>
  );
};

const LinkPreview: React.FC<{ url: string; className?: string }> = ({ url, className = "mt-3" }) => {
  const ytId = getYoutubeId(url);
  if (ytId) {
    return (
      <div className={`${className} relative w-full pt-[56.25%] rounded-xl overflow-hidden shadow-md`}>
        <iframe
          className="absolute top-0 left-0 w-full h-full border-0"
          src={`https://www.youtube.com/embed/${ytId}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>
    );
  }

  let finalUrl = url;
  if (finalUrl.includes('facebook.com') && (finalUrl.includes('/posts/') || finalUrl.includes('/videos/') || finalUrl.includes('/photo'))) {
    if (!finalUrl.includes('plugins/post.php') && !finalUrl.includes('plugins/video.php')) {
        const type = finalUrl.includes('/videos/') ? 'video.php' : 'post.php';
        finalUrl = `https://www.facebook.com/plugins/${type}?href=${encodeURIComponent(finalUrl)}&show_text=true&width=500`;
    }
  }

  if (finalUrl.includes('facebook.com/plugins/')) {
    return (
      <div className={`${className} relative w-full overflow-hidden shadow-md rounded-xl flex justify-center bg-slate-50 dark:bg-slate-900/50 pt-4`}>
        <iframe
          src={finalUrl}
          width="100%"
          height="500"
          style={{ border: 'none', overflow: 'hidden', maxWidth: '500px' }}
          allowFullScreen={true}
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        ></iframe>
      </div>
    );
  }

  if (isImageUrl(finalUrl)) {
    // Basic image preview for known extensions
    return (
      <div className={`${className} rounded-xl overflow-hidden shadow-md max-h-96`}>
        <img src={finalUrl} alt="Shared content" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </div>
    );
  }

  // Fallback for normal links
  return (
    <a href={finalUrl} target="_blank" rel="noopener noreferrer" className={`${className === 'mt-3' ? 'mt-2' : ''} flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-indigo-600 hover:underline break-all text-sm group h-full`}>
      <LinkIcon className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-indigo-600" />
      <span className="truncate line-clamp-2 whitespace-normal break-all">{finalUrl}</span>
    </a>
  );
};

const CommentNode: React.FC<{
  comment: Comment;
  allComments: Comment[];
  post: Post;
  user: User;
  depth?: number;
  onReply: (commentId: string, merchantName: string) => void;
  onDelete: (postId: string, commentId: string) => void;
  onReact: (postId: string, commentId: string, reaction: ReactionType) => void;
  onEdit: (postId: string, commentId: string, text: string) => void;
  onViewProfile: (merchantId: string) => void;
}> = ({
  comment,
  allComments,
  post,
  user,
  depth = 0,
  onReply,
  onDelete,
  onReact,
  onEdit,
  onViewProfile
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const replies = allComments.filter(c => c.parentId === comment.id);
  const isOwner = comment.merchantId === user.uid;
  const userReaction = comment.reactions?.[user.uid];
  
  const uniqueReactions = Array.from(new Set(Object.values(comment.reactions || {}))) as ReactionType[];
  const totalReactions = Object.keys(comment.reactions || {}).length;

  return (
    <div className={`space-y-3 ${depth > 0 ? 'ml-6 sm:ml-10 border-l-2 border-slate-100 dark:border-slate-800/50 pl-3 sm:pl-4 mt-3' : ''}`}>
      <div className="flex gap-3 group/comment">
        <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs shrink-0 mt-0.5">
          {comment.merchantName[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl rounded-tl-sm px-4 py-3 relative">
            <div className="flex items-baseline justify-between gap-2">
              <button onClick={() => onViewProfile(comment.merchantId)} className="font-bold text-gray-900 dark:text-gray-100 text-[13px] hover:underline hover:text-indigo-600 dark:hover:text-indigo-400">{comment.merchantName}</button>
              {isOwner && (
                <div className="flex items-center gap-1 opacity-0 group-hover/comment:opacity-100 transition-opacity">
                  {isDeleting ? (
                    <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded-lg">
                      <button onClick={() => setIsDeleting(false)} className="text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">No</button>
                      <button onClick={() => onDelete(post.id, comment.id)} className="text-[10px] font-bold text-rose-600 hover:text-rose-800 dark:hover:text-rose-400">Yes</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => { setIsEditing(true); setEditText(comment.text); }} className="text-slate-400 hover:text-indigo-600 p-1">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => setIsDeleting(true)} className="text-slate-400 hover:text-rose-500 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-[13px] focus:ring-2 focus:ring-indigo-500 outline-none min-h-[60px]"
                />
                <div className="flex items-center justify-end gap-2">
                  <button onClick={() => setIsEditing(false)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                  <button onClick={() => { onEdit(post.id, comment.id, editText); setIsEditing(false); }} className="text-[11px] font-bold text-white bg-indigo-600 px-3 py-1 rounded hover:bg-indigo-700">Save</button>
                </div>
              </div>
            ) : (
              <p className="text-gray-700 dark:text-gray-300 text-[13px] mt-0.5 whitespace-pre-wrap word-break break-words">
                {renderMentions(comment.text)}
              </p>
            )}
            
            {totalReactions > 0 && !isEditing && (
              <div className="absolute -bottom-2 right-2 flex items-center gap-1 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-700 rounded-full px-1.5 py-0.5 text-[10px] z-10">
                {uniqueReactions.slice(0, 3).map(r => REACTION_EMOJIS[r])}
                <span className="font-semibold text-slate-500 ml-0.5">{totalReactions}</span>
              </div>
            )}
          </div>
          
          {!isEditing && (
            <div className="flex items-center gap-4 mt-1.5 ml-2">
              <span className="text-[11px] font-medium text-slate-400">
                {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
              </span>
              <div className="relative group inline-block">
                <button className={`text-[11px] font-bold transition-colors ${userReaction ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>
                   {userReaction ? REACTION_EMOJIS[userReaction] + ' ' + (userReaction.charAt(0).toUpperCase() + userReaction.slice(1)) : 'React'}
                </button>
                <ReactionPicker onSelect={(r) => onReact(post.id, comment.id, r)} />
              </div>
              <button onClick={() => onReply(comment.id, comment.merchantName)} className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 transition-colors">
                Reply
              </button>
            </div>
          )}
        </div>
      </div>
      
      {replies.length > 0 && (
        <div className="space-y-3 mt-2">
          {replies.map(reply => (
            <CommentNode
              key={reply.id}
              comment={reply}
              allComments={allComments}
              post={post}
              user={user}
              depth={depth + 1}
              onReply={onReply}
              onDelete={onDelete}
              onReact={onReact}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function CommunityHubPage({ user, shopSettings }: CommunityHubPageProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [postLimit, setPostLimit] = useState(15);
  const [hasMore, setHasMore] = useState(true);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [newPostText, setNewPostText] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isAd, setIsAd] = useState(false);
  const [newPostTag, setNewPostTag] = useState(TAGS[0]);
  
  // Search and Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('All');
  const [filterType, setFilterType] = useState<'All' | 'Ad' | 'Standard'>('All');
  
  // Edit state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostText, setEditPostText] = useState('');
  const [editPostAttachmentUrl, setEditPostAttachmentUrl] = useState('');
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  // Comment state
  const [commentText, setCommentText] = useState<{ [postId: string]: string }>({});
  const [replyingTo, setReplyingTo] = useState<{ postId: string, commentId: string, merchantName: string } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<{ postId: string, query: string, position: number } | null>(null);

  const getAllUsers = () => {
    const users = new Map<string, string>();
    posts.forEach(post => {
      users.set(post.merchantName, post.merchantName);
      post.comments?.forEach(c => {
        users.set(c.merchantName, c.merchantName);
      });
    });
    return Array.from(users.values());
  };

  useEffect(() => {
    const q = query(collection(db, 'community_posts'), orderBy('createdAt', 'desc'), limit(postLimit));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      setPosts(postsData);
      setHasMore(snapshot.docs.length === postLimit);
    });
    return () => unsubscribe();
  }, [postLimit]);

  const handleInitiateReply = (postId: string, commentId: string, merchantName: string) => {
    setReplyingTo({ postId, commentId, merchantName });
    const mention = `@${merchantName.replace(/\s+/g, '')} `;
    setCommentText(prev => {
      const current = prev[postId] || '';
      if (!current.includes(mention)) {
        return { ...prev, [postId]: mention + current };
      }
      return prev;
    });
    setTimeout(() => {
      document.getElementById(`comment-${postId}`)?.focus();
    }, 10);
  };

  const handlePost = async () => {
    if (!newPostText.trim() && !newAttachmentUrl.trim()) return;
    setIsPosting(true);
    
    let processedText = newPostText.trim();
    let finalAttachmentUrl = newAttachmentUrl.trim();

    // Check if attachment URL is actually an iframe embed code
    const embedSrcAttachment = extractIframeSrc(finalAttachmentUrl);
    if (embedSrcAttachment) {
      finalAttachmentUrl = embedSrcAttachment;
    }

    // Process all iframes in the text
    const iframeRegex = /<iframe[^>]*><\/iframe>|<iframe[^>]*\/>/gi;
    let textHasIframe = false;
    
    // Check if text contains an iframe embed code
    const embedSrcText = extractIframeSrc(processedText);
    if (embedSrcText) {
      textHasIframe = true;
      if (!finalAttachmentUrl) finalAttachmentUrl = embedSrcText;
      processedText = processedText.replace(/<iframe[\s\S]*?<\/iframe>/gi, '').trim();
    }

    // In case there is no text left but there is an attachment
    if (!processedText && finalAttachmentUrl) {
      processedText = ''; // Allow empty text if attachment exists
    }

    try {
      await addDoc(collection(db, 'community_posts'), {
        text: processedText,
        attachmentUrl: finalAttachmentUrl || null,
        merchantName: shopSettings.ownerName || user.displayName || user.email?.split('@')[0] || 'Unknown Merchant',
        shopName: shopSettings.name || 'Unknown Shop',
        merchantId: user.uid,
        shopId: shopSettings.id || 'global',
        createdAt: serverTimestamp(),
        likes: 0,
        isAd,
        tag: newPostTag,
        isPinned: false,
        comments: []
      });
      setNewPostText('');
      setNewAttachmentUrl('');
      setIsAd(false);
      setNewPostTag(TAGS[0]);
    } catch (error) {
      console.error('Error posting:', error);
      alert('Failed to post. Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'community_posts', postId));
      setDeletingPostId(null);
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const handleTogglePin = async (postId: string, currentPinStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'community_posts', postId), {
        isPinned: !currentPinStatus
      });
    } catch (error) {
      console.error('Error toggling pin:', error);
    }
  };

  const handleEditPost = async (postId: string) => {
    if (!editPostText.trim() && !editPostAttachmentUrl.trim()) return;

    let processedText = editPostText.trim();
    let finalAttachmentUrl = editPostAttachmentUrl.trim();

    // Check if attachment URL is actually an iframe embed code
    const embedSrcAttachment = extractIframeSrc(finalAttachmentUrl);
    if (embedSrcAttachment) {
      finalAttachmentUrl = embedSrcAttachment;
    }

    // Process all iframes in the text
    const embedSrcText = extractIframeSrc(processedText);
    if (embedSrcText) {
      if (!finalAttachmentUrl) finalAttachmentUrl = embedSrcText;
      processedText = processedText.replace(/<iframe[\s\S]*?<\/iframe>/gi, '').trim();
    }

    try {
      await updateDoc(doc(db, 'community_posts', postId), {
        text: processedText,
        attachmentUrl: finalAttachmentUrl || null
      });
      setEditingPostId(null);
      setEditPostText('');
      setEditPostAttachmentUrl('');
    } catch (error) {
      console.error('Error editing post:', error);
    }
  };

  const handleComment = async (postId: string) => {
    const txt = commentText[postId];
    if (!txt?.trim()) return;

    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      const newComment: Comment = {
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        text: txt.trim(),
        merchantName: shopSettings.ownerName || user.displayName || user.email?.split('@')[0] || 'Unknown',
        merchantId: user.uid,
        createdAt: Date.now(),
        ...(replyingTo?.postId === postId ? { parentId: replyingTo.commentId } : {})
      };

      const updatedComments = [...(post.comments || []), newComment];

      await updateDoc(doc(db, 'community_posts', postId), {
        comments: updatedComments
      });

      setCommentText(prev => ({ ...prev, [postId]: '' }));
      setReplyingTo(null);
      setMentionQuery(null);
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };
  
  const handleDeleteComment = async (postId: string, commentId: string) => {
    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;
      
      const getDescendantIds = (parentId: string): string[] => {
        const children = (post.comments || []).filter(c => c.parentId === parentId);
        return [
          ...children.map(c => c.id),
          ...children.flatMap(c => getDescendantIds(c.id))
        ];
      };
      
      const idsToRemove = new Set([commentId, ...getDescendantIds(commentId)]);
      
      const updatedComments = (post.comments || []).filter(c => !idsToRemove.has(c.id));
      await updateDoc(doc(db, 'community_posts', postId), {
        comments: updatedComments
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const handleEditComment = async (postId: string, commentId: string, newText: string) => {
    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;
      const updatedComments = (post.comments || []).map(c => 
        c.id === commentId ? { ...c, text: newText } : c
      );
      await updateDoc(doc(db, 'community_posts', postId), {
        comments: updatedComments
      });
    } catch (error) {
      console.error('Error editing comment:', error);
    }
  };

  const handleReactPost = async (postId: string, reaction: ReactionType) => {
    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;
      
      const reactions = { ...(post.reactions || {}) };
      if (reactions[user.uid] === reaction) {
        delete reactions[user.uid]; // Toggle off if clicking the same
      } else {
        reactions[user.uid] = reaction;
      }

      await updateDoc(doc(db, 'community_posts', postId), { reactions });
    } catch (error) {
      console.error('Error reacting to post:', error);
    }
  };

  const handleReactComment = async (postId: string, commentId: string, reaction: ReactionType) => {
    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;
      
      const updatedComments = (post.comments || []).map(c => {
        if (c.id === commentId) {
          const reactions = { ...(c.reactions || {}) };
          if (reactions[user.uid] === reaction) {
            delete reactions[user.uid];
          } else {
            reactions[user.uid] = reaction;
          }
          return { ...c, reactions };
        }
        return c;
      });

      await updateDoc(doc(db, 'community_posts', postId), { comments: updatedComments });
    } catch (error) {
      console.error('Error reacting to comment:', error);
    }
  };

  const renderTextWithLinks = (text: string) => {
    if (!text) return null;
    const urls = extractUrls(text);
    if (!urls.length) return <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{text}</p>;

    let processedText = text;
    let parts: React.ReactNode[] = [];
    
    // Simple naive splitting - replace urls with links
    const splitByUrl = text.split(/(https?:\/\/[^\s]+)/g);
    
    return (
      <div>
        <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap mb-2">
          {splitByUrl.map((part, i) => {
            if (part.match(/(https?:\/\/[^\s]+)/)) {
              return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all">{part}</a>;
            }
            return <span key={i}>{part}</span>;
          })}
        </p>
        
        {urls.length > 0 && (
          <div className={`mt-3 ${urls.length > 1 ? 'grid gap-2 grid-cols-2' : ''}`}>
            {urls.map((url, i) => (
               <LinkPreview key={i} url={url} className={urls.length > 1 ? "mt-0" : "mt-3"} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const filteredPosts = posts.filter(post => {
    // Profile Filter
    if (selectedMerchantId && post.merchantId !== selectedMerchantId) return false;

    // Search Query
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        post.text.toLowerCase().includes(searchLower) || 
        post.merchantName.toLowerCase().includes(searchLower) ||
        post.shopName.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }
    
    // Tag Filter
    if (filterTag !== 'All' && post.tag !== filterTag) return false;
    
    // Type Filter
    if (filterType === 'Ad' && !post.isAd) return false;
    if (filterType === 'Standard' && post.isAd) return false;
    
    return true;
  });

  const selectedMerchantPost = posts.find(p => p.merchantId === selectedMerchantId);
  const selectedMerchantName = selectedMerchantId === user.uid ? (shopSettings.ownerName || user.displayName || user.email?.split('@')[0] || 'Me') : selectedMerchantPost?.merchantName || 'Unknown Merchant';
  const selectedMerchantShopName = selectedMerchantId === user.uid ? shopSettings.name : selectedMerchantPost?.shopName || 'Unknown Shop';

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between border-b border-gray-150 dark:border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg text-white">
            <MessageSquare className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              {selectedMerchantId ? `${selectedMerchantName}'s Profile` : 'Community Hub'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {selectedMerchantId ? `Viewing posts from ${selectedMerchantShopName}` : 'Share ideas, products, and updates with fellow merchants.'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {selectedMerchantId ? (
            <button
              onClick={() => setSelectedMerchantId(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-xl transition-colors"
            >
              Back to Hub
            </button>
          ) : (
            <button
              onClick={() => setSelectedMerchantId(user.uid)}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold text-sm rounded-xl transition-colors"
            >
              My Profile
            </button>
          )}
        </div>
      </div>

      {!selectedMerchantId && (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-sm border border-gray-100 dark:border-slate-800">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center text-indigo-600 font-bold shrink-0">
              {(user.displayName || user.email || 'M')[0].toUpperCase()}
            </div>
            <div className="flex-1 space-y-3">
              <textarea
                value={newPostText}
                onChange={(e) => setNewPostText(e.target.value)}
                placeholder="What's on your mind? Share a product link or YouTube video..."
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 min-h-[120px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-all"
              />
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                <LinkIcon className="w-5 h-5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={newAttachmentUrl}
                  onChange={(e) => setNewAttachmentUrl(e.target.value)}
                  placeholder="Optional: Paste a URL or embed code (YouTube, Facebook, etc.)"
                  className="w-full bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200"
                />
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-slate-400" />
                    <select
                      value={newPostTag}
                      onChange={(e) => setNewPostTag(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none font-medium"
                    >
                      {TAGS.map(tag => (
                        <option key={tag} value={tag}>{tag}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">
                    <input type="checkbox" checked={isAd} onChange={(e) => setIsAd(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                    <span className="flex items-center gap-1"><ShieldAlert className="w-4 h-4" /> Mark as Ad/Offer</span>
                  </label>
                </div>
                <button
                  onClick={handlePost}
                  disabled={(!newPostText.trim() && !newAttachmentUrl.trim()) || isPosting}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPosting ? 'Posting...' : 'Post'}
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-4 shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search posts, merchants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl leading-5 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all"
          />
        </div>
        <div className="flex w-full sm:w-auto items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none font-medium"
            >
              <option value="All">All Posts</option>
              <option value="Standard">Discussions</option>
              <option value="Ad">Ads & Offers</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-400" />
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none font-medium"
            >
              <option value="All">All Tags</option>
              {TAGS.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-[2rem] border border-gray-100 dark:border-slate-800">
            <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">No posts yet</h3>
            <p className="text-slate-500 max-w-md mx-auto mt-2">Be the first to share something with the community! Drop a product link or a YouTube video above.</p>
          </div>
        ) : (
          filteredPosts
            .sort((a, b) => {
              if (a.isPinned && !b.isPinned) return -1;
              if (!a.isPinned && b.isPinned) return 1;
              return 0; // The original query already sorts by createdAt desc
            })
            .map(post => {
            const isOwner = post.merchantId === user.uid;
            const comments = post.comments || [];
            const topLevelComments = comments.filter(c => !c.parentId);
            
            return (
              <div key={post.id} className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-slate-800 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-black text-lg shrink-0 shadow-sm relative">
                    {post.shopName[0].toUpperCase()}
                    {post.isAd && (
                      <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border-2 border-white dark:border-slate-900">
                        AD
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 relative group/header">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                           <button onClick={() => setSelectedMerchantId(post.merchantId)} className="font-bold text-gray-900 dark:text-white text-[15px] hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 text-left">{post.shopName}</button>
                           {post.isAd && (
                             <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md">Promoted</span>
                           )}
                           {post.tag && (
                             <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                               {post.tag}
                             </span>
                           )}
                           {post.isPinned && (
                             <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-bold rounded-md flex items-center gap-1">
                               <Pin className="w-3 h-3" /> Pinned
                             </span>
                           )}
                        </div>
                        <button onClick={() => setSelectedMerchantId(post.merchantId)} className="text-[13px] text-slate-500 font-medium hover:underline hover:text-indigo-600 dark:hover:text-indigo-400 text-left">{post.merchantName}</button>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                        </span>
                        <div className="opacity-0 group-hover/header:opacity-100 transition-opacity flex items-center gap-1">
                          <button onClick={() => handleTogglePin(post.id, post.isPinned || false)} className={`p-1.5 rounded-lg transition-colors ${post.isPinned ? 'text-rose-600 bg-rose-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`} title={post.isPinned ? 'Unpin Post' : 'Pin Post'}>
                            <Pin className="w-4 h-4" />
                          </button>
                        </div>
                        {isOwner && (
                          <div className="opacity-0 group-hover/header:opacity-100 transition-opacity flex items-center gap-1">
                            {deletingPostId === post.id ? (
                              <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/30 px-2 py-1 rounded-lg">
                                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Delete?</span>
                                <button onClick={() => setDeletingPostId(null)} className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">No</button>
                                <button onClick={() => handleDeletePost(post.id)} className="text-xs font-bold text-rose-600 hover:text-rose-800 dark:hover:text-rose-400">Yes</button>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => { setEditingPostId(post.id); setEditPostText(post.text); setEditPostAttachmentUrl(post.attachmentUrl || ''); }} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDeletingPostId(post.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      {editingPostId === post.id ? (
                        <div className="space-y-3">
                          <textarea
                            value={editPostText}
                            onChange={(e) => setEditPostText(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 min-h-[100px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-all"
                          />
                          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                            <LinkIcon className="w-5 h-5 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              value={editPostAttachmentUrl}
                              onChange={(e) => setEditPostAttachmentUrl(e.target.value)}
                              placeholder="Optional: Paste a URL or embed code (YouTube, Facebook, etc.)"
                              className="w-full bg-transparent outline-none text-sm text-gray-800 dark:text-gray-200"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setEditingPostId(null)} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                            <button onClick={() => handleEditPost(post.id)} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Save Changes</button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {renderTextWithLinks(post.text)}
                          {post.attachmentUrl && (
                            <div className={`mt-3 ${post.attachmentUrl.split(/[\s,]+/).filter(Boolean).length > 1 ? 'grid gap-2 grid-cols-2' : ''}`}>
                              {post.attachmentUrl.split(/[\s,]+/).filter(Boolean).map((u, i, arr) => (
                                <LinkPreview key={i} url={u} className={arr.length > 1 ? "mt-0" : "mt-3"} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Footer actions */}
                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-6">
                      <div className="relative group inline-block">
                        <button className={`flex items-center gap-2 font-semibold text-sm transition-colors ${post.reactions?.[user.uid] ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'}`}>
                          <div className="p-2 rounded-full group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 transition-colors">
                            <Heart className="w-5 h-5" />
                          </div>
                          {post.reactions?.[user.uid] ? REACTION_EMOJIS[post.reactions[user.uid]] + ' ' + post.reactions[user.uid].charAt(0).toUpperCase() + post.reactions[user.uid].slice(1) : 'React'} 
                          {Object.keys(post.reactions || {}).length > 0 && ` (${Object.keys(post.reactions || {}).length})`}
                        </button>
                        <ReactionPicker onSelect={(r) => handleReactPost(post.id, r)} />
                      </div>
                      <label htmlFor={`comment-${post.id}`} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-semibold text-sm transition-colors group cursor-pointer">
                        <div className="p-2 rounded-full group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 transition-colors">
                          <MessageCircle className="w-5 h-5" />
                        </div>
                        Comment ({comments.length})
                      </label>
                    </div>

                    {/* Comments Section */}
                    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800/50 space-y-4">
                      {topLevelComments.map(comment => (
                        <CommentNode
                          key={comment.id}
                          comment={comment}
                          allComments={comments}
                          post={post}
                          user={user}
                          onReply={(commentId, merchantName) => handleInitiateReply(post.id, commentId, merchantName)}
                          onDelete={handleDeleteComment}
                          onReact={handleReactComment}
                          onEdit={handleEditComment}
                          onViewProfile={setSelectedMerchantId}
                        />
                      ))}

                      {/* Comment Input */}
                      <div className="flex gap-3 items-end mt-2">
                         <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0 mb-1">
                          {(user.displayName || user.email || 'M')[0].toUpperCase()}
                         </div>
                         <div className="flex-1 flex flex-col gap-2">
                           {replyingTo?.postId === post.id && (
                             <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300">
                               <span>Replying to {replyingTo.merchantName}...</span>
                               <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Cancel</button>
                             </div>
                           )}
                           <div className="relative">
                              {mentionQuery?.postId === post.id && (
                                <div className="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
                                  {getAllUsers()
                                    .filter(u => u.toLowerCase().includes(mentionQuery.query.toLowerCase()))
                                    .slice(0, 5)
                                    .map(u => (
                                    <button
                                      key={u}
                                      onClick={() => {
                                         const text = commentText[post.id];
                                         const before = text.slice(0, mentionQuery.position - mentionQuery.query.length - 1);
                                         const after = text.slice(mentionQuery.position);
                                         setCommentText(prev => ({ ...prev, [post.id]: before + '@' + u.replace(/\s+/g, '') + ' ' + after }));
                                         setMentionQuery(null);
                                         setTimeout(() => {
                                           const textarea = document.getElementById(`comment-${post.id}`) as HTMLTextAreaElement;
                                           if (textarea) {
                                             textarea.focus();
                                           }
                                         }, 10);
                                      }}
                                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 hover:text-indigo-600 dark:hover:text-indigo-400 border-b border-slate-100 dark:border-slate-800/50 last:border-0 font-medium truncate"
                                    >
                                      {u}
                                    </button>
                                  ))}
                                  {getAllUsers().filter(u => u.toLowerCase().includes(mentionQuery.query.toLowerCase())).length === 0 && (
                                    <div className="px-4 py-3 text-xs text-slate-500 text-center">No matching users</div>
                                  )}
                                </div>
                              )}
                              <textarea
                                id={`comment-${post.id}`}
                                value={commentText[post.id] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCommentText(prev => ({ ...prev, [post.id]: val }));
                                  
                                  const cursorPosition = e.target.selectionStart;
                                  const textBeforeCursor = val.slice(0, cursorPosition);
                                  // Match @ followed by letters/numbers without spaces
                                  const match = textBeforeCursor.match(/@([\w-]*)$/);
                                  
                                  if (match) {
                                    setMentionQuery({ postId: post.id, query: match[1], position: cursorPosition });
                                  } else {
                                    setMentionQuery(null);
                                  }
                                }}
                                placeholder={replyingTo?.postId === post.id ? `Write a reply...` : "Write a comment..."}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-bl-sm py-2.5 pl-4 pr-12 min-h-[44px] max-h-[120px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition-all text-[13px]"
                                rows={1}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleComment(post.id);
                                  }
                                }}
                              />
                              <button 
                                onClick={() => handleComment(post.id)}
                                disabled={!commentText[post.id]?.trim()}
                                className="absolute right-2 bottom-2 p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors disabled:opacity-40"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                           </div>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {hasMore && filteredPosts.length > 0 && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => setPostLimit(prev => prev + 15)}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-xl transition-colors"
          >
            Load More Posts
          </button>
        </div>
      )}
    </div>
  );
}

