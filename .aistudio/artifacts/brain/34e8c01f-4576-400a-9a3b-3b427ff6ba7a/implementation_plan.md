# High-Speed Real-Time Notifications, WhatsApp-Style Dexie Sync, and Broadcast Messaging Architecture

Restore instantaneous notification delivery for messages, likes, and comments with rich sender username metadata and one-click chat navigation, while upgrading the Supabase messaging engine to use WhatsApp-style Dexie delta caching, instant optimistic deletion, and dedicated real-time broadcast channels for high-frequency chat and red double-check read receipts.

## User Review & Critical Decisions

> [!IMPORTANT]
> The architectural approach has been synthesized with your preferences confirmed during Phase 1:
> - **FCM Push & In-App Notification Delivery**: Hardened FCM token handling with instant dual-layer notification dispatch (Firebase Cloud Messaging + in-app toast banner + system notification) including the sender's display name and username tag (`@username`), with immediate deep-link navigation directly into that sender's chat dialog.
> - **Read Receipts (Seen Status)**: Powered by low-latency Supabase Realtime Broadcast channels (`chat_signal` with event `SEEN`), instantaneously rendering the crisp red double-check mark (`CheckCheck` in red) on the sender's screen without waiting for database polling or slow query round-trips.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Instant Multi-Tier Notifications**: Guarantees that whenever a user receives a message, post like, or comment, a notification fires instantly. Notification payloads carry the sender's full profile details (`sender_name`, `sender_username`, `sender_avatar`). Clicking the notification instantly routes the user into the active conversation with that contact, opening the chat window immediately.
  2. **WhatsApp-Style Dexie Incremental Caching**: Instead of querying and reloading full message history across the wire on every chat click, all existing conversation messages load in 0ms from local IndexedDB (`localDB.messages`). Only messages newer than the newest local timestamp (`created_at > lastTimestamp`) are pulled from Supabase/Firebase. Newly arrived messages are saved into Dexie and presented seamlessly.
  3. **Zero-Latency Message Deletion**: When any message is deleted (for me or for everyone, old or new), it is instantly stripped from the active UI state, purged from Dexie, removed from the database, and broadcast via the active channel so it vanishes in real-time on the counterparty's screen.
  4. **Continuous High-Frequency Messaging & Seen Ticks**: Eliminates message dropping and connection timeouts during rapid typing by utilizing Supabase WebSocket Broadcast channels for direct peer signaling, instant delivery acknowledgments, and real-time red double-check marks.

- **Target Audience / Persona**: Active users chatting rapidly across mobile web and desktop, expecting WhatsApp/Telegram-grade snappy responsiveness, zero re-fetching delay, and reliable push notifications.

- **Key Value**: Rock-solid message delivery, instant offline/cached message availability, seamless notifications that link directly to the right chat, and responsive read receipts.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Receiving a Message Notification**:
     - Contact `@john_doe` sends a message while the recipient is browsing their feed or outside that specific chat.
     - An in-app toast drops down from top-center displaying John Doe's avatar, name, `@john_doe`, message preview, and an "Open" pill button, accompanied by notification audio and vibration.
     - If the app is in the background or device lock screen, an FCM desktop/device push notification triggers with the exact same details.
     - Tapping either notification immediately navigates to `/messages?user=<sender_id>`, instantly opening John Doe's chat thread.
  2. **Opening a Conversation (WhatsApp Caching Flow)**:
     - The user taps a contact in the Messages list.
     - The chat window opens instantly (0ms blank/loading screen) showing all previously cached messages from Dexie.
     - A background delta-sync checks `supabase.from('messages').select('*').gt('created_at', lastTimestamp)`. If new messages arrived while away, they append smoothly and save into Dexie.
  3. **Rapid Continuous Messaging & Red Double-Tick Seen Receipts**:
     - Sending rapid back-to-back messages renders optimistic message bubbles with a light clock icon (`Clock`), transitioning to a single check (`Check`) upon Supabase broadcast/insert, and instantaneously switching to the vibrant red double-check (`CheckCheck className="text-red-500"`) the millisecond the recipient's viewport registers the message.
  4. **Instant Message Deletion**:
     - User long-presses or clicks the context menu on any message (sent or received) and selects "Delete".
     - The bubble evaporates immediately from the screen (smooth framer-motion exit). Both local Dexie and remote Supabase/Firebase records are purged, and a broadcast signal tells the recipient to remove the bubble without needing a manual refresh.

- **Visual Identity & Theme**:
  - Consistent with Next's clean dark/light UI:
    - *Read Receipts*: Bold red checkmarks (`text-red-500`) for read/seen, subtle muted checkmarks (`text-blue-200 opacity-60` or `text-gray-400`) for sent/delivered.
    - *Notification Banners*: Rounded 2xl cards with soft shadows, sender avatar, bold username accent, and clean action button.
    - *Chat Layout*: Smooth mobile thumb-zone layout adhering to `references/10_mobile_touch_apps.md`, with 44px touch targets and full keyboard resilience.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Channel Real-Time Engine (Broadcast + Postgres Changes)**
  - *Chosen Approach*: Use Supabase Broadcast channels (`realtimeChannel.send({ type: 'broadcast', event: 'chat_signal', ... })`) for ephemeral, time-critical signals (typing, seen receipts, deletions) combined with `postgres_changes` / dual-write for persistent messages.
  - *Why*: Postgres change events can throttle or delay under rapid back-to-back writes; Supabase Broadcast sends WebSocket frames directly to peers in <30ms, ensuring read ticks and deletion signals fire instantaneously.
  - *Alternatives Considered*: Polling database every few seconds (discarded: slow and high read cost).

- **Decision 2: Dexie Delta / Incremental Sync Strategy**
  - *Chosen Approach*: On chat initialization, retrieve all messages from Dexie indexed by `chatId`. Calculate `max(created_at)`. Execute a remote query only for `created_at > max(created_at)`.
  - *Why*: Eliminates 100-document database reloads on every conversation switch; allows 100% offline access to conversation history like WhatsApp.
  - *Alternatives Considered*: Reloading last 100 messages every time (discarded: causes UI flicker and bandwidth waste).

- **Decision 3: Global Notification Listener Resiliency**
  - *Chosen Approach*: Repair the unsubscription state leak in `useGlobalStore.ts` where unmount handlers left stale, non-null `notifUnsub` and `messageUnsub` variables, preventing listeners from ever re-subscribing on remounts. Additionally sanitize Supabase URL configuration to prevent client crash.
  - *Why*: Guarantees listeners stay active throughout the entire application lifecycle.

---

## 4. Technical Architecture & Data Strategy

### System Architecture & Communication Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Next Application Client                       │
│                                                                        │
│   ┌────────────────────────┐            ┌───────────────────────────┐  │
│   │    useGlobalStore      │            │        Messages.tsx       │  │
│   │  Global Notif Listener │            │  WhatsApp-style Chat UI   │  │
│   └───────────┬────────────┘            └─────────────┬─────────────┘  │
│               │                                       │                │
│       ┌───────┴──────┐                     ┌──────────┴──────────┐     │
│       │              │                     │                     │     │
│       ▼              ▼                     ▼                     ▼     │
│  ┌──────────┐  ┌──────────┐         ┌──────────────┐      ┌──────────┐ │
│  │ Firebase │  │ Supabase │         │ Dexie DB     │      │ Supabase │ │
│  │ Notifs & │  │ Realtime │         │ localDB      │      │ Realtime │ │
│  │ Push FCM │  │ Global   │         │ (0ms Cache)  │      │ Broadcast│ │
│  └──────────┘  └──────────┘         └──────────────┘      └──────────┘ │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
       ┌───────────────────────────────────────────────────────────┐
       │   Remote Database Layer & Supabase Realtime Server        │
       │                                                           │
       │   • Supabase Postgres 'messages' Table                    │
       │   • Supabase Broadcast Channel (`chat:${chatId}`)         │
       │   • Firebase Cloud Firestore ('notifications', 'messages')│
       │   • Firebase Cloud Messaging (FCM Push Service)           │
       └───────────────────────────────────────────────────────────┘
```

### Component & File Work Plan

1. **`src/lib/supabase.ts`**:
   - Sanitize URL constructor to handle raw project keys (`zdrubxtuxotqyasmsuqz` -> `https://zdrubxtuxotqyasmsuqz.supabase.co`).
   - Enable high-frequency broadcast events in Realtime client configuration.

2. **`src/store/useGlobalStore.ts`**:
   - Fix the unsubscription cleanup leak where `notifUnsub` and `messageUnsub` were not reset to `null` on teardown, preventing re-registration on navigation.
   - Refactor notifications listener query to avoid missing composite index crashes, sorting in-memory by timestamp.
   - Attach sender metadata (`sender_username`, `sender_name`, `sender_avatar`) directly into incoming message notification handling.
   - Guard against duplicate toasts while ensuring rapid delivery for messages, likes, and comments.

3. **`src/pages/Messages.tsx`**:
   - **Dexie Incremental Sync**:
     - Load conversation messages from `localDB.messages` first.
     - Find the most recent timestamp in the local cache.
     - If local messages exist, perform a delta query: `supabase.from('messages').select('*').gt('created_at', lastTimestamp)`. If empty, fetch the initial batch (50 messages) and save to Dexie.
     - Persist every new incoming and outgoing message into `localDB.messages` immediately.
   - **Instant Delete**:
     - Remove immediately from UI state (`setMessages`).
     - Remove immediately from Dexie (`localDB.messages.delete`).
     - Delete from Supabase and Firebase in parallel.
     - Broadcast a `DELETE_MESSAGE` event over `realtimeChannel` so the counterparty's chat removes it without refreshing.
   - **Continuous Messaging & Red Tick Seen Broadcast**:
     - When messages enter the viewport or are loaded, emit a Supabase Broadcast `chat_signal` with `{ type: 'SEEN', msgIds: [...] }`.
     - Update local state to show the red double-check (`CheckCheck className="text-red-500"`).
     - Maintain channel subscription stability with automatic keep-alive to prevent drops during rapid back-to-back messaging.

4. **`src/services/notificationService.ts`**:
   - Ensure `showInAppNotificationToast` and `showNotification` include `@${sender_username}` and correctly route to `/messages?user=${sender_id}` on click.
   - Optimize FCM token retrieval and transmission to backend notification endpoint.

5. **`src/pages/Notifications.tsx` & `src/components/Navbar.tsx`**:
   - Align notification click handlers so clicking a message notification opens the specific chat inbox view.

---

## Verification & Testing Plan

1. **Build and Type Checking**: Run `compile_applet` to verify zero TypeScript errors and proper bundle compilation.
2. **Notification Dispatch Test**:
   - Verify notifications contain `@username` in the title/body.
   - Click notification toast to verify immediate navigation to `/messages?user=<id>`.
3. **Dexie Incremental Sync Verification**:
   - Open a chat, inspect local Dexie storage to confirm all messages are cached.
   - Close and reopen the chat; verify messages appear in 0ms without full database refetch.
   - Send new messages and verify only delta queries are executed.
4. **Instant Deletion Verification**:
   - Delete an old message and a newly sent message; verify instant removal from UI, Dexie, and remote storage.
5. **Real-Time Seen & Rapid Messaging Verification**:
   - Send rapid back-to-back messages; verify all arrive without dropping.
   - Check that the red double-tick marks appear when messages are seen.
