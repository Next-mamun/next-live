import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Tv, Users, MessageCircle, Bot, Sparkles, BookOpen, 
  Youtube, ShieldCheck, Sliders, Mic, ShoppingBag, 
  GraduationCap, ArrowRight, ExternalLink, CheckCircle2, 
  ChevronDown, Search, Heart, Share2, Eye, Shield, Laptop, 
  Zap, Globe, Award, Lock, Smartphone
} from 'lucide-react';

interface FeatureItem {
  id: string;
  number: number;
  badge: string;
  title: string;
  tagline: string;
  category: 'Communication' | 'AI & Intelligence' | 'Media & Entertainment' | 'Learning & Tools' | 'Safety & Settings';
  icon: React.ReactNode;
  iconBg: string;
  description: string;
  howItWorks: string[];
  keyBenefits: string[];
  keywords: string[];
  actionLabel?: string;
  actionUrl?: string;
  externalUrl?: string;
}

const ALL_FEATURES: FeatureItem[] = [
  {
    id: 'cinema',
    number: 1,
    badge: 'First in Bangladesh',
    title: 'Next Cinema & Theatre',
    tagline: 'Synchronized Movie & YouTube Watch Parties with Live Call',
    category: 'Media & Entertainment',
    icon: <Tv className="w-6 h-6 text-purple-500" />,
    iconBg: 'bg-purple-100 dark:bg-purple-950/40 text-purple-600',
    description: 'Next Cinema & Theatre allows two or more people in different locations or countries to watch YouTube videos, movies, and streams in perfect sync. While watching, participants can talk via live audio and video calls, send real-time chat messages, and react together. The host creates a theatre room code (e.g. C2838) and shares it with friends to jump in instantly with zero lag.',
    howItWorks: [
      'Host clicks "Create Cinema" to generate a unique room code.',
      'Paste any YouTube video link or select from trending cinema streams.',
      'Friends join with the room code and enjoy synchronized play/pause/seek controls with integrated video calling.'
    ],
    keyBenefits: [
      'Zero latency video/audio sync across different countries',
      'Integrated WebRTC camera and microphone ducking',
      'Interactive cinema live chat and floating emoji reactions',
      '100% free with no third-party extension required'
    ],
    keywords: ['Next Cinema', 'watch party online', 'synchronized movie watching', 'watch YouTube together', 'virtual cinema room'],
    actionLabel: 'Launch Cinema Theatre',
    actionUrl: '/cinema'
  },
  {
    id: 'meet',
    number: 2,
    badge: 'Zero-Server Storage',
    title: 'Next Meet',
    tagline: 'P2P Encrypted Secret Meeting & Video Conference',
    category: 'Communication',
    icon: <Users className="w-6 h-6 text-green-500" />,
    iconBg: 'bg-green-100 dark:bg-green-950/40 text-green-600',
    description: 'Designed specifically for confidential discussions, study groups, and business meetings. Next Meet utilizes direct Peer-to-Peer (P2P) WebRTC connections where video, audio, and room messages pass directly between user devices without being stored on central servers. Create a room code (e.g. M3737), share with trusted friends, and meet securely with crystal-clear HD audio.',
    howItWorks: [
      'Click "Create Meet" to generate an instant private code (M-XXXX).',
      'Share the room code with participants via private message or link.',
      'Enter the room with instant camera, mic, screen share, and ephemeral peer chat.'
    ],
    keyBenefits: [
      'Peer-to-peer encrypted mesh architecture',
      'No server video recording or database logs',
      'HD Opus audio codecs with ambient noise reduction',
      'Quick code-based room joining without cumbersome registration links'
    ],
    keywords: ['Next Meet', 'P2P encrypted meeting', 'secret video call', 'private conference room', 'serverless video chat'],
    actionLabel: 'Start Private Meet',
    actionUrl: '/meet'
  },
  {
    id: 'inbox',
    number: 3,
    badge: 'Revolutionary Messaging',
    title: 'High-Tech Next Messenger',
    tagline: 'Live Keystroke Typing & View-Once Confidential Messages',
    category: 'Communication',
    icon: <MessageCircle className="w-6 h-6 text-blue-500" />,
    iconBg: 'bg-blue-100 dark:bg-blue-950/40 text-blue-600',
    description: 'Next Messenger elevates standard messaging with two world-class high-tech innovations: 1) Real-Time Keystroke Typing: When mutual live typing is enabled, users see each other typing character-by-character in real time—eliminating delay and static typing bubbles. 2) View-Once Text & Media: Send private self-destructing text notes and media that vanish permanently after being read once.',
    howItWorks: [
      'Real-Time Typing: Send a live typing proposal inside the chat; upon acceptance, keystrokes sync live with sub-100ms speed.',
      'View-Once Messages: Tap the eye icon to mark any text, photo, or audio as "View Once".',
      'The message self-destructs immediately after opening, leaving zero permanent footprint.'
    ],
    keyBenefits: [
      'Character-by-character live typing transparency',
      'View-Once capability for sensitive confidential text (not just photos)',
      'Sub-100ms ultra-fast delivery powered by hybrid cloud sync',
      'Rich multimedia sharing with audio notes and verified sender badges'
    ],
    keywords: ['real time keystroke typing', 'live typing messenger', 'view once text message', 'self destructing messages', 'Next Messenger'],
    actionLabel: 'Open Next Messenger',
    actionUrl: '/messages'
  },
  {
    id: 'nexto-ai',
    number: 4,
    badge: '3D Desktop Companion',
    title: 'Nexto AI',
    tagline: 'Draggable 3D Floating Robot, Smart Chatbot & Voice Tutor',
    category: 'AI & Intelligence',
    icon: <Bot className="w-6 h-6 text-indigo-500" />,
    iconBg: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600',
    description: 'An interactive 3D robot that floats over your screen and can be dragged and placed anywhere. Tapping Nexto opens a modern AI Assistant capable of smart conversations, creative writing, programming code assistance, and visual generation. Most notably, Nexto Voice Assistant conducts voice conversations to help users practice spoken English, prepare for interviews, and learn new skills interactively.',
    howItWorks: [
      'Drag and reposition the cute Nexto Robot to any corner of your screen.',
      'Tap to open Nexto Chat for answers, summaries, post enhancements, and creative ideas.',
      'Engage Nexto Voice Assistant for real-time spoken English practice and voice Q&A.'
    ],
    keyBenefits: [
      'Fully draggable, customizable floating 3D companion',
      'Voice-guided spoken English tutor for conversation practice',
      'Instant post writing and bio enhancement with creative AI',
      'Zero-lag responses tuned for mobile and desktop screens'
    ],
    keywords: ['Nexto AI', 'floating robot assistant', 'AI English speaking tutor', 'draggable AI chatbot', 'Gemini AI social assistant'],
    actionLabel: 'Interact with Nexto AI',
    actionUrl: '/'
  },
  {
    id: 'sylheti-ai',
    number: 5,
    badge: 'World First Dialect AI',
    title: 'Sylheti AI',
    tagline: 'The World’s First Regional Sylheti Language AI Assistant',
    category: 'AI & Intelligence',
    icon: <Sparkles className="w-6 h-6 text-amber-500" />,
    iconBg: 'bg-amber-100 dark:bg-amber-950/40 text-amber-600',
    description: 'A cultural and technological breakthrough inside Nexto AI. With a single tap ("Switch to Sylheti"), users switch to Sylheti AI—an artificial intelligence tailored to speak, understand, and converse naturally in the authentic Sylheti language dialect both in text and interactive voice guidance. It bridges regional heritage with modern frontier AI.',
    howItWorks: [
      'Open Nexto AI on your screen.',
      'Tap "Switch to Sylheti" mode.',
      'Ask questions, listen to replies, and chat in native Sylheti dialect with cultural warmth.'
    ],
    keyBenefits: [
      'World’s first dedicated Sylheti dialect artificial intelligence',
      'Authentic regional phrasing, vocabulary, and phonetic understanding',
      'Preserves and celebrates regional language heritage',
      'Works in real-time text chat and voice playback'
    ],
    keywords: ['Sylheti AI', 'first Sylheti chatbot', 'Sylheti language AI', 'Sylheti dialect assistant', 'Bangladeshi regional AI'],
    actionLabel: 'Try Sylheti AI',
    actionUrl: '/'
  },
  {
    id: 'lab-area',
    number: 6,
    badge: 'Developer & Student Hub',
    title: 'Next Lab Area',
    tagline: 'Offline Code Runner, E-Books Library, Camera Studio & Results Portal',
    category: 'Learning & Tools',
    icon: <BookOpen className="w-6 h-6 text-cyan-500" />,
    iconBg: 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600',
    description: 'A comprehensive experimental powerhouse for learners and creators. Features an Offline Code Runner to write and execute HTML/CSS/JavaScript with a live console, a Free E-Books Library to read and download academic and skill books, a TikTok-Style Camera Studio with 10 portable creative filter effects, and an Education Board Results portal with 100% verification pass.',
    howItWorks: [
      'Code Runner: Write HTML/JS code and preview sandbox execution offline without a compiler.',
      'E-Books Library: Browse standard textbooks, guides, and fiction directly in browser.',
      'Camera Studio: Tap Effects for 10 cinematic filters, photo/video recording, and instant download.',
      'Results Checker: Direct top-level access to official Bangladesh Education Board servers.'
    ],
    keyBenefits: [
      'Browser-based offline HTML, CSS, JavaScript testing environment',
      'Direct reading of PDF e-books without mandatory storage downloads',
      'TikTok-style full-bleed camera viewfinder with portable drawer filters',
      'Official examination result portal with 0 anti-bot verification errors'
    ],
    keywords: ['Next Lab', 'offline code runner HTML JS', 'free bangladesh ebooks library', 'web camera studio tiktok filters', 'board results portal'],
    actionLabel: 'Enter Next Lab',
    actionUrl: '/lab'
  },
  {
    id: 'youtube-integration',
    number: 7,
    badge: 'Creator Growth Booster',
    title: 'Direct YouTube Video Integration',
    tagline: 'Boost Channel Views & Watch Time Organically on Feed',
    category: 'Media & Entertainment',
    icon: <Youtube className="w-6 h-6 text-red-500" />,
    iconBg: 'bg-red-100 dark:bg-red-950/40 text-red-600',
    description: 'Next empowers video creators to grow their YouTube audience. By pasting any YouTube link into a post, Next generates a responsive inline player with full playback capability. Followers can watch the video directly on their feed, like, and comment—channeling authentic view counts and watch time to the creator’s YouTube channel.',
    howItWorks: [
      'When creating a post, paste any valid YouTube video URL.',
      'Next automatically renders the HD embedded player in feed and reels.',
      'Views contribute directly to the YouTube video’s official watch metrics.'
    ],
    keyBenefits: [
      'Native playback without redirecting viewers out of the app',
      'Drives organic watch time and view retention to YouTube channels',
      'Enables social discussions, comments, and reactions on YouTube content',
      'Seamless support for regular videos, shorts, and live streams'
    ],
    keywords: ['YouTube video embed social media', 'boost YouTube watch time', 'YouTube creator growth', 'share YouTube on feed'],
    actionLabel: 'Create Post with YouTube',
    actionUrl: '/create-post'
  },
  {
    id: 'content-filter',
    number: 8,
    badge: 'Zero-Tolerance Safety',
    title: 'Safe AI Guardian',
    tagline: 'Instant Pre-Upload & In-Chat Adult Content Filtering',
    category: 'Safety & Settings',
    icon: <ShieldCheck className="w-6 h-6 text-emerald-500" />,
    iconBg: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600',
    description: 'Unlike mainstream networks that rely on slow post-moderation, Next deploys proactive Safe AI Guardian protection. As soon as a user selects an image or video to post or send in chat, it undergoes intelligent real-time analysis. Any explicit or inappropriate media is blocked immediately before uploading, fostering a safe environment for families, students, and children.',
    howItWorks: [
      'Every file selected in feed upload or private chat is scanned immediately.',
      'Explicit, vulgar, or obscene content is rejected instantly with an explanation.',
      'Zero-tolerance policy safeguards user feeds, reels, and private conversations.'
    ],
    keyBenefits: [
      'Proactive pre-upload blocking (not reactive removal after damage is done)',
      'Protects private chat recipients from unsolicited explicit media',
      'Safe environment for young students, children, and families',
      'Strict compliance with international child safety standards'
    ],
    keywords: ['safe social media', 'anti NSFW content filter', 'child safe social network', 'AI content moderation', 'clean family social app'],
    actionLabel: 'Read Child Safety Policy',
    actionUrl: '/child-safety'
  },
  {
    id: 'advanced-settings',
    number: 9,
    badge: 'Full Personalization',
    title: 'Advanced Customization Hub',
    tagline: 'Tailor UI Colors, Nexto Robot Sizing & Navigation Layout',
    category: 'Safety & Settings',
    icon: <Sliders className="w-6 h-6 text-amber-500" />,
    iconBg: 'bg-amber-100 dark:bg-amber-950/40 text-amber-600',
    description: 'Next gives users complete mastery over their app interface. Customize the Nexto Robot size (or hide it from screen), adjust the bottom navigation bar height (Small, Medium, Large), choose custom UI accent colors, toggle Data Saver mode, manage video autoplay, and toggle whether YouTube embeds appear in the Reels feed.',
    howItWorks: [
      'Navigate to Settings from your profile or menu.',
      'Customize themes, haptic feedback, animation speeds, and accent colors.',
      'Scale the Nexto Robot slider to your exact visual preference.'
    ],
    keyBenefits: [
      'Personalized UI theme accent color picker',
      'Custom bottom bar sizing for different mobile screen heights',
      'Data Saver mode to preserve mobile internet bandwidth',
      'Full control over automated video playback and robot visibility'
    ],
    keywords: ['customizable social media app', 'data saver social network', 'custom UI theme color', 'Next settings'],
    actionLabel: 'Customize Settings',
    actionUrl: '/settings'
  },
  {
    id: 'audio-upload',
    number: 10,
    badge: 'Voice Talent Showcase',
    title: 'Audio & Voice Talent Upload',
    tagline: 'Share Podcasts, Recitations, Spoken Poetry & Music',
    category: 'Media & Entertainment',
    icon: <Mic className="w-6 h-6 text-violet-500" />,
    iconBg: 'bg-violet-100 dark:bg-violet-950/40 text-violet-600',
    description: 'Social media is more than just photos and text. Next includes dedicated Audio Upload capabilities allowing voice artists, podcasters, singers, and reciters to share their voice with the world. Posts render with an interactive audio player, custom cover art, and playback progress for a rich listening experience.',
    howItWorks: [
      'Select any audio clip or voice recording during post creation.',
      'Add caption, optional cover artwork, and category.',
      'Listeners enjoy smooth inline playback directly on their feed.'
    ],
    keyBenefits: [
      'Dedicated audio player with seek bar and duration counter',
      'Perfect platform for acoustic musicians, podcasters, and voice artists',
      'Lightweight data streaming friendly to mobile connections',
      'Direct social reactions and comments on audio posts'
    ],
    keywords: ['audio upload social media', 'voice talent platform', 'podcast sharing app', 'audio posts online'],
    actionLabel: 'Share Your Voice',
    actionUrl: '/create-post'
  },
  {
    id: 'marketplace',
    number: 11,
    badge: 'P2P Commerce',
    title: 'Next Marketplace',
    tagline: 'Buy, Sell & Negotiate Directly with Verified Community Members',
    category: 'Learning & Tools',
    icon: <ShoppingBag className="w-6 h-6 text-pink-500" />,
    iconBg: 'bg-pink-100 dark:bg-pink-950/40 text-pink-600',
    description: 'An integrated peer-to-peer community commerce marketplace. Users can list new or pre-loved products with photos, condition, description, and price. Buyers can browse local deals, negotiate directly through Next Messenger, and finalize transactions securely within a trusted network of verified profiles.',
    howItWorks: [
      'Snap photos of the product and set price, title, and description.',
      'Listings appear in community feed with direct "Message Seller" button.',
      'Discuss terms and delivery directly via real-time encrypted chat.'
    ],
    keyBenefits: [
      '0% commission on peer-to-peer community sales',
      'Verified profile badges prevent anonymous scams',
      'Integrated real-time chat with instant photo sharing and typing',
      'Local discovery for textbooks, electronics, gadgets, and services'
    ],
    keywords: ['Next Marketplace', 'buy and sell social network', 'peer to peer marketplace bangladesh', 'sell items online'],
    actionLabel: 'Explore Marketplace',
    actionUrl: '/'
  },
  {
    id: 'ielts',
    number: 12,
    badge: '100% Free Complete Platform',
    title: 'Next IELTS Practice',
    tagline: 'World’s First 100% Free Complete Cambridge Computer-Delivered Mock Tests',
    category: 'Learning & Tools',
    icon: <GraduationCap className="w-6 h-6 text-blue-500" />,
    iconBg: 'bg-blue-100 dark:bg-blue-950/40 text-blue-600',
    description: 'Next IELTS is the world’s first completely free, full-fledged computer-delivered IELTS preparation system. It offers full-length Academic & General Training mock tests with actual test UI, Reading highlighter, Writing band evaluator, and Speaking voice test. Its flagship innovation—Listening x Typing Audio Dictation—plays authentic audio that users transcribe in real-time, sharpening listening accuracy, spelling, and typing speed.',
    howItWorks: [
      'Access Next IELTS directly inside Next Lab or at next-ielts.vercel.app.',
      'Practice full-length Listening, Reading, Writing, and Speaking tests with authentic test timer.',
      'Train daily with Listening x Typing dictation games for rapid band 8+ score improvements.'
    ],
    keyBenefits: [
      '100% Free: No subscriptions, paywalls, or hidden coaching fees',
      'Actual computer-delivered IELTS test simulator with authentic split-screen UI',
      'Unique "Listening x Typing" audio dictation for real-time spelling and hearing training',
      'Integrated band score calculator and instant answer explanations'
    ],
    keywords: ['Next IELTS', 'free IELTS mock test', 'listening x typing IELTS dictation', 'computer delivered IELTS practice', 'Cambridge IELTS online'],
    actionLabel: 'Practice Next IELTS Now',
    actionUrl: '/lab',
    externalUrl: 'https://next-ielts.vercel.app'
  }
];

const FAQ_LIST = [
  {
    q: 'What is Next (Nexto) and what makes it unique?',
    a: 'Next is a high-tech next-generation social media platform engineered by Abdullah Al Mamun (ceoofnext). Beyond standard reels and posts, Next introduces groundbreaking innovations including synchronized Cinema watch parties, serverless P2P Meet video conferencing, real-time keystroke typing in Messenger, floating Nexto AI & regional Sylheti AI, developer Code Runner lab, and the world’s first 100% free Next IELTS practice platform.'
  },
  {
    q: 'How does Next Cinema Watch Party work?',
    a: 'Next Cinema allows two or more friends to watch YouTube videos and movies in synchronized lockstep from different countries. The host creates a theatre code, others join, and playback/pause/seek controls stay in perfect sync while everyone talks via live video and audio call.'
  },
  {
    q: 'What is the Real-Time Keystroke Typing feature in Next Messenger?',
    a: 'Unlike traditional apps that only show a generic "typing..." indicator, Next Messenger offers an optional real-time typing mode. When mutually accepted, users can see the exact characters being typed live as they appear, creating the fastest, most authentic conversation experience possible.'
  },
  {
    q: 'What is Sylheti AI?',
    a: 'Sylheti AI is the world’s first artificial intelligence assistant tailored to speak, understand, and converse naturally in the authentic Sylheti language dialect. Embedded inside Nexto AI, users can chat in Sylheti text and listen to interactive voice guidance.'
  },
  {
    q: 'Is Next safe for families and children?',
    a: 'Yes! Next enforces a strict Safe AI Guardian policy with real-time proactive scanning. Obscene, vulgar, or adult content is detected and blocked before upload both in public feed and private chats, making Next clean and safe for all ages.'
  },
  {
    q: 'Is Next IELTS completely free?',
    a: 'Yes, Next IELTS is 100% free with no hidden fees or subscriptions. It provides full Cambridge computer-delivered mock tests, reading highlighters, speaking audio testers, band score calculators, and the exclusive Listening x Typing dictation trainer.'
  },
  {
    q: 'Who is the creator and developer of Next?',
    a: 'Next (Nexto) was envisioned, designed, and engineered by Abdullah Al Mamun (ceoofnext), a visionary young Bangladeshi software engineer who created this complete high-tech social ecosystem independently.'
  }
];

export const Features: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const categories = ['All', 'Communication', 'AI & Intelligence', 'Media & Entertainment', 'Learning & Tools', 'Safety & Settings'];

  const filteredFeatures = ALL_FEATURES.filter(f => {
    const matchesCat = selectedCategory === 'All' || f.category === selectedCategory;
    const matchesSearch = searchQuery === '' || 
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#000000] text-gray-900 dark:text-gray-100 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-16 md:pb-24 px-4 sm:px-6 lg:px-8 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 via-transparent to-transparent dark:from-blue-950/10 pointer-events-none" />
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[#1877F2] text-xs sm:text-sm font-bold tracking-wide mb-6 shadow-xs">
            <Sparkles size={16} />
            <span>Next Generation Social Media & Innovation Platform</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-gray-900 dark:text-white leading-[1.15] mb-6">
            Where Modern Connection <br className="hidden sm:inline" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#1877F2] via-indigo-500 to-purple-600">
              Meets Frontier Technology.
            </span>
          </h1>

          <p className="max-w-3xl mx-auto text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-300 font-normal leading-relaxed mb-8">
            While traditional social platforms stay confined to endless feeds and outdated reels, <strong>Next</strong> pioneers a full high-tech ecosystem: synchronized Cinema watch parties, encrypted P2P video meetings, real-time keystroke live typing, floating 3D Nexto AI & Sylheti AI, developer lab, and the world’s first 100% free Cambridge IELTS practice platform.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3.5 rounded-2xl bg-[#1877F2] hover:bg-blue-600 active:scale-95 text-white font-bold text-sm sm:text-base shadow-xl shadow-blue-500/25 transition-all flex items-center gap-2"
            >
              <span>Explore Next App</span>
              <ArrowRight size={18} />
            </button>
            <a
              href="#all-features"
              className="px-6 py-3.5 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 text-gray-800 dark:text-gray-200 font-bold text-sm sm:text-base transition-all"
            >
              View 12 Core Features
            </a>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12 pt-8 border-t border-gray-100 dark:border-gray-800/80">
            <div>
              <p className="text-2xl sm:text-3xl font-black text-[#1877F2]">12+</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">High-Tech Innovations</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-purple-500">100%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">Free IELTS Mock Tests</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-green-500">P2P</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">Encrypted Secret Meet</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-amber-500">1st</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">Sylheti Dialect AI</p>
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section id="all-features" className="sticky top-14 z-30 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 py-3.5 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto no-scrollbar py-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-[#1877F2] text-white shadow-md shadow-blue-500/20'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search features or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-800 pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm font-medium border border-transparent focus:border-[#1877F2] focus:bg-white dark:focus:bg-black outline-none transition-all"
            />
          </div>
        </div>
      </section>

      {/* Main Features Grid */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex-1 w-full">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            12 Pioneering Features That Set Next Apart
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-xl mx-auto">
            Discover how Next transforms social communication, learning, privacy, and entertainment into a cohesive modern experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {filteredFeatures.map((feature) => (
            <article
              key={feature.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-7 shadow-sm hover:shadow-xl hover:border-blue-200 dark:hover:border-blue-900/50 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl ${feature.iconBg} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
                      {feature.icon}
                    </div>
                    <div>
                      <span className="text-[11px] font-black tracking-wider text-gray-400 uppercase">
                        Feature #{feature.number}
                      </span>
                      <h3 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white leading-tight">
                        {feature.title}
                      </h3>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-50 dark:bg-blue-950/60 text-[#1877F2] border border-blue-100 dark:border-blue-900/50 whitespace-nowrap">
                    {feature.badge}
                  </span>
                </div>

                {/* Tagline */}
                <p className="text-xs sm:text-sm font-bold text-[#1877F2] dark:text-blue-400 mb-3">
                  {feature.tagline}
                </p>

                {/* Description */}
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-5">
                  {feature.description}
                </p>

                {/* How It Works */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mb-4 border border-gray-100 dark:border-gray-800">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">How It Works:</p>
                  <ul className="space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                    {feature.howItWorks.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/60 text-[#1877F2] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Key Benefits */}
                <div className="mb-5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Key Highlights:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {feature.keyBenefits.map((benefit, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <CheckCircle2 size={12} className="text-emerald-500" />
                        <span>{benefit}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="flex flex-wrap gap-1 max-w-[65%]">
                  {feature.keywords.slice(0, 2).map((kw, idx) => (
                    <span key={idx} className="text-[10px] text-gray-400 font-mono">
                      #{kw.replace(/\s+/g, '')}
                    </span>
                  ))}
                </div>

                {feature.externalUrl ? (
                  <a
                    href={feature.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-[#1877F2] transition-colors"
                  >
                    <span>{feature.actionLabel || 'Try Now'}</span>
                    <ExternalLink size={14} />
                  </a>
                ) : feature.actionUrl ? (
                  <button
                    onClick={() => navigate(feature.actionUrl!)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-[#1877F2] transition-colors"
                  >
                    <span>{feature.actionLabel || 'Try Now'}</span>
                    <ArrowRight size={14} />
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Creator Spotlight */}
      <section className="bg-white dark:bg-gray-900 border-y border-gray-200 dark:border-gray-800 py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-[#1877F2] to-indigo-600 p-1 shadow-xl shrink-0">
            <img
              src="https://i.postimg.cc/wxwt5tsk/retouch-2026030721254774.png"
              alt="Next by Abdullah Al Mamun"
              className="w-full h-full object-cover rounded-2xl bg-white"
            />
          </div>
          <div className="flex-1">
            <span className="text-xs font-bold text-[#1877F2] uppercase tracking-wider">Independent Engineering</span>
            <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mt-1">
              Built with Passion by Abdullah Al Mamun (ceoofnext)
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
              While conventional mega-platforms rely on thousands of legacy engineers to maintain basic feed algorithms, <strong>Next</strong> was independently architected and coded from scratch by a single developer from Bangladesh. Combining modern WebRTC, Gemini AI, PWA offline resilience, and high-performance React, Next proves that visionary solo engineering can outpace industry giants.
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-4 text-xs font-bold text-gray-500">
              <span>Creator: Abdullah Al Mamun</span>
              <span>•</span>
              <span>Handle: @ceoofnext</span>
              <span>•</span>
              <span>Platform: Next (Nexto)</span>
              <span>•</span>
              <a href="https://next-nexto.vercel.app" className="text-[#1877F2] hover:underline">next-nexto.vercel.app</a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section (Rich Search Snippet SEO) */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-14 w-full">
        <div className="text-center mb-8">
          <span className="text-xs font-bold text-[#1877F2] uppercase tracking-wider">Search Engine FAQ</span>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mt-1">
            Frequently Asked Questions
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Everything you need to know about Next features, technology, and usage.
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_LIST.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden transition-all shadow-xs"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-sm sm:text-base text-gray-900 dark:text-white hover:text-[#1877F2] transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#1877F2]' : ''}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-5 sm:px-5 text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-gray-800/80 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-black py-8 px-4 text-center">
        <div className="max-w-2xl mx-auto space-y-4">
          <h3 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
            Experience the Future of Social Media Today
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Join Next to connect with friends, watch movies together, and experience intelligent conversation.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigate('/register')}
              className="px-6 py-2.5 rounded-xl bg-[#1877F2] text-white text-xs sm:text-sm font-bold shadow-md hover:bg-blue-600 transition-all"
            >
              Get Started Free
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs sm:text-sm font-bold hover:bg-gray-200 transition-all"
            >
              Explore Feed
            </button>
          </div>
          <p className="text-[11px] text-gray-400 pt-4">
            Next · Nexto © 2026 by Abdullah Al Mamun (ceoofnext). All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Features;
