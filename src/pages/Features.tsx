import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Tv, Users, MessageCircle, Bot, Sparkles, BookOpen, 
  Youtube, ShieldCheck, Sliders, Mic, ShoppingBag, 
  GraduationCap, ArrowRight, ExternalLink, CheckCircle2, 
  ChevronDown, Search, Heart, Share2, Eye, Shield, Laptop, 
  Zap, Globe, Award, Lock, Smartphone, Copy, Check, Mail, MessageSquare
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
    q: 'Is Next 100% free, secure, and private for all users?',
    a: 'Yes! Next is 100% free forever with no hidden subscriptions, paywalls, or premium tiers. It is built with zero-server storage for private calls, strict encryption, and respects user privacy without invasive ad tracking.'
  },
  {
    q: 'How does Next Meet ensure 100% private and serverless video calls?',
    a: 'Next Meet uses direct Peer-to-Peer (P2P) WebRTC connections with zero central server media storage. Audio, video, and in-room chat pass directly between user devices, making it immune to server leaks, surveillance, or recording.'
  },
  {
    q: 'How does YouTube video integration boost creators\' view counts and watch time?',
    a: 'Creators can paste any YouTube link into a post, and Next automatically embeds the responsive player. Followers watch directly on their feed, sending genuine views and watch time directly to the creator\'s YouTube channel.'
  },
  {
    q: 'Who is the creator and developer of Next?',
    a: 'Next (Nexto / Mamuns App) was envisioned, designed, and independently engineered by Abdullah Al Mamun (ceoofnext), a visionary young Bangladeshi software engineer.'
  }
];

interface LanguageOverview {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  title: string;
  tagline: string;
  summary: string;
  bullets: string[];
}

const GLOBAL_LANGUAGES: LanguageOverview[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🌐',
    title: 'Next (Nexto) – High-Tech Social Media Platform',
    tagline: '100% Free, Private & Secure Social Network by Abdullah Al Mamun',
    summary: 'Next combines synchronized Cinema watch parties, encrypted P2P Meet video calls, real-time keystroke live typing, 3D Nexto AI & Sylheti AI, offline code sandbox, and 100% free Cambridge IELTS preparation into one seamless ecosystem.',
    bullets: [
      'Synchronized Cinema Watch Parties with live video calls',
      'Encrypted P2P Meet with zero central server media logs',
      'Real-time keystroke live typing & view-once confidential notes',
      '100% free forever with no hidden subscriptions or paywalls'
    ]
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    flag: '🇧🇩',
    title: 'নেক্সট (Nexto / মামুনের অ্যাপ) – হাই-টেক সোশ্যাল প্ল্যাটফর্ম',
    tagline: '১০০% ফ্রি, নিরাপদ ও ব্যক্তিগত সোশ্যাল নেটওয়ার্ক | আব্দুল্লাহ আল মামুন',
    summary: 'নেক্সট একটি সম্পূর্ণ নতুন সোশ্যাল প্ল্যাটফর্ম যেখানে সাধারণ সোশ্যাল মিডিয়ার চেয়ে অনেক বেশি উচ্চ প্রযুক্তি রয়েছে। একসাথে সিনেমা দেখার থিয়েটার, গোপন পি২পি এনক্রিপ্টেড মিট কল, লাইভ টাইপিং চ্যাট, নেক্সটো এআই এবং প্রথম সিলেটি এআই সহ সম্পূর্ণ ফ্রি আইইএলটিএস প্র্যাকটিস সিস্টেম।',
    bullets: [
      'বন্ধুদের সাথে সিঙ্ক করা সিনেমা ও ইউটিউব ওয়াচ পার্টি',
      'সার্ভারলেস পি২পি সিক্রেট মিট কল (সার্ভারে কোনো ডেটা থাকে না)',
      'রিয়েল-টাইম কি-স্ট্রোক লাইভ টাইপিং ও ভিউ-ওয়ান্স গোপন বার্তা',
      '১০০% আজীবন ফ্রি, কোনো সাবস্ক্রিপশন বা প্রিমিয়াম ফি নেই'
    ]
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    title: 'Next (Nexto) – Red Social de Alta Tecnología',
    tagline: '100% Gratuita, Privada y Segura por Abdullah Al Mamun',
    summary: 'Next es la plataforma social de próxima generación que combina cine sincronizado con videollamadas en vivo, reuniones P2P cifradas sin registro en servidores, mensajería con escritura en tiempo real tecla por tecla, Nexto AI y práctica de IELTS Cambridge completamente gratis.',
    bullets: [
      'Salas de cine sincronizadas para ver YouTube y películas juntos',
      'Llamadas P2P cifradas directas sin almacenamiento en servidor',
      'Chat con escritura en vivo carácter por carácter y notas efímeras',
      'Totalmente gratis sin suscripciones ni costos ocultos'
    ]
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    title: 'نكست (Next) – منصة التواصل الاجتماعي فائقة التطور',
    tagline: '100% مجانية، خاصة وآمنة بالكامل بواسطة عبد الله المأمون',
    summary: 'نكست هي منصة تواصل اجتماعي تجمع بين صالات السينما المتزامنة، مكالمات فيديو مشفرة مباشرة P2P، محادثة فورية بحروف حية أثناء الكتابة، روبوت الذكاء الاصطناعي Nexto AI، والتحضير الكامل لاختبارات آيلتس مجاناً.',
    bullets: [
      'مشاهدة متزامنة للأفلام واليوتيوب مع مكالمات الفيديو الجماعية',
      'اتصالات فيديو P2P مشفرة بالكامل بدون حفظ أي بيانات بالخادم',
      'رؤية الحروف أثناء كتابتها مباشرة ورسائل ذاتية التدمير',
      'مجانية 100% مدى الحياة بدون أي رسوم اشتراك'
    ]
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    title: 'नेक्स्ट (Next) – हाई-टेक सोशल मीडिया प्लेटफॉर्म',
    tagline: '100% मुफ्त, सुरक्षित और निजी सोशल नेटवर्क | अब्दुल्ला अल मामून',
    summary: 'नेक्स्ट एक क्रांतिकारी सोशल मीडिया नेटवर्क है जो सिंक्रोनाइज़्ड सिनेमा वॉच पार्टी, पी2पी एन्क्रिप्टेड वीडियो मीट, रियल-टाइम कीस्ट्रोक टाइपिंग चैट, नेक्स्टो एआई और पूरी तरह से मुफ्त कैम्ब्रिज आईईएलटीएस तैयारी को एक साथ लाता है।',
    bullets: [
      'दोस्तों के साथ एक साथ यूट्यूब और मूवी देखने का सिनेमा रूम',
      'जीरो-सर्वर स्टोरेज के साथ सुरक्षित पी2पी वीडियो कॉल',
      'रियल-टाइम अक्षर-दर-अक्षर लाइव टाइपिंग और व्यू-वन्स गुप्त नोट्स',
      'हमेशा के लिए 100% फ्री, कोई हिडन चार्ज या सब्सक्रिप्शन नहीं'
    ]
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    title: 'Next (Nexto) – Réseau Social Haute Technologie',
    tagline: '100% Gratuit, Privé et Sécurisé par Abdullah Al Mamun',
    summary: 'Next allie des soirées cinéma synchronisées avec appels vidéo, des réunions vidéo P2P cryptées sans stockage de serveur, une messagerie affichant la frappe en temps réel caractère par caractère et une préparation Cambridge IELTS gratuite.',
    bullets: [
      'Cinéma synchronisé pour regarder des vidéos et films ensemble',
      'Appels vidéo P2P sécurisés sans données sur les serveurs',
      'Frappe au clavier visible en direct et messages éphémères',
      '100% gratuit sans abonnement ni frais cachés'
    ]
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇧🇷',
    title: 'Next (Nexto) – Rede Social de Alta Tecnologia',
    tagline: '100% Gratuita, Privada e Segura por Abdullah Al Mamun',
    summary: 'Next é a inovadora rede social que reúne cinema sincronizado com chamadas ao vivo, reuniões P2P criptografadas sem gravação em servidores centrais, chat com digitação tecla a tecla em tempo real e testes Cambridge IELTS 100% gratuitos.',
    bullets: [
      'Cinema sincronizado para assistir filmes juntos com áudio e vídeo',
      'Vídeo chamadas P2P diretas de máxima segurança sem logs',
      'Digitação em tempo real e mensagens autodestrutivas',
      'Plataforma 100% gratuita para sempre'
    ]
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    title: 'Next (Nexto) – High-Tech Social-Media-Plattform',
    tagline: '100% Kostenlos, Privat & Sicher von Abdullah Al Mamun',
    summary: 'Next revolutioniert moderne soziale Netzwerke durch synchronisiertes Online-Kino, P2P-verschlüsselte Konferenzen ohne zentrale Datenspeicherung, Echtzeit-Tastaturanzeige und kostenlose Cambridge IELTS-Simulationen.',
    bullets: [
      'Synchronisierte Watch-Partys für YouTube und Spielfilme',
      'P2P-verschlüsselte Videoanrufe ohne Server-Logs',
      'Live-Tastatureingabe in Echtzeit und Einmal-Textnotizen',
      'Dauerhaft 100% kostenlos ohne Paywalls'
    ]
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    title: 'Next（ネクスト）– 次世代ハイテクソーシャルメディア',
    tagline: '完全無料・高セキュリティ・プライバシー保護 | Abdullah Al Mamun',
    summary: 'Nextは、映画やYouTubeのリアルタイム同時鑑賞シネマ、完全P2P暗号化ビデオ会議、打鍵がリアルタイムで見えるライブタイピングメッセンジャー、Nexto AI、完全無料のIELTS試験対策を融合した革新的なプラットフォームです。',
    bullets: [
      '動画と映画のリアルタイム同期シネマルーム',
      'サーバーに一切記録を残さないP2P暗号化ビデオ通話',
      '文字ごとのリアルタイムタイピング表示と自動消去メッセージ',
      '完全無料でサブスクリプションや課金は一切なし'
    ]
  },
  {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    title: 'Next (Nexto) – Высокотехнологичная социальная сеть',
    tagline: '100% Бесплатно, Конфиденциально и Безопасно | Abdullah Al Mamun',
    summary: 'Next объединяет синхронизированный онлайн-кинотеатр для совместного просмотра фильмов, зашифрованные P2P видеозвонки без логов на сервере, отображение ввода текста в реальном времени, Nexto AI и 100% бесплатные тесты Cambridge IELTS.',
    bullets: [
      'Синхронный просмотр фильмов и YouTube с видеосвязью',
      'P2P шифрование видеозвонков без сохранения на сервере',
      'Отображение нажатия клавиш в реальном времени и самоуничтожающиеся сообщения',
      '100% бесплатно навсегда без подписок и скрытых платежей'
    ]
  },
  {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    title: 'Next (Nexto) – 前沿高科技社交媒体平台',
    tagline: '100% 免费、安全与注重隐私的社交网络 | Abdullah Al Mamun',
    summary: 'Next 深度整合了多人同步影院边看边聊、零服务器媒体留存的 P2P 加密视频会议、实时按键打字聊天信使、3D 桌面 Nexto AI 以及完全免费的剑桥雅思全套模考系统。',
    bullets: [
      '多人实时同步观影与高清语音视频通话',
      '直接设备端对端 P2P 加密，不留任何服务器日志',
      '实时按键流式打字与阅后即焚私密文本',
      '终生 100% 免费，无任何隐藏收费与付费墙'
    ]
  },
  {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    flag: '🇵🇰',
    title: 'نیکسٹ (Next) – جدید ترین ہائی ٹیک سوشل میڈیا',
    tagline: '100% مفت، محفوظ اور پرائیویٹ | عبداللہ المامون',
    summary: 'نیکسٹ جدید ترین سوشل پلیٹ فارم ہے جس میں سنکرونائزڈ سنیما، خفیہ P2P ویڈیو میٹنگز، ریئل ٹائم ٹائپنگ چیٹ، نیکسٹو اے آئی اور 100% مفت کیمبرج آئی ایل ٹی ایس پریکٹس شامل ہے۔',
    bullets: [
      'ایک ساتھ فلمیں اور یوٹیوب دیکھنے کا سنکرونائزڈ سنیما',
      'سرور لیس P2P ویڈیو کالز بغیر کسی ڈیٹا اسٹوریج کے',
      'ریئل ٹائم کی اسٹروک لائیو ٹائپنگ اور خود بخود مٹنے والے پیغامات',
      'ہمیشہ کے لیے 100% مفت، بغیر کسی فیس یا سبسکرپشن کے'
    ]
  }
];

export const Features: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [selectedLang, setSelectedLang] = useState<string>('en');
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText('abdullahalmamun.next@gmail.com');
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

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

      {/* Creator Spotlight & Official Sponsorship */}
      <section className="bg-white dark:bg-gray-900 border-y border-gray-200 dark:border-gray-800 py-14 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-tr from-[#1877F2] via-indigo-600 to-purple-600 p-1.5 shadow-2xl shrink-0">
              <img
                src="https://i.postimg.cc/wxwt5tsk/retouch-2026030721254774.png"
                alt="Abdullah Al Mamun (ceoofnext) - Creator of Next"
                className="w-full h-full object-cover rounded-2xl bg-white"
              />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="text-xs font-black text-[#1877F2] uppercase tracking-wider bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-900/40">
                  Founder & Lead Software Architect
                </span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-900/40">
                  🇧🇩 From Bangladesh
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                Abdullah Al Mamun (ceoofnext)
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-w-3xl">
                While conventional mega-platforms rely on thousands of legacy engineers to maintain basic feed algorithms, <strong>Next (Nexto / Mamuns App)</strong> was independently architected and coded from scratch by a single developer from Bangladesh. Combining frontier WebRTC, Gemini AI, PWA offline resilience, and high-performance React, Next proves that visionary solo engineering can outpace industry giants.
              </p>
            </div>
          </div>

          {/* Verified Creator Social Channels */}
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-3xl p-6 border border-gray-200/80 dark:border-gray-700/60">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-5 border-b border-gray-200 dark:border-gray-700/60 pb-4">
              <div>
                <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#1877F2]" />
                  <span>Verified Creator Social Channels</span>
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Follow, connect, and verify authentic updates from Abdullah Al Mamun:
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-gray-400 bg-white dark:bg-gray-900 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-800">
                Handle: @ceoofnext
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* WhatsApp */}
              <a
                href="https://wa.me/?text=Hello%20Abdullah%20Al%20Mamun%20(ceoofnext),%20I%20am%20interested%20in%20Next%20sponsorship%20and%20partnership"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-gray-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-gray-200 dark:border-gray-800 hover:border-emerald-500/50 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <MessageSquare size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-bold">WhatsApp</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white truncate group-hover:text-emerald-600">ceoofnext</p>
                </div>
              </a>

              {/* TikTok */}
              <a
                href="https://www.tiktok.com/@ceoofnext"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white flex items-center justify-center shrink-0 font-black text-xs">
                  TT
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-bold">TikTok</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white truncate">@ceoofnext</p>
                </div>
              </a>

              {/* Facebook */}
              <a
                href="https://www.facebook.com/ceoofnext"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-gray-900 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-gray-200 dark:border-gray-800 hover:border-[#1877F2]/50 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-[#1877F2] flex items-center justify-center shrink-0 font-black text-xs">
                  fb
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-bold">Facebook</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white truncate group-hover:text-[#1877F2]">ceoofnext</p>
                </div>
              </a>

              {/* YouTube */}
              <a
                href="https://www.youtube.com/@ceoofnext"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-gray-900 hover:bg-red-50 dark:hover:bg-red-950/40 border border-gray-200 dark:border-gray-800 hover:border-red-500/50 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center shrink-0">
                  <Youtube size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-bold">YouTube</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white truncate group-hover:text-red-600">@ceoofnext</p>
                </div>
              </a>

              {/* Snapchat */}
              <a
                href="https://www.snapchat.com/add/ceoofnext"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-gray-900 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-gray-200 dark:border-gray-800 hover:border-yellow-400 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-yellow-400/20 text-yellow-600 flex items-center justify-center shrink-0 font-black text-xs">
                  👻
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-bold">Snapchat</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white truncate group-hover:text-yellow-600">ceoofnext</p>
                </div>
              </a>

              {/* Instagram */}
              <a
                href="https://www.instagram.com/abdullahalmamun_ceoofnext"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-gray-900 hover:bg-pink-50 dark:hover:bg-pink-950/40 border border-gray-200 dark:border-gray-800 hover:border-pink-500/50 transition-all group"
              >
                <div className="w-8 h-8 rounded-xl bg-pink-500/10 text-pink-600 flex items-center justify-center shrink-0 font-black text-xs">
                  IG
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 font-bold">Instagram</p>
                  <p className="text-xs font-black text-gray-900 dark:text-white truncate group-hover:text-pink-600">@abdullah...</p>
                </div>
              </a>
            </div>

            {/* Official Sponsorship & Media Contact Box */}
            <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200/80 dark:border-blue-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#1877F2]">
                  Brand Sponsorships, Server Funding & Media Inquiries
                </span>
                <p className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                  Interested in sponsoring Next or partnering with the creator? Reach out directly:
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">
                  abdullahalmamun.next@gmail.com
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="px-4 py-2 rounded-xl bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold text-xs border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 transition-all shadow-xs"
                >
                  {copiedEmail ? (
                    <>
                      <Check size={14} className="text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Email Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy Email</span>
                    </>
                  )}
                </button>
                <a
                  href="mailto:abdullahalmamun.next@gmail.com?subject=Sponsorship%20Inquiry%20for%20Next%20App"
                  className="px-4 py-2 rounded-xl bg-[#1877F2] hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20"
                >
                  <Mail size={14} />
                  <span>Send Mail</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Global Multilingual Showcase for International SEO */}
      <section className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-800 py-14 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <span className="text-xs font-bold text-[#1877F2] uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Globe size={16} />
              <span>Global International Network</span>
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mt-1">
              Explore Next in 12 Global Languages
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2">
              Next is built for the entire world. Select any language below to read how Next delivers free, high-tech communication across borders:
            </p>
          </div>

          {/* Language Selector Pills */}
          <div className="flex items-center justify-center gap-2 flex-wrap mb-8">
            {GLOBAL_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setSelectedLang(lang.code)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  selectedLang === lang.code
                    ? 'bg-[#1877F2] text-white shadow-md shadow-blue-500/25 scale-105'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700'
                }`}
              >
                <span>{lang.flag}</span>
                <span>{lang.nativeName}</span>
              </button>
            ))}
          </div>

          {/* Active Language Preview Card */}
          {(() => {
            const active = GLOBAL_LANGUAGES.find(l => l.code === selectedLang) || GLOBAL_LANGUAGES[0];
            return (
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 border border-gray-200 dark:border-gray-800 shadow-sm space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
                  <div>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      {active.name} Overview · {active.flag}
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mt-0.5">
                      {active.title}
                    </h3>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 dark:bg-blue-950/60 text-[#1877F2] border border-blue-100 dark:border-blue-900/50">
                    100% Free Everywhere
                  </span>
                </div>

                <p className="text-xs sm:text-sm font-bold text-[#1877F2] dark:text-blue-400">
                  {active.tagline}
                </p>

                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  {active.summary}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {active.bullets.map((bullet, bIdx) => (
                    <div
                      key={bIdx}
                      className="flex items-start gap-2.5 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800"
                    >
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* 100% Free, Secure & Privacy-First Trust Guarantee */}
      <section className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 py-12 px-4 sm:px-6 text-white shadow-inner">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black uppercase tracking-wider">
              100% Free & Open Ecosystem
            </span>
            <h2 className="text-2xl sm:text-4xl font-black mt-3">
              Uncompromising Privacy. Zero Subscription Paywalls.
            </h2>
            <p className="text-xs sm:text-sm text-blue-100 mt-2 leading-relaxed">
              Why settle for corporate social networks that lock features behind monthly fees and exploit personal data? Next is engineered from the ground up to be 100% free, private, and mathematically secure.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-3 text-white">
                <Award size={24} />
              </div>
              <h4 className="font-extrabold text-base mb-1">100% Free Forever</h4>
              <p className="text-xs text-blue-100">Zero subscriptions, paywalls, or hidden coaching fees. All 12 features are free for everyone.</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-3 text-white">
                <Lock size={24} />
              </div>
              <h4 className="font-extrabold text-base mb-1">Zero Server Media Logs</h4>
              <p className="text-xs text-blue-100">Next Meet and private calls communicate via direct Peer-to-Peer mesh. Your streams never touch a company server.</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-3 text-white">
                <Shield size={24} />
              </div>
              <h4 className="font-extrabold text-base mb-1">Proactive Child Safety</h4>
              <p className="text-xs text-blue-100">Real-time client and server scanning rejects explicit or obscene content before upload in feed and chats.</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-3 text-white">
                <Zap size={24} />
              </div>
              <h4 className="font-extrabold text-base mb-1">Ultra-Fast Performance</h4>
              <p className="text-xs text-blue-100">Sub-100ms hybrid cloud state delivery and offline PWA architecture engineered for low-data mobile usage.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Matrix: Next vs Traditional Social Media */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs font-bold text-[#1877F2] uppercase tracking-wider">High-Tech Benchmark</span>
          <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mt-1">
            Next vs. Traditional Social Media
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2">
            See how Next redefines what a social network can be compared to legacy platforms.
          </p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
                <th className="py-4 px-4 sm:px-6 font-black text-gray-900 dark:text-white">Feature / Technology</th>
                <th className="py-4 px-4 sm:px-6 font-black text-[#1877F2] bg-blue-50/50 dark:bg-blue-950/30">Next (Nexto)</th>
                <th className="py-4 px-4 sm:px-6 font-semibold text-gray-500 dark:text-gray-400">Traditional Social Apps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">100% Free (No Hidden Paywalls)</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-emerald-600 dark:text-emerald-400 bg-blue-50/30 dark:bg-blue-950/20">✓ 100% Free Forever</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">Paid tiers, blue check subscriptions</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">Synchronized Cinema Watch Parties</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-[#1877F2] bg-blue-50/30 dark:bg-blue-950/20">✓ Native YouTube/Movie Sync + Video Call</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">None (Requires 3rd-party extensions)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">Serverless P2P Encrypted Video Meet</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-emerald-600 dark:text-emerald-400 bg-blue-50/30 dark:bg-blue-950/20">✓ Zero Server Media Storage</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">Recorded and routed through company servers</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">Real-Time Keystroke Live Typing</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-[#1877F2] bg-blue-50/30 dark:bg-blue-950/20">✓ Live Character Streaming (Sub-100ms)</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">Only opaque static "typing..." bubbles</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">View-Once Confidential Text Notes</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-emerald-600 dark:text-emerald-400 bg-blue-50/30 dark:bg-blue-950/20">✓ Self-Destructing Text & Media</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">Photos/videos only; no text view-once</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">World's First Regional Dialect AI</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-purple-600 dark:text-purple-400 bg-blue-50/30 dark:bg-blue-950/20">✓ Dedicated Sylheti AI & Nexto Voice Tutor</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">Generic English or standard languages only</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">Complete Cambridge IELTS Platform</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-emerald-600 dark:text-emerald-400 bg-blue-50/30 dark:bg-blue-950/20">✓ 100% Free Mock Tests + Listening x Typing</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">Non-existent (expensive external coaching)</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">Developer Offline Code Runner & E-Books</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-[#1877F2] bg-blue-50/30 dark:bg-blue-950/20">✓ Built-in HTML/CSS/JS Sandbox & Library</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">None</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">Safe AI Anti-NSFW Content Filter</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-emerald-600 dark:text-emerald-400 bg-blue-50/30 dark:bg-blue-950/20">✓ Instant Pre-Upload & In-Chat Blocking</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">Slow reactive user reporting after exposure</td>
              </tr>
              <tr>
                <td className="py-3.5 px-4 sm:px-6 font-bold text-gray-800 dark:text-gray-200">Interface Personalization & Data Saver</td>
                <td className="py-3.5 px-4 sm:px-6 font-extrabold text-[#1877F2] bg-blue-50/30 dark:bg-blue-950/20">✓ UI Colors, Robot Scaling & Custom Sizes</td>
                <td className="py-3.5 px-4 sm:px-6 text-gray-500">Rigid, unchangeable corporate interfaces</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
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
