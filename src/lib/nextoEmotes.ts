export type NextoEmoteCategory =
  | 'greetings'
  | 'acrobatics'
  | 'dance'
  | 'expressions'
  | 'actions'
  | 'tricks';

export type NextoEmoteId =
  // 1. Greetings & Listening (16)
  | 'wave_hi'
  | 'wave_both'
  | 'listen_ear'
  | 'listen_right'
  | 'antenna_radar'
  | 'salute_hand'
  | 'polite_bow'
  | 'welcome_open'
  | 'beckon_come'
  | 'high_five'
  | 'fist_bump'
  | 'blow_kiss'
  | 'peace_pose'
  | 'namaste_hug'
  | 'bye_wave'
  | 'whisper_hear'
  // 2. Flips, Spins & Stunts (17)
  | 'flip'
  | 'frontflip'
  | 'double_flip'
  | 'side_cartwheel'
  | 'barrel'
  | 'spin'
  | 'double_spin'
  | 'helicopter'
  | 'rocket'
  | 'orbit'
  | 'zig_dash'
  | 'moon_gravity'
  | 'superhero'
  | 'matrix_dodge'
  | 'spring_boing'
  | 'back_handspring'
  | 'tornado_drop'
  // 3. Dance & Music (17)
  | 'dance'
  | 'moonwalk'
  | 'discoball'
  | 'headbang'
  | 'robot_dance'
  | 'floss_groove'
  | 'salsa_spin'
  | 'dab'
  | 'double_dab'
  | 'dj_scratch'
  | 'sing_opera'
  | 'beatbox'
  | 'ballet_twirl'
  | 'hype_hop'
  | 'shuffle_step'
  | 'air_guitar'
  | 'conductor'
  // 4. Expressions & Moods (18)
  | 'wink_tilt'
  | 'double_wink'
  | 'laugh'
  | 'giggle'
  | 'love_sway'
  | 'shy'
  | 'shock'
  | 'mind_blown'
  | 'sleepy'
  | 'nap_nod'
  | 'angry_puff'
  | 'cry_dramatic'
  | 'confused'
  | 'thinking'
  | 'proud_smug'
  | 'excited'
  | 'dizzy'
  | 'facepalm'
  // 5. Playful & Actions (16)
  | 'peek'
  | 'peek_left'
  | 'peek_right'
  | 'peek_top'
  | 'nod'
  | 'headshake'
  | 'shrug'
  | 'cheer'
  | 'clap'
  | 'victory'
  | 'karate'
  | 'boxing'
  | 'flex_strong'
  | 'pointing'
  | 'talk_chat'
  | 'surprise_boo'
  // 6. Cute Tricks & Ears (16)
  | 'ear_wiggle'
  | 'ear_flop'
  | 'antenna_spark'
  | 'zen'
  | 'bounce'
  | 'shiver'
  | 'look_around'
  | 'eye_roll'
  | 'sneeze'
  | 'hiccup'
  | 'stretch'
  | 'hide_shy'
  | 'cover_ears'
  | 'heart_beat'
  | 'wave_surf'
  | 'party_popper';

export type AnyNextoEmoteId = NextoEmoteId | `custom:${string}`;

export interface NextoEmoteMeta {
  id: NextoEmoteId;
  label: string;
  emoji: string;
  duration: number;
  category: NextoEmoteCategory;
}

export type RobotEmoteEyeExpression = 'normal' | 'happy' | 'wink' | 'wide';
export type RobotEmoteBounceStyle = 'none' | 'gentle' | 'energetic' | 'spin' | 'flip';

export interface RobotEmote {
  id: string;
  name: string;
  icon: string;
  duration: number;
  headTiltZ: number;
  headTiltX: number;
  headTurnY: number;
  leftArmRaise: number;
  leftArmWave: boolean;
  rightArmRaise: number;
  rightArmWave: boolean;
  bounceStyle: RobotEmoteBounceStyle;
  antennaWiggle: number;
  eyeExpression: RobotEmoteEyeExpression;
  cheekGlow: number;
  speed: number;
}

export const CUSTOM_EMOTES_STORAGE_KEY = 'nexto_custom_emotes';

export const NEXTO_EMOTE_CATEGORIES: { id: 'all' | NextoEmoteCategory | 'custom'; label: string }[] = [
  { id: 'all', label: 'All (100)' },
  { id: 'greetings', label: 'Greetings & Listen' },
  { id: 'acrobatics', label: 'Flips & Stunts' },
  { id: 'dance', label: 'Dance & Music' },
  { id: 'expressions', label: 'Moods & Faces' },
  { id: 'actions', label: 'Actions & Hands' },
  { id: 'tricks', label: 'Ears & Cute Tricks' },
  { id: 'custom', label: 'My Custom' },
];

export const NEXTO_EMOTES: NextoEmoteMeta[] = [
  // 1. Greetings & Listening (16)
  { id: 'wave_hi', label: 'Wave Hi', emoji: '👋', duration: 1.25, category: 'greetings' },
  { id: 'wave_both', label: 'Double Wave', emoji: '🙋', duration: 1.3, category: 'greetings' },
  { id: 'listen_ear', label: 'Cup Left Ear', emoji: '👂', duration: 1.6, category: 'greetings' },
  { id: 'listen_right', label: 'Cup Right Ear', emoji: '🎧', duration: 1.6, category: 'greetings' },
  { id: 'antenna_radar', label: 'Radar Listen', emoji: '📡', duration: 1.45, category: 'greetings' },
  { id: 'salute_hand', label: 'Crisp Salute', emoji: '🫡', duration: 1.2, category: 'greetings' },
  { id: 'polite_bow', label: 'Polite Bow', emoji: '🙇', duration: 1.2, category: 'greetings' },
  { id: 'welcome_open', label: 'Open Hug', emoji: '🤗', duration: 1.3, category: 'greetings' },
  { id: 'beckon_come', label: 'Come Here', emoji: '🫳', duration: 1.25, category: 'greetings' },
  { id: 'high_five', label: 'High Five!', emoji: '✋', duration: 1.0, category: 'greetings' },
  { id: 'fist_bump', label: 'Fist Bump', emoji: '👊', duration: 1.0, category: 'greetings' },
  { id: 'blow_kiss', label: 'Blow Kiss', emoji: '😘', duration: 1.3, category: 'greetings' },
  { id: 'peace_pose', label: 'Idol Pose', emoji: '✌️', duration: 1.15, category: 'greetings' },
  { id: 'namaste_hug', label: 'Namaste Bow', emoji: '🙏', duration: 1.35, category: 'greetings' },
  { id: 'bye_wave', label: 'Bye-Bye Wave', emoji: '🫶', duration: 1.35, category: 'greetings' },
  { id: 'whisper_hear', label: 'Lean & Listen', emoji: '🤫', duration: 1.55, category: 'greetings' },

  // 2. Flips, Spins & Stunts (17)
  { id: 'flip', label: 'Backflip', emoji: '🔄', duration: 0.78, category: 'acrobatics' },
  { id: 'frontflip', label: 'Frontflip', emoji: '🤸', duration: 0.78, category: 'acrobatics' },
  { id: 'double_flip', label: 'Double Flip', emoji: '💫', duration: 1.0, category: 'acrobatics' },
  { id: 'side_cartwheel', label: 'Cartwheel', emoji: '⭐', duration: 0.95, category: 'acrobatics' },
  { id: 'barrel', label: 'Barrel Roll', emoji: '🛩️', duration: 0.84, category: 'acrobatics' },
  { id: 'spin', label: '360° Spin', emoji: '🌀', duration: 0.74, category: 'acrobatics' },
  { id: 'double_spin', label: '720° Spin', emoji: '🌪️', duration: 1.0, category: 'acrobatics' },
  { id: 'helicopter', label: 'Helicopter', emoji: '🚁', duration: 1.25, category: 'acrobatics' },
  { id: 'rocket', label: 'Rocket Launch', emoji: '🚀', duration: 1.12, category: 'acrobatics' },
  { id: 'orbit', label: 'Mini Orbit', emoji: '🪐', duration: 1.3, category: 'acrobatics' },
  { id: 'zig_dash', label: 'Zig-Zag Dash', emoji: '⚡', duration: 0.95, category: 'acrobatics' },
  { id: 'moon_gravity', label: 'Zero-G Float', emoji: '👨‍🚀', duration: 1.5, category: 'acrobatics' },
  { id: 'superhero', label: 'Hero Pose', emoji: '🦸', duration: 1.25, category: 'acrobatics' },
  { id: 'matrix_dodge', label: 'Matrix Dodge', emoji: '🕶️', duration: 1.25, category: 'acrobatics' },
  { id: 'spring_boing', label: 'Spring Boing', emoji: '🪀', duration: 1.1, category: 'acrobatics' },
  { id: 'back_handspring', label: 'Handspring', emoji: '🤸‍♂️', duration: 0.92, category: 'acrobatics' },
  { id: 'tornado_drop', label: 'Hero Drop', emoji: '☄️', duration: 1.15, category: 'acrobatics' },

  // 3. Dance & Music (17)
  { id: 'dance', label: 'Groove Dance', emoji: '💃', duration: 1.35, category: 'dance' },
  { id: 'moonwalk', label: 'Moonwalk Glide', emoji: '🕺', duration: 1.4, category: 'dance' },
  { id: 'discoball', label: 'Disco Point', emoji: '🪩', duration: 1.4, category: 'dance' },
  { id: 'headbang', label: 'Rock Headbang', emoji: '🤘', duration: 1.25, category: 'dance' },
  { id: 'robot_dance', label: 'Pop-Lock Step', emoji: '🤖', duration: 1.5, category: 'dance' },
  { id: 'floss_groove', label: 'Floss Swing', emoji: '🎶', duration: 1.3, category: 'dance' },
  { id: 'salsa_spin', label: 'Salsa Spin', emoji: '🌹', duration: 1.25, category: 'dance' },
  { id: 'dab', label: 'Cool Dab', emoji: '😎', duration: 1.05, category: 'dance' },
  { id: 'double_dab', label: 'Double Dab', emoji: '🔥', duration: 1.35, category: 'dance' },
  { id: 'dj_scratch', label: 'DJ Scratch', emoji: '🎛️', duration: 1.35, category: 'dance' },
  { id: 'sing_opera', label: 'Sing Opera', emoji: '🎤', duration: 1.45, category: 'dance' },
  { id: 'beatbox', label: 'Beatbox Jam', emoji: '🗣️', duration: 1.25, category: 'dance' },
  { id: 'ballet_twirl', label: 'Ballet Twirl', emoji: '🩰', duration: 1.4, category: 'dance' },
  { id: 'hype_hop', label: 'Party Pump', emoji: '🎵', duration: 1.25, category: 'dance' },
  { id: 'shuffle_step', label: 'Shuffle Step', emoji: '👟', duration: 1.3, category: 'dance' },
  { id: 'air_guitar', label: 'Air Guitar', emoji: '🎸', duration: 1.4, category: 'dance' },
  { id: 'conductor', label: 'Maestro Wave', emoji: '🎼', duration: 1.45, category: 'dance' },

  // 4. Expressions & Moods (18)
  { id: 'wink_tilt', label: 'Cute Wink', emoji: '😉', duration: 1.1, category: 'expressions' },
  { id: 'double_wink', label: 'Twin Wink', emoji: '😜', duration: 1.3, category: 'expressions' },
  { id: 'laugh', label: 'Belly Laugh', emoji: '😂', duration: 1.25, category: 'expressions' },
  { id: 'giggle', label: 'Shy Giggle', emoji: '🤭', duration: 1.2, category: 'expressions' },
  { id: 'love_sway', label: 'Heart Sway', emoji: '🥰', duration: 1.35, category: 'expressions' },
  { id: 'shy', label: 'Super Shy', emoji: '😊', duration: 1.25, category: 'expressions' },
  { id: 'shock', label: 'Shocked Gasp', emoji: '😱', duration: 1.0, category: 'expressions' },
  { id: 'mind_blown', label: 'Mind Blown', emoji: '🤯', duration: 1.25, category: 'expressions' },
  { id: 'sleepy', label: 'Sleepy Yawn', emoji: '😴', duration: 1.55, category: 'expressions' },
  { id: 'nap_nod', label: 'Sleepy Nod', emoji: '💤', duration: 1.45, category: 'expressions' },
  { id: 'angry_puff', label: 'Cute Grump', emoji: '😤', duration: 1.15, category: 'expressions' },
  { id: 'cry_dramatic', label: 'Wipe Tears', emoji: '😭', duration: 1.35, category: 'expressions' },
  { id: 'confused', label: 'Head Scratch', emoji: '😕', duration: 1.3, category: 'expressions' },
  { id: 'thinking', label: 'Chin Think', emoji: '🤔', duration: 1.4, category: 'expressions' },
  { id: 'proud_smug', label: 'Proud Pose', emoji: '😏', duration: 1.2, category: 'expressions' },
  { id: 'excited', label: 'Hyper Happy', emoji: '🤩', duration: 1.15, category: 'expressions' },
  { id: 'dizzy', label: 'Dizzy Wobble', emoji: '😵', duration: 1.35, category: 'expressions' },
  { id: 'facepalm', label: 'Cute Facepalm', emoji: '🤦', duration: 1.3, category: 'expressions' },

  // 5. Playful & Actions (16)
  { id: 'peek', label: 'Peek-a-Boo', emoji: '👀', duration: 1.25, category: 'actions' },
  { id: 'peek_left', label: 'Peek Left', emoji: '👈', duration: 1.1, category: 'actions' },
  { id: 'peek_right', label: 'Peek Right', emoji: '👉', duration: 1.1, category: 'actions' },
  { id: 'peek_top', label: 'Sneaky Peek', emoji: '🫣', duration: 1.25, category: 'actions' },
  { id: 'nod', label: 'Yes! Nod', emoji: '🙂', duration: 0.95, category: 'actions' },
  { id: 'headshake', label: 'No! Shake', emoji: '🙅', duration: 1.05, category: 'actions' },
  { id: 'shrug', label: 'Cute Shrug', emoji: '🤷', duration: 1.15, category: 'actions' },
  { id: 'cheer', label: 'Y-Cheer Jump', emoji: '🙌', duration: 1.0, category: 'actions' },
  { id: 'clap', label: 'Brisk Clap', emoji: '👏', duration: 1.15, category: 'actions' },
  { id: 'victory', label: 'Trophy Spin', emoji: '🏆', duration: 1.2, category: 'actions' },
  { id: 'karate', label: 'Karate Chop', emoji: '🥋', duration: 1.05, category: 'actions' },
  { id: 'boxing', label: 'Shadow Box', emoji: '🥊', duration: 1.2, category: 'actions' },
  { id: 'flex_strong', label: 'Double Flex', emoji: '💪', duration: 1.25, category: 'actions' },
  { id: 'pointing', label: 'Aha! Idea', emoji: '☝️', duration: 1.1, category: 'actions' },
  { id: 'talk_chat', label: 'Lively Chat', emoji: '💬', duration: 1.35, category: 'actions' },
  { id: 'surprise_boo', label: 'Playful Boo!', emoji: '👻', duration: 1.05, category: 'actions' },

  // 6. Cute Tricks & Ears (16)
  { id: 'ear_wiggle', label: 'Bunny Ears', emoji: '🐰', duration: 1.2, category: 'tricks' },
  { id: 'ear_flop', label: 'Puppy Ear Flop', emoji: '🐶', duration: 1.25, category: 'tricks' },
  { id: 'antenna_spark', label: 'Antenna Swirl', emoji: '✨', duration: 1.2, category: 'tricks' },
  { id: 'zen', label: 'Zen Levitate', emoji: '🧘', duration: 1.55, category: 'tricks' },
  { id: 'bounce', label: 'Jelly Bounce', emoji: '🏀', duration: 0.95, category: 'tricks' },
  { id: 'shiver', label: 'Brrr Shiver', emoji: '🥶', duration: 0.95, category: 'tricks' },
  { id: 'look_around', label: 'Scout Look', emoji: '🧐', duration: 1.5, category: 'tricks' },
  { id: 'eye_roll', label: 'Sassy Head Roll', emoji: '🙃', duration: 1.2, category: 'tricks' },
  { id: 'sneeze', label: 'Achoo! Sneeze', emoji: '🤧', duration: 1.2, category: 'tricks' },
  { id: 'hiccup', label: 'Cute Hiccup', emoji: '🫧', duration: 1.2, category: 'tricks' },
  { id: 'stretch', label: 'Morning Stretch', emoji: '🙆', duration: 1.4, category: 'tricks' },
  { id: 'hide_shy', label: 'Cover Eyes', emoji: '🙈', duration: 1.3, category: 'tricks' },
  { id: 'cover_ears', label: 'Cover Ears', emoji: '🙉', duration: 1.3, category: 'tricks' },
  { id: 'heart_beat', label: 'Heartbeat Pop', emoji: '💓', duration: 1.15, category: 'tricks' },
  { id: 'wave_surf', label: 'Wave Surf', emoji: '🏄', duration: 1.35, category: 'tricks' },
  { id: 'party_popper', label: 'Confetti Spin', emoji: '🎉', duration: 1.2, category: 'tricks' },
];

export const DEFAULT_ROBOT_EMOTE: NextoEmoteId = 'flip';

export function isBuiltinNextoEmote(val: string | null | undefined): val is NextoEmoteId {
  return NEXTO_EMOTES.some((e) => e.id === val);
}

export function isCustomEmoteId(val: string | null | undefined): val is `custom:${string}` {
  return typeof val === 'string' && val.startsWith('custom:');
}

export function getCustomNextoEmotes(): RobotEmote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_EMOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomNextoEmotes(emotes: RobotEmote[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_EMOTES_STORAGE_KEY, JSON.stringify(emotes));
  } catch {}
}

export function createDefaultCustomEmote(): RobotEmote {
  return {
    id: `custom:${Date.now()}`,
    name: 'My Custom Wave',
    icon: '🌟',
    duration: 1.4,
    headTiltZ: 0.18,
    headTiltX: -0.06,
    headTurnY: 0.14,
    leftArmRaise: 0.45,
    leftArmWave: false,
    rightArmRaise: 1.65,
    rightArmWave: true,
    bounceStyle: 'gentle',
    antennaWiggle: 0.55,
    eyeExpression: 'happy',
    cheekGlow: 0.65,
    speed: 1.1,
  };
}

export function isValidNextoEmote(val: string | null | undefined): val is AnyNextoEmoteId {
  if (!val) return false;
  if (isBuiltinNextoEmote(val)) return true;
  if (isCustomEmoteId(val)) {
    return getCustomNextoEmotes().some((c) => c.id === val);
  }
  return false;
}

export interface NextoPose {
  bodyPosX: number;
  bodyPosY: number;
  bodyPosZ: number;
  bodyRotX: number;
  bodyRotY: number;
  bodyRotZ: number;
  bodyScaleX: number;
  bodyScaleY: number;
  bodyScaleZ: number;
  headRotX: number;
  headRotY: number;
  headRotZ: number;
  leftArmRotX: number;
  leftArmRotY: number;
  leftArmRotZ: number;
  rightArmRotX: number;
  rightArmRotY: number;
  rightArmRotZ: number;
  leftEarRotX: number;
  leftEarRotZ: number;
  rightEarRotX: number;
  rightEarRotZ: number;
  leftEyeScaleX: number;
  leftEyeScaleY: number;
  rightEyeScaleX: number;
  rightEyeScaleY: number;
  mouthScaleX: number;
  mouthScaleY: number;
  cheekScale: number;
}

export function createNeutralPose(): NextoPose {
  return {
    bodyPosX: 0,
    bodyPosY: 0,
    bodyPosZ: 0,
    bodyRotX: 0,
    bodyRotY: 0,
    bodyRotZ: 0,
    bodyScaleX: 1,
    bodyScaleY: 1,
    bodyScaleZ: 1,
    headRotX: 0,
    headRotY: 0,
    headRotZ: 0,
    leftArmRotX: 0,
    leftArmRotY: 0,
    leftArmRotZ: 0,
    rightArmRotX: 0,
    rightArmRotY: 0,
    rightArmRotZ: 0,
    leftEarRotX: 0,
    leftEarRotZ: 0,
    rightEarRotX: 0,
    rightEarRotZ: 0,
    leftEyeScaleX: 1,
    leftEyeScaleY: 1,
    rightEyeScaleX: 1,
    rightEyeScaleY: 1,
    mouthScaleX: 1,
    mouthScaleY: 1,
    cheekScale: 1,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function holdBell(p: number): number {
  if (p < 0.2) return easeInOutCubic(p / 0.2);
  if (p > 0.8) return easeInOutCubic((1 - p) / 0.2);
  return 1;
}

function applyEyeMood(
  pose: NextoPose,
  mood: RobotEmoteEyeExpression,
  blend: number,
  winkSide: 'left' | 'right' = 'right'
): void {
  if (mood === 'happy') {
    pose.leftEyeScaleX = 1 + 0.16 * blend;
    pose.rightEyeScaleX = 1 + 0.16 * blend;
    pose.leftEyeScaleY = 1 - 0.44 * blend;
    pose.rightEyeScaleY = 1 - 0.44 * blend;
  } else if (mood === 'wink') {
    if (winkSide === 'left') {
      pose.leftEyeScaleY = 1 - 0.86 * blend;
      pose.leftEyeScaleX = 1 + 0.1 * blend;
    } else {
      pose.rightEyeScaleY = 1 - 0.86 * blend;
      pose.rightEyeScaleX = 1 + 0.1 * blend;
    }
  } else if (mood === 'wide') {
    pose.leftEyeScaleX = 1 + 0.1 * blend;
    pose.rightEyeScaleX = 1 + 0.1 * blend;
    pose.leftEyeScaleY = 1 + 0.16 * blend;
    pose.rightEyeScaleY = 1 + 0.16 * blend;
  }
}

export function evaluateCustomRobotEmote(emote: RobotEmote, p: number): NextoPose {
  const pose = createNeutralPose();
  const clampedP = Math.max(0, Math.min(1, p));
  const blend = Math.min(1, Math.sin(Math.PI * clampedP) * 1.45);
  const t = clampedP * Math.max(0.4, emote.speed) * Math.PI * 4.2;

  pose.headRotZ = emote.headTiltZ * blend;
  pose.headRotX = emote.headTiltX * blend;
  pose.headRotY = emote.headTurnY * blend;

  const leftWave = emote.leftArmWave ? Math.sin(t * 1.6) * 0.34 : 0;
  const rightWave = emote.rightArmWave ? Math.sin(t * 1.6) * 0.34 : 0;

  pose.leftArmRotZ = (-emote.leftArmRaise - leftWave) * blend;
  pose.rightArmRotZ = (emote.rightArmRaise + rightWave) * blend;
  if (emote.leftArmRaise > 0.4) pose.leftArmRotX = -0.3 * blend;
  if (emote.rightArmRaise > 0.4) pose.rightArmRotX = -0.3 * blend;

  const ant = emote.antennaWiggle * 0.32;
  pose.leftEarRotZ = Math.sin(t * 1.4) * ant * blend;
  pose.rightEarRotZ = -Math.sin(t * 1.4) * ant * blend;
  pose.leftEarRotX = Math.cos(t * 1.1) * ant * 0.65 * blend;
  pose.rightEarRotX = Math.cos(t * 1.1) * ant * 0.65 * blend;

  if (emote.bounceStyle === 'gentle') {
    pose.bodyPosY = Math.abs(Math.sin(t * 0.8)) * 0.12 * blend;
  } else if (emote.bounceStyle === 'energetic') {
    const hop = Math.abs(Math.sin(t * 1.4));
    pose.bodyPosY = hop * 0.24 * blend;
    pose.bodyScaleY = 1 + (hop - 0.35) * 0.1 * blend;
    pose.bodyScaleX = 1 - (hop - 0.35) * 0.05 * blend;
    pose.bodyScaleZ = pose.bodyScaleX;
  } else if (emote.bounceStyle === 'spin') {
    pose.bodyRotY = easeInOutCubic(clampedP) * Math.PI * 2;
    pose.bodyPosY = Math.sin(Math.PI * clampedP) * 0.16;
  } else if (emote.bounceStyle === 'flip') {
    pose.bodyRotX = -easeInOutCubic(clampedP) * Math.PI * 2;
    pose.bodyPosY = Math.sin(Math.PI * clampedP) * 0.26;
  }

  applyEyeMood(pose, emote.eyeExpression, blend);
  pose.cheekScale = 1 + emote.cheekGlow * 0.1 * blend;
  pose.mouthScaleY = 1 + (emote.eyeExpression === 'happy' ? 0.25 : 0.1) * blend;

  return pose;
}

export function evaluateNextoEmote(id: NextoEmoteId, p: number): NextoPose {
  const pose = createNeutralPose();
  const ease = easeInOutCubic(p);
  const bell = Math.sin(p * Math.PI);
  const hold = holdBell(p);

  switch (id) {
    // ================= 1. GREETINGS & LISTENING (16) =================
    case 'wave_hi': {
      pose.bodyRotZ = -0.06 * hold;
      pose.headRotZ = 0.14 * hold;
      pose.headRotY = 0.1 * hold;
      pose.rightArmRotZ = hold * (1.72 + Math.sin(p * Math.PI * 7) * 0.32);
      pose.rightArmRotX = -0.45 * hold;
      pose.leftArmRotZ = -0.18 * hold;
      pose.leftEarRotZ = 0.14 * hold;
      pose.rightEarRotZ = -0.14 * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.mouthScaleY = 1 + 0.2 * hold;
      break;
    }
    case 'wave_both': {
      const wave = Math.sin(p * Math.PI * 6) * 0.32;
      pose.bodyPosY = Math.abs(Math.sin(p * Math.PI * 3)) * 0.14 * hold;
      pose.headRotZ = Math.sin(p * Math.PI * 3) * 0.14 * hold;
      pose.leftArmRotZ = -hold * (1.72 + wave);
      pose.rightArmRotZ = hold * (1.72 - wave);
      pose.leftArmRotX = -0.35 * hold;
      pose.rightArmRotX = -0.35 * hold;
      pose.leftEarRotZ = 0.2 * hold;
      pose.rightEarRotZ = -0.2 * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.mouthScaleY = 1 + 0.25 * hold;
      break;
    }
    case 'listen_ear': {
      pose.bodyRotY = 0.3 * hold;
      pose.bodyRotZ = -0.12 * hold;
      pose.headRotY = 0.38 * hold;
      pose.headRotZ = -0.22 * hold;
      pose.headRotX = 0.06 * hold;
      pose.leftArmRotZ = -1.78 * hold;
      pose.leftArmRotX = -0.58 * hold;
      pose.leftEarRotZ = (0.28 + Math.sin(p * Math.PI * 5) * 0.08) * hold;
      pose.leftEarRotX = 0.24 * hold;
      break;
    }
    case 'listen_right': {
      pose.bodyRotY = -0.3 * hold;
      pose.bodyRotZ = 0.12 * hold;
      pose.headRotY = -0.38 * hold;
      pose.headRotZ = 0.22 * hold;
      pose.headRotX = 0.06 * hold;
      pose.rightArmRotZ = 1.78 * hold;
      pose.rightArmRotX = -0.58 * hold;
      pose.rightEarRotZ = (-0.28 - Math.sin(p * Math.PI * 5) * 0.08) * hold;
      pose.rightEarRotX = 0.24 * hold;
      break;
    }
    case 'antenna_radar': {
      const scan = Math.sin(p * Math.PI * 6);
      pose.headRotY = Math.sin(p * Math.PI * 2) * 0.36 * hold;
      pose.headRotX = -0.08 * hold;
      pose.leftEarRotZ = (0.22 + scan * 0.2) * hold;
      pose.rightEarRotZ = (-0.22 + scan * 0.2) * hold;
      pose.leftEarRotX = Math.cos(p * Math.PI * 6) * 0.3 * hold;
      pose.rightEarRotX = -Math.cos(p * Math.PI * 6) * 0.3 * hold;
      pose.leftArmRotZ = -0.4 * hold;
      pose.rightArmRotZ = 0.4 * hold;
      applyEyeMood(pose, 'wide', hold);
      break;
    }
    case 'salute_hand': {
      pose.bodyPosY = 0.06 * hold;
      pose.headRotX = -0.08 * hold;
      pose.headRotZ = -0.08 * hold;
      pose.rightArmRotZ = 1.82 * hold;
      pose.rightArmRotX = -0.78 * hold;
      pose.leftArmRotZ = -0.15 * hold;
      pose.leftEarRotZ = -0.12 * hold;
      pose.rightEarRotZ = 0.12 * hold;
      break;
    }
    case 'polite_bow': {
      pose.bodyRotX = 0.34 * hold;
      pose.headRotX = 0.28 * hold;
      pose.bodyPosY = -0.08 * hold;
      pose.leftArmRotX = -0.55 * hold;
      pose.rightArmRotX = -0.55 * hold;
      pose.leftArmRotZ = -0.14 * hold;
      pose.rightArmRotZ = 0.14 * hold;
      pose.leftEarRotX = 0.22 * hold;
      pose.rightEarRotX = 0.22 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;
    }
    case 'welcome_open': {
      pose.bodyPosZ = 0.16 * hold;
      pose.bodyPosY = 0.08 * hold;
      pose.headRotZ = -0.1 * hold;
      pose.leftArmRotZ = -1.35 * hold;
      pose.rightArmRotZ = 1.35 * hold;
      pose.leftArmRotX = -0.82 * hold;
      pose.rightArmRotX = -0.82 * hold;
      pose.leftEarRotZ = 0.2 * hold;
      pose.rightEarRotZ = -0.2 * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.cheekScale = 1 + 0.08 * hold;
      pose.mouthScaleY = 1 + 0.28 * hold;
      break;
    }
    case 'beckon_come': {
      const beck = Math.max(0, Math.sin(p * Math.PI * 5));
      pose.headRotX = 0.1 * hold;
      pose.headRotY = -0.16 * hold;
      pose.rightArmRotX = (-0.8 - beck * 0.55) * hold;
      pose.rightArmRotZ = 0.48 * hold;
      pose.leftEarRotZ = 0.14 * hold;
      pose.rightEarRotZ = -0.14 * hold;
      break;
    }
    case 'high_five': {
      const hit = p > 0.35 && p < 0.7 ? Math.sin(((p - 0.35) / 0.35) * Math.PI) : 0;
      pose.bodyPosY = bell * 0.18;
      pose.bodyPosZ = hit * 0.22;
      pose.rightArmRotZ = 1.75 * bell;
      pose.rightArmRotX = (-0.65 - hit * 0.55) * bell;
      pose.headRotZ = -0.12 * bell;
      applyEyeMood(pose, 'happy', bell);
      pose.mouthScaleY = 1 + 0.28 * bell;
      break;
    }
    case 'fist_bump': {
      const punch = Math.sin(p * Math.PI);
      pose.bodyPosZ = punch * 0.24;
      pose.bodyRotY = -0.2 * punch;
      pose.rightArmRotX = -1.38 * punch;
      pose.rightArmRotZ = 0.2 * punch;
      pose.headRotX = 0.08 * punch;
      break;
    }
    case 'blow_kiss': {
      if (p < 0.45) {
        const k = easeInOutCubic(p / 0.45);
        pose.rightArmRotZ = 0.75 * k;
        pose.rightArmRotX = -1.35 * k;
        pose.headRotZ = -0.14 * k;
        applyEyeMood(pose, 'wink', k, 'right');
        pose.mouthScaleX = 0.9;
      } else {
        const send = Math.sin(((p - 0.45) / 0.55) * Math.PI);
        pose.bodyPosZ = 0.14 * send;
        pose.rightArmRotZ = 1.25 * send;
        pose.rightArmRotX = -1.42 * send;
        pose.headRotZ = -0.12 * send;
        pose.headRotX = -0.1 * send;
        applyEyeMood(pose, 'wink', send, 'right');
        pose.cheekScale = 1 + 0.09 * send;
      }
      break;
    }
    case 'peace_pose': {
      pose.bodyRotZ = -0.08 * hold;
      pose.headRotZ = 0.22 * hold;
      pose.headRotY = -0.18 * hold;
      pose.rightArmRotZ = 1.8 * hold;
      pose.rightArmRotX = -0.45 * hold;
      pose.leftArmRotZ = -0.45 * hold;
      pose.leftEarRotZ = 0.2 * hold;
      pose.rightEarRotZ = -0.2 * hold;
      applyEyeMood(pose, 'wink', hold, 'left');
      break;
    }
    case 'namaste_hug': {
      pose.bodyRotX = 0.16 * hold;
      pose.headRotX = 0.22 * hold;
      pose.leftArmRotX = -1.28 * hold;
      pose.rightArmRotX = -1.28 * hold;
      pose.leftArmRotZ = 0.36 * hold;
      pose.rightArmRotZ = -0.36 * hold;
      pose.leftEarRotX = 0.2 * hold;
      pose.rightEarRotX = 0.2 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;
    }
    case 'bye_wave': {
      pose.bodyRotZ = 0.08 * hold;
      pose.headRotZ = -0.16 * hold;
      pose.leftArmRotZ = -hold * (1.72 + Math.sin(p * Math.PI * 5) * 0.3);
      pose.leftArmRotX = -0.38 * hold;
      pose.leftEarRotZ = 0.22 * hold;
      pose.rightEarRotZ = -0.22 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;
    }
    case 'whisper_hear': {
      pose.bodyPosZ = 0.24 * hold;
      pose.bodyRotY = 0.42 * hold;
      pose.headRotY = 0.46 * hold;
      pose.headRotZ = -0.24 * hold;
      pose.leftArmRotZ = -1.82 * hold;
      pose.leftArmRotX = -0.52 * hold;
      pose.rightArmRotX = -0.85 * hold;
      pose.leftEarRotZ = 0.32 * hold;
      pose.leftEarRotX = 0.18 * hold;
      applyEyeMood(pose, 'wide', hold);
      break;
    }

    // ================= 2. FLIPS, SPINS & STUNTS (17) =================
    case 'flip':
      pose.bodyRotX = -ease * Math.PI * 2;
      pose.bodyPosY = bell * 0.28;
      pose.bodyRotZ = Math.sin(p * Math.PI * 2) * 0.1;
      pose.leftArmRotZ = -bell * 0.6;
      pose.rightArmRotZ = bell * 0.6;
      pose.leftEarRotX = -bell * 0.28;
      pose.rightEarRotX = -bell * 0.28;
      break;
    case 'frontflip':
      pose.bodyRotX = ease * Math.PI * 2;
      pose.bodyPosY = bell * 0.26;
      pose.leftArmRotX = -bell * 0.65;
      pose.rightArmRotX = -bell * 0.65;
      if (p > 0.8) {
        const land = Math.sin(((p - 0.8) / 0.2) * Math.PI);
        pose.bodyScaleY = 1 - land * 0.12;
        pose.bodyScaleX = 1 + land * 0.07;
        pose.bodyScaleZ = 1 + land * 0.07;
      }
      break;
    case 'double_flip':
      pose.bodyRotX = -ease * Math.PI * 4;
      pose.bodyPosY = bell * 0.36;
      pose.leftArmRotZ = -0.85 * bell;
      pose.rightArmRotZ = 0.85 * bell;
      break;
    case 'side_cartwheel':
      pose.bodyRotZ = -ease * Math.PI * 2;
      pose.bodyPosX = Math.sin(p * Math.PI) * 0.15;
      pose.bodyPosY = bell * 0.28;
      pose.leftArmRotZ = -1.48 * bell;
      pose.rightArmRotZ = 1.48 * bell;
      pose.leftEarRotZ = 0.28 * bell;
      pose.rightEarRotZ = -0.28 * bell;
      break;
    case 'barrel':
      pose.bodyRotZ = ease * Math.PI * 2;
      pose.bodyRotX = -0.22 * bell;
      pose.bodyPosY = bell * 0.24;
      pose.leftArmRotZ = -bell * 1.25;
      pose.rightArmRotZ = bell * 1.25;
      break;
    case 'spin':
      pose.bodyRotY = ease * Math.PI * 2;
      pose.bodyPosY = bell * 0.18;
      pose.leftArmRotZ = -bell * 0.7;
      pose.rightArmRotZ = bell * 0.7;
      break;
    case 'double_spin':
      pose.bodyRotY = ease * Math.PI * 4;
      pose.bodyPosY = bell * 0.24;
      pose.leftArmRotX = -bell * 1.1;
      pose.rightArmRotX = -bell * 1.1;
      pose.leftArmRotZ = bell * 0.3;
      pose.rightArmRotZ = -bell * 0.3;
      break;
    case 'helicopter':
      pose.bodyRotY = ease * Math.PI * 6;
      pose.bodyPosY = bell * 0.34;
      pose.leftArmRotZ = -bell * 1.55;
      pose.rightArmRotZ = bell * 1.55;
      pose.leftEarRotZ = bell * 0.32;
      pose.rightEarRotZ = -bell * 0.32;
      break;
    case 'rocket':
      if (p < 0.26) {
        const coil = easeInOutCubic(p / 0.26);
        pose.bodyPosY = -coil * 0.14;
        pose.bodyScaleY = 1 - coil * 0.15;
        pose.bodyScaleX = 1 + coil * 0.08;
        pose.bodyScaleZ = pose.bodyScaleX;
      } else {
        const air = (p - 0.26) / 0.74;
        const arc = Math.sin(air * Math.PI);
        pose.bodyPosY = arc * 0.36;
        pose.bodyRotY = Math.sin(air * Math.PI * 2) * 0.25;
        pose.bodyScaleY = 1 + arc * 0.09;
        pose.bodyScaleX = 1 - arc * 0.05;
        pose.bodyScaleZ = pose.bodyScaleX;
        pose.leftArmRotZ = -arc * 1.85;
        pose.rightArmRotZ = arc * 1.85;
        pose.leftArmRotX = -arc * 0.32;
        pose.rightArmRotX = -arc * 0.32;
      }
      break;
    case 'orbit': {
      const angle = ease * Math.PI * 2;
      pose.bodyPosX = Math.sin(angle) * 0.26 * bell;
      pose.bodyPosY = (1 - Math.cos(angle)) * 0.15;
      pose.bodyPosZ = Math.cos(angle) * 0.2 - 0.2;
      pose.bodyRotZ = -Math.sin(angle) * 0.2;
      pose.leftArmRotZ = -0.85 * bell;
      pose.rightArmRotZ = 0.85 * bell;
      break;
    }
    case 'zig_dash': {
      const zig = Math.sin(p * Math.PI * 4);
      pose.bodyPosX = zig * 0.28 * bell;
      pose.bodyRotZ = -zig * 0.24 * bell;
      pose.bodyRotY = zig * 0.32 * bell;
      pose.leftArmRotZ = -0.8 * bell;
      pose.rightArmRotZ = 0.8 * bell;
      break;
    }
    case 'moon_gravity':
      pose.bodyPosY = bell * 0.28;
      pose.bodyRotX = Math.sin(p * Math.PI * 2) * 0.26;
      pose.bodyRotZ = Math.sin(p * Math.PI * 1.5) * 0.34;
      pose.headRotZ = -Math.sin(p * Math.PI * 2) * 0.22;
      pose.leftArmRotZ = -bell * (0.95 + Math.sin(p * Math.PI * 3) * 0.3);
      pose.rightArmRotZ = bell * (0.95 + Math.cos(p * Math.PI * 3) * 0.3);
      break;
    case 'superhero': {
      pose.bodyPosY = hold * 0.28;
      pose.bodyRotX = -hold * 0.16;
      pose.headRotX = -0.14 * hold;
      pose.rightArmRotZ = hold * 1.85;
      pose.rightArmRotX = -hold * 0.5;
      pose.leftArmRotZ = -hold * 0.55;
      pose.leftArmRotX = hold * 0.35;
      break;
    }
    case 'matrix_dodge': {
      const dodge = Math.sin(p * Math.PI * 2);
      pose.bodyRotX = -0.58 * hold;
      pose.bodyRotZ = dodge * 0.2 * hold;
      pose.bodyPosY = -0.1 * hold;
      pose.headRotX = 0.28 * hold;
      pose.leftArmRotZ = -1.25 * hold;
      pose.rightArmRotZ = 1.25 * hold;
      pose.leftArmRotX = -0.45 * hold;
      pose.rightArmRotX = -0.45 * hold;
      break;
    }
    case 'spring_boing': {
      const boing = Math.abs(Math.sin(p * Math.PI * 3));
      pose.bodyPosY = boing * 0.26;
      pose.bodyScaleY = 1 + (boing - 0.35) * 0.24;
      pose.bodyScaleX = 1 - (boing - 0.35) * 0.14;
      pose.bodyScaleZ = pose.bodyScaleX;
      pose.leftEarRotZ = (boing - 0.3) * 0.32;
      pose.rightEarRotZ = -(boing - 0.3) * 0.32;
      pose.leftArmRotZ = -boing * 0.7;
      pose.rightArmRotZ = boing * 0.7;
      break;
    }
    case 'back_handspring':
      pose.bodyRotX = -ease * Math.PI * 2;
      pose.bodyPosZ = -Math.sin(p * Math.PI) * 0.22;
      pose.bodyPosY = bell * 0.24;
      pose.leftArmRotZ = -1.85 * bell;
      pose.rightArmRotZ = 1.85 * bell;
      pose.leftArmRotX = -0.35 * bell;
      pose.rightArmRotX = -0.35 * bell;
      break;
    case 'tornado_drop':
      pose.bodyRotY = ease * Math.PI * 4;
      pose.bodyPosY = p < 0.7 ? Math.sin((p / 0.7) * Math.PI) * 0.28 : -Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.14;
      pose.bodyScaleY = p > 0.7 ? 0.88 : 1.04;
      pose.leftArmRotZ = -1.2 * bell;
      pose.rightArmRotZ = 1.2 * bell;
      break;

    // ================= 3. DANCE & MUSIC (17) =================
    case 'dance': {
      const sway = Math.sin(p * Math.PI * 4);
      pose.bodyRotZ = sway * 0.16 * hold;
      pose.bodyRotY = sway * 0.24 * hold;
      pose.headRotZ = -sway * 0.2 * hold;
      pose.bodyPosX = sway * 0.08 * hold;
      pose.bodyPosY = Math.abs(Math.cos(p * Math.PI * 4)) * 0.09 * hold;
      pose.leftArmRotZ = (-0.75 + sway * 0.55) * hold;
      pose.rightArmRotZ = (0.75 + sway * 0.55) * hold;
      pose.leftEarRotZ = sway * 0.22 * hold;
      pose.rightEarRotZ = sway * 0.22 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;
    }
    case 'moonwalk': {
      const slide = Math.sin(p * Math.PI * 2);
      const step = Math.abs(Math.sin(p * Math.PI * 6));
      pose.bodyPosX = slide * 0.24 * bell;
      pose.bodyPosY = step * 0.08 * bell;
      pose.bodyRotY = (slide >= 0 ? -0.38 : 0.38) * bell;
      pose.headRotY = (slide >= 0 ? 0.24 : -0.24) * bell;
      pose.leftArmRotX = Math.sin(p * Math.PI * 6) * 0.78 * bell;
      pose.rightArmRotX = -Math.sin(p * Math.PI * 6) * 0.78 * bell;
      break;
    }
    case 'discoball': {
      const beat = Math.sin(p * Math.PI * 4);
      pose.bodyPosX = beat * 0.1 * hold;
      pose.bodyPosY = Math.abs(beat) * 0.12 * hold;
      pose.bodyRotZ = beat * 0.14 * hold;
      pose.headRotZ = -beat * 0.16 * hold;
      pose.leftArmRotZ = (beat > 0 ? -1.85 : -0.3) * hold;
      pose.rightArmRotZ = (beat < 0 ? 1.85 : 0.3) * hold;
      pose.leftArmRotX = (beat > 0 ? -0.45 : 0.1) * hold;
      pose.rightArmRotX = (beat < 0 ? -0.45 : 0.1) * hold;
      break;
    }
    case 'headbang': {
      const bang = Math.max(0, Math.sin(p * Math.PI * 6));
      pose.headRotX = (-0.12 + bang * 0.54) * hold;
      pose.bodyRotX = bang * 0.16 * hold;
      pose.leftArmRotZ = -1.65 * hold;
      pose.rightArmRotZ = 1.65 * hold;
      pose.leftArmRotX = -0.45 * hold;
      pose.rightArmRotX = -0.45 * hold;
      pose.leftEarRotX = bang * 0.32 * hold;
      pose.rightEarRotX = bang * 0.32 * hold;
      break;
    }
    case 'robot_dance': {
      const stepIdx = Math.floor(p * 6);
      const sharp = stepIdx % 2 === 0 ? 1 : -1;
      pose.headRotY = sharp * 0.38 * hold;
      pose.bodyRotZ = -sharp * 0.12 * hold;
      pose.leftArmRotZ = (stepIdx % 3 === 0 ? -1.5 : -0.45) * hold;
      pose.rightArmRotZ = (stepIdx % 3 === 1 ? 1.5 : 0.45) * hold;
      pose.leftArmRotX = (stepIdx % 2 === 0 ? -1.15 : -0.2) * hold;
      pose.rightArmRotX = (stepIdx % 2 === 1 ? -1.15 : -0.2) * hold;
      break;
    }
    case 'floss_groove': {
      const sw = Math.sin(p * Math.PI * 8);
      pose.bodyPosX = sw * 0.1 * hold;
      pose.headRotZ = -sw * 0.14 * hold;
      pose.leftArmRotZ = (-0.65 + sw * 0.5) * hold;
      pose.rightArmRotZ = (0.65 + sw * 0.5) * hold;
      pose.leftArmRotX = sw * 0.72 * hold;
      pose.rightArmRotX = sw * 0.72 * hold;
      break;
    }
    case 'salsa_spin':
      pose.bodyRotY = ease * Math.PI * 2;
      pose.headRotZ = Math.sin(p * Math.PI * 4) * 0.16 * hold;
      pose.leftArmRotZ = -1.35 * hold;
      pose.rightArmRotZ = 1.78 * hold;
      pose.rightArmRotX = -0.5 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;
    case 'dab':
      pose.bodyRotY = -0.28 * hold;
      pose.headRotY = 0.45 * hold;
      pose.headRotX = 0.34 * hold;
      pose.headRotZ = 0.24 * hold;
      pose.bodyPosY = hold * 0.1;
      pose.leftArmRotZ = -1.75 * hold;
      pose.rightArmRotZ = -0.35 * hold;
      pose.rightArmRotX = -1.2 * hold;
      break;
    case 'double_dab': {
      const side = p < 0.5 ? 1 : -1;
      const localEnv = Math.sin(((p % 0.5) / 0.5) * Math.PI);
      pose.headRotY = side * 0.45 * localEnv;
      pose.headRotX = 0.34 * localEnv;
      pose.leftArmRotZ = (side > 0 ? -1.7 : 0.35) * localEnv;
      pose.rightArmRotZ = (side > 0 ? -0.35 : 1.7) * localEnv;
      pose.leftArmRotX = (side > 0 ? 0 : -1.15) * localEnv;
      pose.rightArmRotX = (side > 0 ? -1.15 : 0) * localEnv;
      break;
    }
    case 'dj_scratch': {
      const scratch = Math.sin(p * Math.PI * 10);
      pose.headRotZ = -0.26 * hold;
      pose.headRotY = 0.18 * hold;
      pose.leftArmRotZ = -1.82 * hold;
      pose.leftArmRotX = -0.4 * hold;
      pose.rightArmRotX = (-0.98 + scratch * 0.35) * hold;
      pose.rightArmRotZ = (0.35 + scratch * 0.25) * hold;
      pose.rightEarRotZ = -0.22 * hold;
      break;
    }
    case 'sing_opera': {
      const vibrato = Math.sin(p * Math.PI * 12) * 0.04;
      pose.headRotX = -0.26 * hold + vibrato;
      pose.bodyPosY = hold * 0.08;
      pose.leftArmRotZ = -1.2 * hold;
      pose.rightArmRotZ = 1.2 * hold;
      pose.leftArmRotX = -0.82 * hold;
      pose.rightArmRotX = -0.82 * hold;
      pose.leftEarRotZ = 0.22 * hold;
      pose.rightEarRotZ = -0.22 * hold;
      pose.mouthScaleY = 1 + (0.45 + Math.sin(p * Math.PI * 8) * 0.15) * hold;
      pose.mouthScaleX = 0.9;
      applyEyeMood(pose, 'happy', hold);
      break;
    }
    case 'beatbox': {
      const beat = Math.abs(Math.sin(p * Math.PI * 8));
      pose.headRotX = beat * 0.22 * hold;
      pose.bodyPosY = beat * 0.08 * hold;
      pose.rightArmRotX = -1.28 * hold;
      pose.rightArmRotZ = -0.3 * hold;
      pose.leftArmRotZ = -0.78 * hold;
      pose.leftEarRotZ = beat * 0.2 * hold;
      pose.rightEarRotZ = -beat * 0.2 * hold;
      pose.mouthScaleY = 1 + beat * 0.45 * hold;
      break;
    }
    case 'ballet_twirl':
      pose.bodyRotY = ease * Math.PI * 2;
      pose.bodyPosY = bell * 0.18;
      pose.leftArmRotZ = -1.88 * bell;
      pose.rightArmRotZ = 1.88 * bell;
      pose.leftArmRotX = -0.35 * bell;
      pose.rightArmRotX = -0.35 * bell;
      pose.headRotZ = 0.16 * bell;
      applyEyeMood(pose, 'happy', bell);
      break;
    case 'hype_hop': {
      const hop = Math.abs(Math.sin(p * Math.PI * 4));
      pose.bodyPosY = hop * 0.2 * hold;
      pose.headRotX = Math.sin(p * Math.PI * 4) * 0.18 * hold;
      pose.leftArmRotZ = -1.45 * hold;
      pose.rightArmRotZ = 1.45 * hold;
      pose.leftArmRotX = (-0.4 - hop * 0.5) * hold;
      pose.rightArmRotX = (-0.4 - (1 - hop) * 0.5) * hold;
      break;
    }
    case 'shuffle_step': {
      const sh = Math.sin(p * Math.PI * 6);
      pose.bodyPosX = sh * 0.18 * hold;
      pose.bodyPosY = Math.abs(sh) * 0.1 * hold;
      pose.bodyRotZ = -sh * 0.12 * hold;
      pose.leftArmRotX = sh * 0.55 * hold;
      pose.rightArmRotX = -sh * 0.55 * hold;
      break;
    }
    case 'air_guitar': {
      const strum = Math.sin(p * Math.PI * 12);
      pose.bodyRotZ = -0.15 * hold;
      pose.headRotZ = 0.22 * hold;
      pose.headRotX = Math.sin(p * Math.PI * 4) * 0.16 * hold;
      pose.leftArmRotZ = -0.95 * hold;
      pose.leftArmRotX = -1.05 * hold;
      pose.rightArmRotX = (-1.1 + strum * 0.35) * hold;
      pose.rightArmRotZ = (-0.15 + strum * 0.18) * hold;
      pose.mouthScaleY = 1 + 0.32 * hold;
      break;
    }
    case 'conductor': {
      const swL = Math.sin(p * Math.PI * 4);
      const swR = Math.cos(p * Math.PI * 4);
      pose.headRotY = swL * 0.22 * hold;
      pose.headRotX = swR * 0.15 * hold;
      pose.leftArmRotZ = (-1.1 + swL * 0.52) * hold;
      pose.rightArmRotZ = (1.1 + swR * 0.52) * hold;
      pose.leftArmRotX = (-0.8 + swR * 0.35) * hold;
      pose.rightArmRotX = (-0.8 + swL * 0.35) * hold;
      break;
    }

    // ================= 4. EXPRESSIONS & MOODS (18) =================
    case 'wink_tilt':
      pose.headRotZ = 0.26 * hold;
      pose.headRotY = -0.2 * hold;
      pose.bodyPosY = hold * 0.08;
      pose.rightArmRotZ = 1.55 * hold;
      pose.rightArmRotX = -0.45 * hold;
      pose.leftArmRotZ = -0.3 * hold;
      applyEyeMood(pose, 'wink', hold, 'right');
      pose.cheekScale = 1 + 0.08 * hold;
      break;
    case 'double_wink': {
      const firstHalf = p < 0.5;
      const winkEnv = firstHalf
        ? Math.sin((p / 0.5) * Math.PI)
        : Math.sin(((p - 0.5) / 0.5) * Math.PI);
      pose.headRotZ = (firstHalf ? 0.24 : -0.24) * winkEnv;
      pose.leftArmRotZ = (firstHalf ? -1.45 : -0.3) * winkEnv;
      pose.rightArmRotZ = (firstHalf ? 0.3 : 1.45) * winkEnv;
      pose.leftEarRotZ = (firstHalf ? 0.24 : -0.1) * winkEnv;
      pose.rightEarRotZ = (firstHalf ? 0.1 : -0.24) * winkEnv;
      applyEyeMood(pose, 'wink', winkEnv, firstHalf ? 'left' : 'right');
      break;
    }
    case 'laugh': {
      const cackle = Math.abs(Math.sin(p * Math.PI * 6));
      pose.bodyPosY = cackle * 0.14 * hold;
      pose.headRotX = (-0.22 + Math.sin(p * Math.PI * 12) * 0.12) * hold;
      pose.bodyRotZ = Math.sin(p * Math.PI * 6) * 0.1 * hold;
      pose.leftArmRotZ = (-0.55 - cackle * 0.45) * hold;
      pose.rightArmRotZ = (0.55 + cackle * 0.45) * hold;
      pose.leftArmRotX = -0.85 * hold;
      pose.rightArmRotX = -0.85 * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.mouthScaleY = 1 + (0.32 + cackle * 0.2) * hold;
      break;
    }
    case 'giggle': {
      const gig = Math.sin(p * Math.PI * 10);
      pose.headRotZ = 0.2 * hold;
      pose.headRotY = gig * 0.1 * hold;
      pose.rightArmRotZ = 0.45 * hold;
      pose.rightArmRotX = -1.35 * hold;
      pose.leftArmRotZ = -0.25 * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.cheekScale = 1 + 0.09 * hold;
      break;
    }
    case 'love_sway': {
      const figX = Math.sin(p * Math.PI * 2);
      const figY = Math.sin(p * Math.PI * 4);
      pose.bodyPosX = figX * 0.12 * hold;
      pose.bodyPosY = figY * 0.07 * hold + hold * 0.06;
      pose.headRotZ = figX * 0.26 * hold;
      pose.headRotY = -figX * 0.2 * hold;
      pose.leftArmRotX = -1.25 * hold;
      pose.rightArmRotX = -1.25 * hold;
      pose.leftArmRotZ = 0.32 * hold;
      pose.rightArmRotZ = -0.32 * hold;
      pose.leftEarRotZ = figX * 0.22 * hold;
      pose.rightEarRotZ = -figX * 0.22 * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.cheekScale = 1 + 0.1 * hold;
      break;
    }
    case 'shy': {
      const wiggle = Math.sin(p * Math.PI * 3);
      pose.headRotY = wiggle * 0.36 * hold;
      pose.headRotX = 0.22 * hold;
      pose.bodyRotZ = -wiggle * 0.08 * hold;
      pose.leftArmRotX = -1.2 * hold;
      pose.rightArmRotX = -1.2 * hold;
      pose.leftArmRotZ = 0.34 * hold;
      pose.rightArmRotZ = -0.34 * hold;
      pose.leftEarRotZ = -0.24 * hold;
      pose.rightEarRotZ = 0.24 * hold;
      pose.cheekScale = 1 + 0.11 * hold;
      break;
    }
    case 'shock': {
      const jitter = p > 0.2 && p < 0.75 ? Math.sin(p * Math.PI * 16) * 0.05 : 0;
      pose.bodyPosY = bell * 0.26;
      pose.bodyPosX = jitter;
      pose.headRotX = -bell * 0.24;
      pose.leftArmRotZ = -bell * 1.55;
      pose.rightArmRotZ = bell * 1.55;
      pose.leftArmRotX = -bell * 0.55;
      pose.rightArmRotX = -bell * 0.55;
      pose.leftEarRotZ = 0.32 * bell;
      pose.rightEarRotZ = -0.32 * bell;
      applyEyeMood(pose, 'wide', bell);
      pose.mouthScaleY = 1 + bell * 0.45;
      break;
    }
    case 'mind_blown': {
      if (p < 0.42) {
        const build = easeInOutCubic(p / 0.42);
        pose.leftArmRotZ = -1.78 * build;
        pose.rightArmRotZ = 1.78 * build;
        pose.leftArmRotX = -0.5 * build;
        pose.rightArmRotX = -0.5 * build;
      } else {
        const boom = Math.sin(((p - 0.42) / 0.58) * Math.PI);
        pose.headRotX = -0.26 * boom;
        pose.bodyPosY = 0.22 * boom;
        pose.leftArmRotZ = -1.96 * boom;
        pose.rightArmRotZ = 1.96 * boom;
        pose.leftArmRotX = -0.35 * boom;
        pose.rightArmRotX = -0.35 * boom;
        pose.leftEarRotZ = 0.36 * boom;
        pose.rightEarRotZ = -0.36 * boom;
        applyEyeMood(pose, 'wide', boom);
        pose.mouthScaleY = 1 + 0.4 * boom;
      }
      break;
    }
    case 'sleepy': {
      if (p < 0.72) {
        const yawn = Math.sin((p / 0.72) * Math.PI);
        pose.headRotX = -yawn * 0.25;
        pose.headRotZ = yawn * 0.16;
        pose.leftArmRotZ = -yawn * 1.65;
        pose.rightArmRotZ = yawn * 1.65;
        pose.leftArmRotX = -yawn * 0.45;
        pose.rightArmRotX = -yawn * 0.45;
        pose.leftEarRotZ = -0.22 * yawn;
        pose.rightEarRotZ = 0.22 * yawn;
        pose.leftEyeScaleY = 1 - 0.72 * yawn;
        pose.rightEyeScaleY = 1 - 0.72 * yawn;
        pose.mouthScaleY = 1 + yawn * 0.38;
      } else {
        const settle = Math.sin(((p - 0.72) / 0.28) * Math.PI);
        pose.headRotX = 0.18 * settle;
        pose.leftEarRotX = 0.22 * settle;
        pose.rightEarRotX = 0.22 * settle;
      }
      break;
    }
    case 'nap_nod': {
      if (p < 0.75) {
        const droop = easeInOutCubic(p / 0.75);
        pose.headRotX = droop * 0.46 + Math.sin(p * Math.PI * 6) * 0.08;
        pose.headRotZ = droop * 0.16;
        pose.leftEarRotZ = -0.24 * droop;
        pose.rightEarRotZ = 0.24 * droop;
        pose.leftEarRotX = 0.26 * droop;
        pose.rightEarRotX = 0.26 * droop;
        pose.leftEyeScaleY = 1 - 0.78 * droop;
        pose.rightEyeScaleY = 1 - 0.78 * droop;
      } else {
        const wake = Math.sin(((p - 0.75) / 0.25) * Math.PI);
        pose.headRotX = -0.2 * wake;
        pose.bodyPosY = 0.16 * wake;
        pose.leftArmRotZ = -1.25 * wake;
        pose.rightArmRotZ = 1.25 * wake;
        pose.leftEarRotZ = 0.28 * wake;
        pose.rightEarRotZ = -0.28 * wake;
        applyEyeMood(pose, 'wide', wake);
      }
      break;
    }
    case 'angry_puff': {
      const stomp = Math.abs(Math.sin(p * Math.PI * 4));
      pose.bodyPosY = stomp * 0.08 * hold;
      pose.bodyScaleX = 1 + 0.07 * hold;
      pose.bodyScaleY = 1 + 0.03 * hold;
      pose.headRotX = 0.26 * hold;
      pose.headRotY = Math.sin(p * Math.PI * 4) * 0.14 * hold;
      pose.leftArmRotX = -1.05 * hold;
      pose.rightArmRotX = -1.05 * hold;
      pose.leftArmRotZ = -0.25 * hold;
      pose.rightArmRotZ = 0.25 * hold;
      pose.leftEarRotX = -0.28 * hold;
      pose.rightEarRotX = -0.28 * hold;
      pose.mouthScaleY = 1 - 0.2 * hold;
      break;
    }
    case 'cry_dramatic': {
      const sob = Math.sin(p * Math.PI * 8);
      pose.headRotX = 0.24 * hold;
      pose.headRotZ = sob * 0.12 * hold;
      pose.leftArmRotZ = -1.35 * hold;
      pose.rightArmRotZ = 1.35 * hold;
      pose.leftArmRotX = (-1.15 + sob * 0.2) * hold;
      pose.rightArmRotX = (-1.15 - sob * 0.2) * hold;
      pose.leftEarRotZ = -0.26 * hold;
      pose.rightEarRotZ = 0.26 * hold;
      pose.leftEarRotX = 0.22 * hold;
      pose.rightEarRotX = 0.22 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;
    }
    case 'confused': {
      pose.headRotZ = 0.34 * hold;
      pose.headRotY = -0.22 * hold;
      pose.rightArmRotZ = 1.78 * hold;
      pose.rightArmRotX = (-0.42 + Math.sin(p * Math.PI * 6) * 0.12) * hold;
      pose.leftArmRotZ = -0.35 * hold;
      pose.leftEarRotZ = 0.28 * hold;
      pose.rightEarRotZ = 0.18 * hold;
      break;
    }
    case 'thinking': {
      pose.headRotZ = -0.18 * hold;
      pose.headRotX = -0.14 * hold;
      pose.headRotY = 0.18 * hold;
      pose.rightArmRotZ = -0.22 * hold;
      pose.rightArmRotX = -1.38 * hold;
      pose.leftArmRotZ = -0.25 * hold;
      pose.leftEarRotZ = Math.sin(p * Math.PI * 6) * 0.18 * hold;
      pose.rightEarRotZ = -0.24 * hold;
      break;
    }
    case 'proud_smug':
      pose.headRotX = -0.2 * hold;
      pose.headRotY = -0.24 * hold;
      pose.headRotZ = 0.14 * hold;
      pose.leftArmRotZ = -0.65 * hold;
      pose.rightArmRotZ = 0.65 * hold;
      pose.leftArmRotX = -0.45 * hold;
      pose.rightArmRotX = -0.45 * hold;
      pose.leftEarRotZ = 0.24 * hold;
      pose.rightEarRotZ = -0.24 * hold;
      applyEyeMood(pose, 'wink', hold, 'left');
      break;
    case 'excited': {
      const vib = Math.sin(p * Math.PI * 12);
      pose.bodyPosY = Math.abs(Math.sin(p * Math.PI * 4)) * 0.18 * hold;
      pose.headRotZ = vib * 0.1 * hold;
      pose.leftArmRotZ = (-1.45 + vib * 0.3) * hold;
      pose.rightArmRotZ = (1.45 - vib * 0.3) * hold;
      pose.leftArmRotX = -0.4 * hold;
      pose.rightArmRotX = -0.4 * hold;
      pose.leftEarRotZ = vib * 0.24 * hold;
      pose.rightEarRotZ = -vib * 0.24 * hold;
      applyEyeMood(pose, 'wide', hold);
      pose.mouthScaleY = 1 + 0.3 * hold;
      break;
    }
    case 'dizzy': {
      const ang = p * Math.PI * 4;
      pose.headRotZ = Math.sin(ang) * 0.32 * hold;
      pose.headRotX = Math.cos(ang) * 0.22 * hold;
      pose.bodyRotZ = Math.sin(ang) * 0.14 * hold;
      pose.leftArmRotZ = (-0.7 + Math.sin(ang) * 0.4) * hold;
      pose.rightArmRotZ = (0.7 + Math.cos(ang) * 0.4) * hold;
      pose.leftEarRotZ = Math.sin(ang) * 0.3 * hold;
      pose.rightEarRotZ = Math.cos(ang) * 0.3 * hold;
      break;
    }
    case 'facepalm':
      pose.headRotX = 0.28 * hold;
      pose.headRotY = Math.sin(p * Math.PI * 4) * 0.16 * hold;
      pose.rightArmRotZ = 0.35 * hold;
      pose.rightArmRotX = -1.48 * hold;
      pose.leftArmRotZ = -0.25 * hold;
      pose.leftEarRotX = 0.24 * hold;
      pose.rightEarRotX = 0.24 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;

    // ================= 5. PLAYFUL & ACTIONS (16) =================
    case 'peek':
      if (p < 0.48) {
        const hide = easeInOutCubic(p / 0.48);
        pose.bodyPosY = -hide * 0.28;
        pose.headRotX = hide * 0.28;
        pose.leftArmRotZ = -hide * 1.45;
        pose.rightArmRotZ = hide * 1.45;
        pose.leftArmRotX = -hide * 1.05;
        pose.rightArmRotX = -hide * 1.05;
      } else {
        const pop = Math.sin(((p - 0.48) / 0.52) * Math.PI);
        pose.bodyPosY = pop * 0.2;
        pose.mouthScaleY = 1 + pop * 0.3;
        pose.leftArmRotZ = -pop * 1.65;
        pose.rightArmRotZ = pop * 1.65;
        pose.leftEarRotZ = pop * 0.25;
        pose.rightEarRotZ = -pop * 0.25;
        applyEyeMood(pose, 'wide', pop);
      }
      break;
    case 'peek_left': {
      pose.bodyPosX = -hold * 0.28;
      pose.bodyRotZ = 0.22 * hold;
      pose.headRotY = 0.38 * hold;
      pose.rightArmRotZ = hold * 1.15;
      pose.rightArmRotX = -hold * 0.45;
      pose.leftEarRotZ = 0.2 * hold;
      applyEyeMood(pose, 'wide', hold);
      break;
    }
    case 'peek_right': {
      pose.bodyPosX = hold * 0.28;
      pose.bodyRotZ = -0.22 * hold;
      pose.headRotY = -0.38 * hold;
      pose.leftArmRotZ = -hold * 1.15;
      pose.leftArmRotX = -hold * 0.45;
      pose.rightEarRotZ = -0.2 * hold;
      applyEyeMood(pose, 'wide', hold);
      break;
    }
    case 'peek_top':
      pose.bodyPosY = -0.26 * hold + (p > 0.45 ? 0.14 * Math.sin(((p - 0.45) / 0.55) * Math.PI) : 0);
      pose.headRotX = -0.18 * hold;
      pose.leftArmRotZ = -1.35 * hold;
      pose.rightArmRotZ = 1.35 * hold;
      pose.leftEarRotZ = 0.24 * hold;
      pose.rightEarRotZ = -0.24 * hold;
      applyEyeMood(pose, 'wide', hold);
      break;
    case 'nod': {
      const nodWave = Math.max(0, Math.sin(p * Math.PI * 4));
      pose.headRotX = nodWave * 0.42;
      pose.bodyPosY = -nodWave * 0.04;
      pose.leftEarRotX = nodWave * 0.24;
      pose.rightEarRotX = nodWave * 0.24;
      pose.leftArmRotX = -nodWave * 0.35;
      pose.rightArmRotX = -nodWave * 0.35;
      applyEyeMood(pose, 'happy', nodWave);
      break;
    }
    case 'headshake': {
      const shake = Math.sin(p * Math.PI * 6);
      pose.headRotY = shake * 0.48 * hold;
      pose.headRotZ = -shake * 0.1 * hold;
      pose.leftArmRotZ = -0.8 * hold;
      pose.rightArmRotZ = 0.8 * hold;
      pose.leftArmRotX = -0.5 * hold;
      pose.rightArmRotX = -0.5 * hold;
      pose.leftEarRotZ = shake * 0.2 * hold;
      pose.rightEarRotZ = shake * 0.2 * hold;
      break;
    }
    case 'shrug':
      pose.headRotZ = 0.22 * hold;
      pose.bodyPosY = 0.06 * hold;
      pose.leftArmRotZ = -1.25 * hold;
      pose.rightArmRotZ = 1.25 * hold;
      pose.leftArmRotX = -0.6 * hold;
      pose.rightArmRotX = -0.6 * hold;
      pose.leftEarRotZ = 0.22 * hold;
      pose.rightEarRotZ = -0.22 * hold;
      pose.mouthScaleX = 0.9;
      break;
    case 'cheer': {
      const hops = Math.abs(Math.sin(p * Math.PI * 2));
      pose.bodyPosY = hops * 0.22;
      pose.leftArmRotZ = -hops * 1.88;
      pose.rightArmRotZ = hops * 1.88;
      pose.leftArmRotX = -hops * 0.35;
      pose.rightArmRotX = -hops * 0.35;
      pose.bodyScaleY = 1 + hops * 0.06;
      pose.bodyScaleX = 1 - hops * 0.03;
      applyEyeMood(pose, 'happy', hops);
      pose.mouthScaleY = 1 + 0.28 * hops;
      break;
    }
    case 'clap': {
      const clapWave = Math.abs(Math.sin(p * Math.PI * 5));
      pose.bodyPosY = clapWave * 0.06 * hold;
      pose.leftArmRotX = -1.28 * hold;
      pose.rightArmRotX = -1.28 * hold;
      pose.leftArmRotZ = (-0.55 + clapWave * 0.85) * hold;
      pose.rightArmRotZ = (0.55 - clapWave * 0.85) * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.mouthScaleY = 1 + 0.2 * hold;
      break;
    }
    case 'victory': {
      const pump = Math.abs(Math.sin(p * Math.PI * 2));
      pose.bodyPosY = pump * 0.28;
      pose.bodyRotY = ease * Math.PI * 2;
      pose.leftArmRotZ = -1.85 * bell;
      pose.rightArmRotZ = 1.85 * bell;
      pose.leftArmRotX = -0.35 * bell;
      pose.rightArmRotX = -0.35 * bell;
      applyEyeMood(pose, 'happy', bell);
      pose.mouthScaleY = 1 + 0.28 * bell;
      break;
    }
    case 'karate': {
      const chop = Math.sin(p * Math.PI * 4);
      pose.bodyPosY = bell * 0.14;
      pose.bodyRotY = Math.sin(p * Math.PI * 2) * 0.45 * bell;
      pose.leftArmRotX = -Math.max(0, chop) * 1.45 * bell;
      pose.rightArmRotX = -Math.max(0, -chop) * 1.45 * bell;
      pose.leftArmRotZ = -0.5 * bell;
      pose.rightArmRotZ = 0.5 * bell;
      break;
    }
    case 'boxing': {
      const jab = Math.sin(p * Math.PI * 6);
      pose.bodyPosX = Math.sin(p * Math.PI * 3) * 0.12 * hold;
      pose.bodyRotY = jab * 0.32 * hold;
      pose.headRotX = 0.12 * hold;
      pose.leftArmRotX = (-0.85 - Math.max(0, jab) * 0.8) * hold;
      pose.rightArmRotX = (-0.85 - Math.max(0, -jab) * 0.8) * hold;
      pose.leftArmRotZ = -0.25 * hold;
      pose.rightArmRotZ = 0.25 * hold;
      break;
    }
    case 'flex_strong':
      pose.bodyScaleX = 1 + 0.08 * hold;
      pose.bodyScaleY = 1 + 0.05 * hold;
      pose.headRotY = -0.18 * hold;
      pose.headRotZ = 0.12 * hold;
      pose.leftArmRotZ = -1.75 * hold;
      pose.rightArmRotZ = 1.75 * hold;
      pose.leftArmRotY = -0.45 * hold;
      pose.rightArmRotY = 0.45 * hold;
      pose.leftArmRotX = -0.35 * hold;
      pose.rightArmRotX = -0.35 * hold;
      applyEyeMood(pose, 'wink', hold, 'right');
      break;
    case 'pointing':
      pose.bodyPosY = bell * 0.16;
      pose.headRotX = -0.16 * hold;
      pose.headRotZ = 0.1 * hold;
      pose.rightArmRotZ = 1.96 * hold;
      pose.rightArmRotX = -0.45 * hold;
      pose.leftArmRotZ = -0.25 * hold;
      pose.leftEarRotZ = 0.22 * hold;
      pose.rightEarRotZ = -0.22 * hold;
      applyEyeMood(pose, 'wide', hold);
      pose.mouthScaleY = 1 + 0.24 * hold;
      break;
    case 'talk_chat': {
      const chatter = Math.abs(Math.sin(p * Math.PI * 10));
      pose.headRotY = Math.sin(p * Math.PI * 3) * 0.22 * hold;
      pose.headRotZ = Math.cos(p * Math.PI * 4) * 0.12 * hold;
      pose.leftArmRotX = (-0.5 - Math.sin(p * Math.PI * 5) * 0.35) * hold;
      pose.rightArmRotX = (-0.5 + Math.sin(p * Math.PI * 5) * 0.35) * hold;
      pose.leftArmRotZ = -0.35 * hold;
      pose.rightArmRotZ = 0.35 * hold;
      pose.mouthScaleY = 1 + chatter * 0.45 * hold;
      break;
    }
    case 'surprise_boo':
      if (p < 0.38) {
        const crouch = easeInOutCubic(p / 0.38);
        pose.bodyPosY = -0.22 * crouch;
        pose.bodyScaleY = 1 - 0.12 * crouch;
      } else {
        const lunge = Math.sin(((p - 0.38) / 0.62) * Math.PI);
        pose.bodyPosZ = 0.28 * lunge;
        pose.bodyPosY = 0.2 * lunge;
        pose.leftArmRotZ = -1.6 * lunge;
        pose.rightArmRotZ = 1.6 * lunge;
        pose.leftArmRotX = -0.75 * lunge;
        pose.rightArmRotX = -0.75 * lunge;
        pose.leftEarRotZ = 0.32 * lunge;
        pose.rightEarRotZ = -0.32 * lunge;
        applyEyeMood(pose, 'wide', lunge);
        pose.mouthScaleY = 1 + 0.4 * lunge;
      }
      break;

    // ================= 6. CUTE TRICKS & EARS (16) =================
    case 'ear_wiggle': {
      const wig = Math.sin(p * Math.PI * 8);
      pose.bodyPosY = Math.abs(Math.sin(p * Math.PI * 4)) * 0.14 * hold;
      pose.headRotZ = wig * 0.1 * hold;
      pose.leftEarRotZ = (0.14 + wig * 0.24) * hold;
      pose.rightEarRotZ = (-0.14 - wig * 0.24) * hold;
      pose.leftEarRotX = Math.cos(p * Math.PI * 8) * 0.24 * hold;
      pose.rightEarRotX = Math.cos(p * Math.PI * 8) * 0.24 * hold;
      pose.leftArmRotZ = -0.45 * hold;
      pose.rightArmRotZ = 0.45 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;
    }
    case 'ear_flop':
      pose.headRotZ = 0.28 * hold;
      pose.leftEarRotZ = -0.32 * hold;
      pose.rightEarRotZ = -0.26 * hold;
      pose.leftEarRotX = 0.3 * hold;
      pose.leftArmRotZ = -0.35 * hold;
      pose.rightArmRotZ = 0.35 * hold;
      break;
    case 'antenna_spark': {
      const spark = Math.sin(p * Math.PI * 10);
      pose.bodyPosY = bell * 0.2;
      pose.leftEarRotZ = spark * 0.32 * hold;
      pose.rightEarRotZ = spark * 0.32 * hold;
      pose.leftEarRotX = Math.cos(p * Math.PI * 10) * 0.32 * hold;
      pose.rightEarRotX = -Math.cos(p * Math.PI * 10) * 0.32 * hold;
      pose.leftArmRotZ = -0.95 * hold;
      pose.rightArmRotZ = 0.95 * hold;
      applyEyeMood(pose, 'wide', hold);
      break;
    }
    case 'zen': {
      pose.bodyPosY = hold * 0.26 + Math.sin(p * Math.PI * 4) * 0.03 * hold;
      pose.bodyRotY = Math.sin(p * Math.PI * 2) * 0.15;
      pose.headRotX = 0.08 * hold;
      pose.leftArmRotZ = -0.55 * hold;
      pose.rightArmRotZ = 0.55 * hold;
      pose.leftArmRotX = -0.65 * hold;
      pose.rightArmRotX = -0.65 * hold;
      pose.leftEarRotZ = 0.14 * hold;
      pose.rightEarRotZ = -0.14 * hold;
      applyEyeMood(pose, 'happy', hold);
      break;
    }
    case 'bounce': {
      const jump = Math.abs(Math.sin(p * Math.PI * 2));
      pose.bodyPosY = jump * 0.26;
      pose.bodyScaleY = 1 + (jump - 0.3) * 0.14;
      pose.bodyScaleX = 1 - (jump - 0.3) * 0.08;
      pose.bodyScaleZ = pose.bodyScaleX;
      pose.leftArmRotZ = -jump * 0.7;
      pose.rightArmRotZ = jump * 0.7;
      break;
    }
    case 'shiver': {
      const buzz = Math.sin(p * Math.PI * 12);
      pose.bodyRotZ = buzz * 0.16 * hold;
      pose.bodyPosX = buzz * 0.07 * hold;
      pose.bodyPosY = Math.abs(Math.sin(p * Math.PI * 4)) * 0.1 * hold;
      pose.leftArmRotX = -0.8 * hold;
      pose.rightArmRotX = -0.8 * hold;
      pose.leftArmRotZ = (0.2 + buzz * 0.25) * hold;
      pose.rightArmRotZ = (-0.2 - buzz * 0.25) * hold;
      break;
    }
    case 'look_around': {
      const sweep = Math.sin(p * Math.PI * 2);
      pose.headRotY = sweep * 0.48 * hold;
      pose.headRotX = Math.sin(p * Math.PI * 4) * 0.1 * hold;
      pose.rightArmRotZ = 1.85 * hold;
      pose.rightArmRotX = -0.78 * hold;
      pose.leftArmRotZ = -0.3 * hold;
      pose.leftEarRotZ = sweep * 0.2 * hold;
      pose.rightEarRotZ = sweep * 0.2 * hold;
      applyEyeMood(pose, 'wide', hold);
      break;
    }
    case 'eye_roll': {
      const rollAngle = p * Math.PI * 2;
      pose.headRotZ = Math.sin(rollAngle) * 0.28 * hold;
      pose.headRotX = (Math.cos(rollAngle) - 1) * 0.14 * hold;
      pose.headRotY = Math.sin(rollAngle) * 0.2 * hold;
      pose.leftArmRotZ = -0.85 * hold;
      pose.rightArmRotZ = 0.85 * hold;
      pose.leftEarRotZ = Math.sin(rollAngle) * 0.24 * hold;
      pose.rightEarRotZ = -Math.sin(rollAngle) * 0.24 * hold;
      pose.bodyPosY = -0.04 * bell;
      break;
    }
    case 'sneeze':
      if (p < 0.55) {
        const inhale = easeInOutCubic(p / 0.55);
        pose.headRotX = -0.35 * inhale;
        pose.bodyPosY = 0.08 * inhale;
        pose.leftArmRotZ = -0.5 * inhale;
        pose.rightArmRotZ = 0.5 * inhale;
        pose.mouthScaleY = 1 + 0.25 * inhale;
      } else {
        const achoo = Math.sin(((p - 0.55) / 0.45) * Math.PI);
        pose.headRotX = 0.48 * achoo;
        pose.bodyPosZ = 0.18 * achoo;
        pose.leftArmRotZ = -1.25 * achoo;
        pose.rightArmRotZ = 1.25 * achoo;
        pose.leftEarRotX = 0.35 * achoo;
        pose.rightEarRotX = 0.35 * achoo;
        applyEyeMood(pose, 'happy', achoo);
      }
      break;
    case 'hiccup': {
      const hic = Math.max(0, Math.sin(p * Math.PI * 6));
      pose.bodyPosY = hic * 0.14;
      pose.headRotX = -hic * 0.2;
      pose.bodyScaleY = 1 + hic * 0.08;
      pose.leftArmRotZ = -hic * 0.55;
      pose.rightArmRotZ = hic * 0.55;
      pose.leftEarRotZ = hic * 0.22;
      pose.rightEarRotZ = -hic * 0.22;
      pose.mouthScaleY = 1 + hic * 0.24;
      break;
    }
    case 'stretch':
      pose.bodyPosY = hold * 0.1;
      pose.bodyScaleY = 1 + 0.09 * hold;
      pose.bodyScaleX = 1 - 0.05 * hold;
      pose.headRotX = -0.22 * hold;
      pose.leftArmRotZ = -1.85 * hold;
      pose.rightArmRotZ = 1.85 * hold;
      pose.leftArmRotX = -0.4 * hold;
      pose.rightArmRotX = -0.4 * hold;
      pose.leftEarRotZ = 0.22 * hold;
      pose.rightEarRotZ = -0.22 * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.mouthScaleY = 1 + 0.28 * hold;
      break;
    case 'hide_shy':
      pose.headRotX = 0.18 * hold;
      pose.leftArmRotZ = 0.28 * hold;
      pose.rightArmRotZ = -0.28 * hold;
      pose.leftArmRotX = -1.48 * hold;
      pose.rightArmRotX = -1.48 * hold;
      pose.leftEarRotZ = -0.24 * hold;
      pose.rightEarRotZ = 0.24 * hold;
      pose.cheekScale = 1 + 0.1 * hold;
      break;
    case 'cover_ears':
      pose.headRotY = Math.sin(p * Math.PI * 4) * 0.22 * hold;
      pose.leftArmRotZ = -1.86 * hold;
      pose.rightArmRotZ = 1.86 * hold;
      pose.leftArmRotX = -0.4 * hold;
      pose.rightArmRotX = -0.4 * hold;
      pose.leftEarRotZ = -0.18 * hold;
      pose.rightEarRotZ = 0.18 * hold;
      break;
    case 'heart_beat': {
      const pulse = Math.pow(Math.max(0, Math.sin(p * Math.PI * 4)), 2);
      pose.bodyScaleX = 1 + pulse * 0.12;
      pose.bodyScaleY = 1 + pulse * 0.12;
      pose.bodyScaleZ = 1 + pulse * 0.12;
      pose.bodyPosY = pulse * 0.08;
      pose.leftArmRotX = -1.2 * hold;
      pose.rightArmRotX = -1.2 * hold;
      pose.leftArmRotZ = 0.28 * hold;
      pose.rightArmRotZ = -0.28 * hold;
      applyEyeMood(pose, 'happy', hold);
      pose.cheekScale = 1 + pulse * 0.1;
      break;
    }
    case 'wave_surf': {
      const surf = Math.sin(p * Math.PI * 4);
      pose.bodyRotZ = surf * 0.24 * hold;
      pose.headRotZ = -surf * 0.18 * hold;
      pose.bodyPosX = surf * 0.15 * hold;
      pose.bodyPosY = Math.abs(Math.cos(p * Math.PI * 4)) * 0.1 * hold;
      pose.leftArmRotZ = (-1.35 - surf * 0.3) * hold;
      pose.rightArmRotZ = (1.35 - surf * 0.3) * hold;
      break;
    }
    case 'party_popper': {
      const pop = Math.abs(Math.sin(p * Math.PI * 3));
      pose.bodyRotY = ease * Math.PI * 2;
      pose.bodyPosY = pop * 0.22;
      pose.leftArmRotZ = -1.85 * bell;
      pose.rightArmRotZ = 1.85 * bell;
      pose.leftArmRotX = -0.36 * bell;
      pose.rightArmRotX = -0.36 * bell;
      pose.leftEarRotZ = Math.sin(p * Math.PI * 10) * 0.28 * bell;
      pose.rightEarRotZ = -Math.sin(p * Math.PI * 10) * 0.28 * bell;
      applyEyeMood(pose, 'happy', bell);
      pose.mouthScaleY = 1 + 0.3 * bell;
      break;
    }
  }

  return pose;
}
